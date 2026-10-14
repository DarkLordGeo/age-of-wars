import { ACESFilmicToneMapping, Box3, PCFShadowMap, Raycaster, Scene, SRGBColorSpace, Vector2, WebGLRenderer } from 'three';
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
import { landStone, StoneDebris, StoneDebrisMesh } from './StoneDebris';
import { STONE_DEBRIS } from '../config/debris';
import { terrainHeight } from './terrain';
import { combatTarget, UnitView } from './UnitView';
import { pickHovered } from './hover';
import { bindRewardPopups, RewardPopups, RewardPopupsView } from './RewardPopups';

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
  /** Set by the game: a unit's melee swing started (swing whoosh). */
  onSwing: ((unit: Unit) => void) | null = null;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly views = new Map<number, UnitView>();
  private readonly freeViews = new Map<string, UnitView[]>();
  private readonly baseViews = {} as Record<Team, BaseView>;
  private readonly projectileRenderer: ProjectileRenderer;
  /** Sling stones that came down stay on the field (capped, config/debris.ts). */
  readonly debris = new StoneDebris(terrainHeight);
  private readonly debrisMesh: StoneDebrisMesh;
  /** Pointer over the battlefield (normalized device coordinates), and the unit it hovers. */
  private readonly pointer = new Vector2();
  private pointerIn = false;
  private hovered: UnitView | null = null;
  private readonly raycaster = new Raycaster();
  /** "Coin N +" indicators where an enemy died and the player was paid. */
  readonly rewards = new RewardPopups();
  private readonly rewardsView: RewardPopupsView;
  private size = { w: 1, h: 1 };
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
    this.debrisMesh = new StoneDebrisMesh(this.scene, STONE_DEBRIS.max + Math.max(8, Math.ceil(STONE_DEBRIS.max * 0.1)));
    this.rig = new CameraRig();
    this.rig.attachInput(this.renderer.domElement);
    // Hover: passive tracking only (no preventDefault), so dragging and HUD clicks are untouched.
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.pointerIn = true;
    });
    canvas.addEventListener('pointerleave', () => (this.pointerIn = false));
    this.rewardsView = new RewardPopupsView(host);
    bindRewardPopups(bus, this.rewards, (id) => {
      const v = this.views.get(id);
      if (!v) return null;
      const p = v.root.position;
      return { x: p.x, y: p.y + v.unit.def.height + 0.35, z: p.z };
    });
    this.post = new PostFx(this.renderer, this.scene, this.rig.camera);

    bus.on('attack', (e) => {
      if (e.sourceKind === 'unit') this.views.get(e.sourceId)?.triggerAttack(e.mode);
      else this.baseViews[e.team]?.triggerRecoil(e.sourceId);
    });
    bus.on('hit', (e) => {
      if (e.targetKind === 'unit') this.views.get(e.targetId)?.triggerHit();
    });
    bus.on('projectileImpact', (e) => void landStone(this.debris, e, this.world?.content.projectiles[e.defId], terrainHeight));
    // No hit/death particle effects yet (removed on request); the camp itself stays still on hits.

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Bind to a (new) world, recycling every unit view of the previous one. */
  setWorld(world: World): void {
    for (const view of this.views.values()) this.release(view);
    this.views.clear();
    this.setHovered(null);
    this.debris.clear();
    this.rewards.clear();
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
    // Default gameplay framing: ~2/3 of the player's cave in view (CAMERA.zoom.caveVisible).
    const home = this.baseViews.player.root;
    home.updateMatrixWorld(true);
    this.rig.setFraming(new Box3().setFromObject(home.getObjectByName('CaveBase') ?? home));
    this.rig.snapTo(0);
  }

  /** `frozen`: the match is paused; units hold their pose while the scenery keeps animating. */
  render(dt: number, frozen = false): void {
    const world = this.world;
    if (!world) return;
    this.rig.update(dt, world.units.length > 0 ? world.frontlineX : null);
    this.syncViews(world);
    const drawnAt = (u: Unit) => this.views.get(u.id)?.root.position;
    for (const view of this.views.values()) view.setTarget(combatTarget(world, view.unit, drawnAt));
    this.updateHover();
    for (const view of this.views.values()) view.update(frozen ? 0 : dt, this.rig.camera);
    for (const team of TEAMS) this.baseViews[team].update(dt);
    this.projectileRenderer.update(world.projectiles);
    this.debris.step(frozen ? 0 : dt);
    this.rewards.update(frozen ? 0 : dt);
    this.rewardsView.sync(this.rewards, this.rig.camera, this.size.w, this.size.h);
    this.debrisMesh.sync(this.debris);
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
        {
          variants: this.assets.clipVariantsFor(unit.def.modelKey),
          strike: this.assets.strikeTimeFor(unit.def.modelKey),
          meleeStrike: this.assets.meleeStrikeFor(unit.def.modelKey),
          locomotion: this.assets.locomotionFor(unit.def.modelKey),
          onSwing: (u) => this.onSwing?.(u),
        },
      );
    }
    view.bind(unit);
    this.scene.add(view.root);
    return view;
  }

  /** The living unit under the pointer shows its health bar (UnitView.setHovered). */
  private updateHover(): void {
    let next: UnitView | null = null;
    if (this.pointerIn) {
      this.raycaster.setFromCamera(this.pointer, this.rig.camera);
      const id = pickHovered(this.raycaster.ray, this.views.values());
      next = id === null ? null : (this.views.get(id) ?? null);
    }
    this.setHovered(next);
  }

  private setHovered(view: UnitView | null): void {
    if (view === this.hovered) return;
    this.hovered?.setHovered(false);
    view?.setHovered(true);
    this.hovered = view;
  }

  private release(view: UnitView): void {
    if (view === this.hovered) this.setHovered(null);
    this.scene.remove(view.root);
    let list = this.freeViews.get(view.poolKey);
    if (!list) this.freeViews.set(view.poolKey, (list = []));
    list.push(view);
  }

  private resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.size = { w, h };
    this.renderer.setSize(w, h);
    this.rig.resize(w, h);
    this.post.setSize(w, h);
  }
}
