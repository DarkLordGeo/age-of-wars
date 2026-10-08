import { ACESFilmicToneMapping, PCFShadowMap, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import type { AssetLibrary } from '../assets/AssetLibrary';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../sim/Unit';
import type { World } from '../sim/World';
import { TEAMS, type Team } from '../sim/types';
import { BaseView } from './BaseView';
import { CameraRig } from './CameraRig';
import { buildEnvironment, type Environment } from './environment';
import { PostFx } from './post';
import { ProjectileRenderer } from './ProjectileRenderer';
import { UnitView } from './UnitView';

export const TEAM_TINT: Record<Team, number> = { player: 0x2f6fdb, enemy: 0xd23a32 };

/**
 * Presentation layer. Reads the World every frame and mirrors it into a Three.js scene;
 * reacts to sim events through the bus. Never mutates the World.
 *
 * Perf notes: unit views are pooled, placeholder geometry/materials are shared, projectiles
 * are one instanced mesh, and the per-frame path allocates nothing.
 */
export class GameRenderer {
  readonly rig: CameraRig;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly views = new Map<number, UnitView>();
  private readonly freeViews = new Map<string, UnitView[]>();
  private readonly baseViews = {} as Record<Team, BaseView>;
  private readonly projectileRenderer: ProjectileRenderer;
  readonly post: PostFx;
  private readonly env: Environment;
  private world: World | null = null;
  private frame = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly assets: AssetLibrary,
    bus: EventBus,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    host.appendChild(this.renderer.domElement);

    this.env = buildEnvironment(this.scene, this.assets, this.renderer);
    this.projectileRenderer = new ProjectileRenderer(this.scene);
    this.rig = new CameraRig();
    this.post = new PostFx(this.renderer, this.scene, this.rig.camera);

    bus.on('attack', (e) => {
      if (e.sourceKind === 'unit') this.views.get(e.sourceId)?.triggerAttack();
      else this.baseViews[e.team]?.triggerRecoil(e.sourceId);
    });
    // No hit/death effects yet (removed on request); the camp itself stays still on hits.

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Bind to a (new) world, recycling every unit view of the previous one. */
  setWorld(world: World): void {
    for (const view of this.views.values()) this.release(view);
    this.views.clear();
    this.world = world;
    for (const team of TEAMS) {
      const base = world.bases[team];
      if (!this.baseViews[team]) {
        this.baseViews[team] = new BaseView(this.assets, TEAM_TINT[team], base);
        this.scene.add(this.baseViews[team].root);
      } else {
        this.baseViews[team].rebind(base);
      }
    }
    this.rig.snapTo(0);
  }

  /** `frozen`: the match is paused; units hold their pose while the scenery keeps animating. */
  render(dt: number, frozen = false): void {
    const world = this.world;
    if (!world) return;
    this.rig.update(dt, world.units.length > 0 ? world.frontlineX : null);
    this.syncViews(world);
    for (const view of this.views.values()) view.update(frozen ? 0 : dt, this.rig.camera);
    for (const team of TEAMS) this.baseViews[team].update(dt);
    this.projectileRenderer.update(world.projectiles);
    this.env.update(dt, this.rig.camera);
    this.post.render(dt);
  }

  private syncViews(world: World): void {
    const stamp = ++this.frame;
    for (const unit of world.units) {
      let view = this.views.get(unit.id);
      if (!view) {
        view = this.acquire(unit);
        this.views.set(unit.id, view);
      }
      view.seen = stamp;
    }
    for (const [id, view] of this.views) {
      if (view.seen !== stamp) {
        this.release(view);
        this.views.delete(id);
      }
    }
  }

  private acquire(unit: Unit): UnitView {
    const key = `${unit.def.modelKey}|${unit.team}`;
    let view = this.freeViews.get(key)?.pop();
    if (!view) {
      view = new UnitView(
        key,
        this.assets.instantiate(unit.def.modelKey, TEAM_TINT[unit.team]),
        this.assets.clipsFor(unit.def.modelKey),
      );
    }
    view.bind(unit);
    this.scene.add(view.root);
    return view;
  }

  private release(view: UnitView): void {
    this.scene.remove(view.root);
    let list = this.freeViews.get(view.poolKey);
    if (!list) this.freeViews.set(view.poolKey, (list = []));
    list.push(view);
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.rig.resize(w, h);
    this.post.setSize(w, h);
  }
}
