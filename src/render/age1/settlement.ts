import { Box3,
  BufferAttribute,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { FireFx } from './fire';
import { age1Material, teamClothMaterial } from './materials';
import { PieceBuilder, rng32 } from './builder';

/**
 * Age 1 base: a primitive palisaded camp, built procedurally in Three.js.
 *
 * Local space: metres, origin on the ground at the base centre, facing +X (toward the enemy).
 * The enemy base is the mirror image (BaseView mirrors it), so "front" (+Z, toward the camera)
 * stays the low, open side for both teams.
 *
 * Contents: palisade ring with an open gate facing the lane, great hut + huts with thatch roofs,
 * hide tent, wood pile, campfire (animated), a TeamColor banner pole and gate pennants.
 * `variant` reshuffles the layout details (the enemy uses another variant).
 *
 * The returned group carries `userData.tick(dt)` for its animated parts (fire, banner).
 */
export interface SettlementOptions {
  variant?: number;
  /** Ground points (local x, z) to keep clear of palisade stakes, e.g. turret mounts. */
  keepClear?: ReadonlyArray<{ x: number; z: number; r: number }>;
  /** Disable particle effects (tests / headless). */
  fx?: boolean;
  /**
   * The imported stone cave (Rodin model). When given, it IS the base: no palisade or huts,
   * just the cave (scaled up, mouth turned toward the lane and the camera), a campfire in
   * front of it and the team banner.
   */
  cave?: Object3D;
}

export const SETTLEMENT = {
  /** Palisade ring centre (x) and radius. The ring wraps the base; the gate is at +X. */
  ringX: -2,
  ringRadius: 12.5,
  /** Gate opening half-width (m), sized for the lane. */
  gateHalfWidth: 3.6,
  /** Default turret mount clearance, matches GAME.turretMounts[0]. */
  turretClear: { x: 8, z: 6, r: 2.2 },
} as const;

export function createSettlement(tint: number, opts: SettlementOptions = {}): Group {
  const variant = opts.variant ?? 0;
  const rnd = rng32(0x5e771e + variant * 977);
  const b = new PieceBuilder();
  const keepClear = opts.keepClear ?? [SETTLEMENT.turretClear];

  if (opts.cave) return createCaveBase(tint, opts.cave, opts, rnd);
  buildPalisade(b, rnd, keepClear);

  // Great hut (the "keep": what attackers hit) and smaller huts, all behind/around the centre.
  // Its door faces the gate; units spawn inside and march out through it (eave above head height).
  hut(b, rnd, -2.2, -1.2, 3.4, 2.45, 3.4);
  const huts = variant % 2 === 0
    ? [[-8.2, -4.6, 2.2], [-3.4, -8.0, 2.0], [2.8, -7.2, 1.8]]
    : [[-8.6, -3.2, 2.0], [-4.6, -8.2, 2.3], [2.2, -7.6, 1.7]];
  for (const [x, z, r] of huts) hut(b, rnd, x!, z!, r!, 1.5 + rnd() * 0.3, r! * 1.15 + 0.6);

  tent(b, rnd, variant % 2 === 0 ? -9.4 : -9.0, variant % 2 === 0 ? 4.4 : 3.6, 2.0, 3.6);
  woodPile(b, rnd, 3.4, -4.6, variant % 2 === 0 ? 0.25 : -0.3);
  dryingRack(b, rnd, -7.4, 6.8);

  const fireAt = new Vector3(-4.6, 0, 4.2);
  campfireStructure(b, rnd, fireAt.x, fireAt.z);

  const group = b.build();
  group.name = 'Settlement';

  // TeamColor elements are separate meshes so AssetLibrary-style tinting is per base.
  const banner = bannerPole(tint, -0.4, -4.4, 8.2);
  group.add(banner.root);
  const gatePennants = [gatePennant(tint, SETTLEMENT.ringX + SETTLEMENT.ringRadius - 0.6, -SETTLEMENT.gateHalfWidth - 0.4), gatePennant(tint, SETTLEMENT.ringX + SETTLEMENT.ringRadius - 0.6, SETTLEMENT.gateHalfWidth + 0.4)];
  for (const p of gatePennants) group.add(p.root);

  const fire = opts.fx === false ? null : new FireFx({ x: fireAt.x, y: 0.15, z: fireAt.z }, { flames: 10, smoke: 14, scale: 1 });
  if (fire) group.add(fire.root);

  let t = rnd() * 10;
  group.userData.tick = (dt: number): void => {
    t += dt;
    banner.wave(t);
    for (const p of gatePennants) p.wave(t + 1.3);
    fire?.update(dt);
  };
  return group;
}

// ------------------------------------------------------------------------------------ pieces

export const CAVE_BASE = {
  /** Cave height (m); the source model is scaled uniformly to it. */
  height: 10.5,
  /** Cave centre (local, base space) and turn: the mouth (source -X side) faces lane + camera. */
  x: -3,
  z: -3.5,
  turnY: (3 * Math.PI) / 4,
  fire: { x: 4.2, z: 4.6 },
  banner: { x: 1.5, z: -9.5, h: 13 },
} as const;

/** The base as a single big cave (see SettlementOptions.cave). */
function createCaveBase(tint: number, cave: Object3D, opts: SettlementOptions, rnd: () => number): Group {
  const group = new Group();
  group.name = 'CaveBase';
  const C = CAVE_BASE;
  cave.rotation.y = C.turnY;
  cave.updateMatrixWorld(true);
  const box = new Box3().setFromObject(cave);
  const k = C.height / (box.max.y - box.min.y);
  cave.scale.multiplyScalar(k);
  const cx = ((box.min.x + box.max.x) / 2) * k;
  const cz = ((box.min.z + box.max.z) / 2) * k;
  cave.position.set(C.x - cx, -box.min.y * k - 0.1, C.z - cz);
  group.add(cave);

  const b = new PieceBuilder();
  campfireStructure(b, rnd, C.fire.x, C.fire.z);
  woodPile(b, rnd, C.fire.x - 3.2, C.fire.z + 1.2, 0.4);
  group.add(b.build());
  const banner = bannerPole(tint, C.banner.x, C.banner.z, C.banner.h);
  group.add(banner.root);
  const fire = opts.fx === false ? null : new FireFx({ x: C.fire.x, y: 0.15, z: C.fire.z }, { flames: 10, smoke: 14, scale: 1 });
  if (fire) group.add(fire.root);
  let t = rnd() * 10;
  group.userData.tick = (dt: number): void => {
    t += dt;
    banner.wave(t);
    fire?.update(dt);
  };
  return group;
}

function buildPalisade(b: PieceBuilder, rnd: () => number, keepClear: ReadonlyArray<{ x: number; z: number; r: number }>): void {
  const bark = age1Material('bark');
  const log = age1Material('log');
  const rope = age1Material('rope');
  const { ringX, ringRadius: R, gateHalfWidth } = SETTLEMENT;
  const gateAngle = Math.asin(gateHalfWidth / R);
  const stakeR = 0.19;
  const step = (stakeR * 2.05) / R;
  const lean = new Vector3();
  const tops: Vector3[] = [];
  for (let a = gateAngle; a < Math.PI * 2 - gateAngle; a += step * (0.95 + rnd() * 0.1)) {
    const x = ringX + Math.cos(a) * R;
    const z = Math.sin(a) * R;
    if (keepClear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
    // Front (+Z, camera side) is lower so the camp stays readable from the battle camera.
    const front = Math.max(0, Math.sin(a));
    const h = 3.1 - front * 0.9 + (rnd() - 0.5) * 0.45;
    lean.set((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12);
    // Sharpened top: a short cone on the pole.
    b.post(rnd() < 0.8 ? bark : log, x, z, h - 0.35, stakeR * (0.85 + rnd() * 0.3), lean);
    b.log(log, new Vector3(x + lean.x, h - 0.36, z + lean.z), new Vector3(x + lean.x * 1.05, h + 0.05, z + lean.z * 1.05), stakeR * 0.95, { cone: true, sides: 6 });
    tops.push(new Vector3(x, h, z));
  }
  // Two lashing bands (rope) around the ring, broken where stakes are missing.
  for (const band of [0.9, 1.9]) {
    for (let i = 0; i + 1 < tops.length; i++) {
      const p = tops[i]!;
      const q = tops[i + 1]!;
      if (p.distanceTo(q) > 0.9) continue;
      const y = Math.min(band, Math.min(p.y, q.y) - 0.5);
      b.log(rope, new Vector3(p.x, y, p.z), new Vector3(q.x, y, q.z), 0.035, { sides: 4, taper: 1 });
    }
  }
  // Gate: two big posts and a lashed lintel high above the lane.
  const gx = ringX + Math.cos(gateAngle) * R;
  for (const s of [-1, 1]) {
    b.post(bark, gx, s * (gateHalfWidth + 0.15), 4.5, 0.32);
    b.log(log, new Vector3(gx, 4.5, s * (gateHalfWidth + 0.15)), new Vector3(gx, 5.1, s * (gateHalfWidth + 0.15)), 0.3, { cone: true });
    // skull-less horn decoration: two short angled sticks
    b.log(log, new Vector3(gx + 0.1, 4.1, s * (gateHalfWidth + 0.15)), new Vector3(gx + 0.7, 4.8, s * (gateHalfWidth + 0.6)), 0.07);
  }
  b.log(log, new Vector3(gx, 3.95, -gateHalfWidth - 0.7), new Vector3(gx, 3.95, gateHalfWidth + 0.7), 0.24, { taper: 0.9, uvLen: 3, caps: true });
  b.log(rope, new Vector3(gx, 3.6, -gateHalfWidth - 0.2), new Vector3(gx, 3.95, -gateHalfWidth + 0.4), 0.05, { sides: 4 });
  b.log(rope, new Vector3(gx, 3.6, gateHalfWidth + 0.2), new Vector3(gx, 3.95, gateHalfWidth - 0.4), 0.05, { sides: 4 });
}

/** Round wattle hut with a conical thatch roof and a door facing the centre/lane. */
function hut(b: PieceBuilder, rnd: () => number, x: number, z: number, r: number, wallH: number, roofH: number): void {
  const wall = new CylinderGeometry(r * 0.97, r, wallH, 14, 1, true);
  const uv = wall.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 2, uv.getY(i) * wallH * 0.7);
  b.place(age1Material('wattle'), wall, new Vector3(x, wallH / 2, z), rnd() * 6);

  // Thatch roof: cone with overhang, slightly irregular rim, plus a smaller cap.
  const roof = new ConeGeometry(r * 1.32, roofH, 16, 3, true);
  const pos = roof.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -roofH / 2 + 0.01) pos.setY(i, y + (rnd() - 0.5) * 0.25);
  }
  const ruv = roof.attributes.uv!;
  for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * r * 3, ruv.getY(i) * roofH * 0.6);
  roof.computeVertexNormals();
  b.place(age1Material('thatch'), roof, new Vector3(x, wallH + roofH / 2 - 0.15, z), rnd() * 6);
  // underside so the roof is not see-through from below the eave
  const under = new CircleGeometry(r * 1.3, 16);
  under.rotateX(Math.PI / 2);
  b.place(age1Material('thatch'), under, new Vector3(x, wallH - 0.14, z));
  // smoke-hole cap and a few roof poles poking out of the top
  const cap = new ConeGeometry(r * 0.35, roofH * 0.25, 10, 1, true);
  b.place(age1Material('thatch'), cap, new Vector3(x, wallH + roofH - 0.25, z), rnd() * 6);
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    b.log(age1Material('log'), new Vector3(x + Math.cos(a) * 0.2, wallH + roofH - 0.6, z + Math.sin(a) * 0.2), new Vector3(x + Math.cos(a) * 0.45, wallH + roofH + 0.35 + rnd() * 0.3, z + Math.sin(a) * 0.45), 0.05, { sides: 5 });
  }
  // Door: a dark opening (hide flap) facing +X.
  const door = new PlaneGeometry(0.95, Math.min(1.4, wallH * 0.9));
  door.rotateY(Math.PI / 2);
  b.place(age1Material('charred'), door, new Vector3(x + r * 1.0 + 0.02, Math.min(1.4, wallH * 0.9) / 2, z));
  b.post(age1Material('log'), x + r + 0.05, z - 0.55, wallH + 0.1, 0.07);
  b.post(age1Material('log'), x + r + 0.05, z + 0.55, wallH + 0.1, 0.07);
}

/** Hide tent: a tipi of poles wrapped in stitched hides, poles poking out of the top. */
function tent(b: PieceBuilder, rnd: () => number, x: number, z: number, r: number, h: number): void {
  const cover = new ConeGeometry(r, h, 12, 2, true);
  const pos = cover.attributes.position as BufferAttribute;
  // slight sag between poles
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    const a = Math.atan2(pz, px);
    const sag = 0.06 * (1 - Math.abs(Math.cos(a * 6)));
    pos.setX(i, px * (1 - sag));
    pos.setZ(i, pz * (1 - sag));
  }
  const cuv = cover.attributes.uv!;
  for (let i = 0; i < cuv.count; i++) cuv.setXY(i, cuv.getX(i) * 3, cuv.getY(i) * 1.5);
  cover.computeVertexNormals();
  b.place(age1Material('hide'), cover, new Vector3(x, h / 2, z), rnd() * 6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.2;
    b.log(age1Material('log'), new Vector3(x + Math.cos(a) * r * 1.02, -0.1, z + Math.sin(a) * r * 1.02), new Vector3(x - Math.cos(a) * 0.35, h + 0.9, z - Math.sin(a) * 0.35), 0.05, { sides: 5, taper: 0.7 });
  }
  // door flap opening
  const door = new PlaneGeometry(0.8, 1.2);
  door.rotateY(Math.PI / 2);
  door.rotateZ(-Math.atan2(r, h) * 0.95);
  b.place(age1Material('charred'), door, new Vector3(x + r * 0.62, 0.6, z));
}

function woodPile(b: PieceBuilder, rnd: () => number, x: number, z: number, rotY: number): void {
  const bark = age1Material('bark');
  const dir = new Vector3(Math.cos(rotY), 0, -Math.sin(rotY));
  const side = new Vector3(-dir.z, 0, dir.x);
  const rows = [5, 4, 3, 2];
  const r = 0.17;
  for (let row = 0; row < rows.length; row++) {
    const n = rows[row]!;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * r * 2.05;
      const c = new Vector3(x, r + row * r * 1.75, z).addScaledVector(side, off);
      const len = 1.6 + rnd() * 0.4;
      const shift = (rnd() - 0.5) * 0.3;
      b.log(bark, c.clone().addScaledVector(dir, -len / 2 + shift), c.clone().addScaledVector(dir, len / 2 + shift), r * (0.85 + rnd() * 0.3), { taper: 0.95, sides: 7, caps: true });
    }
  }
  // chopping stump with an axe-less wedge
  b.log(bark, new Vector3(x + side.x * 1.4 + dir.x * 1.2, -0.1, z + side.z * 1.4 + dir.z * 1.2), new Vector3(x + side.x * 1.4 + dir.x * 1.2, 0.55, z + side.z * 1.4 + dir.z * 1.2), 0.32, { taper: 0.95, caps: true });
}

/** A rack of poles with hides stretched on it (reads as a camp from afar). */
function dryingRack(b: PieceBuilder, rnd: () => number, x: number, z: number): void {
  const log = age1Material('log');
  for (const dx of [-1.1, 1.1]) b.post(log, x + dx, z, 2.0, 0.06);
  b.log(log, new Vector3(x - 1.3, 1.9, z), new Vector3(x + 1.3, 1.9, z), 0.05);
  const skin = new PlaneGeometry(1.7, 1.3, 4, 3);
  const p = skin.attributes.position as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i);
    const py = p.getY(i);
    // irregular hide outline: pull the corners in
    const k = Math.abs(px) / 0.85 + Math.abs(py) / 0.65;
    if (k > 1.6) p.setXY(i, px * 0.8, py * 0.8);
    p.setZ(i, (rnd() - 0.5) * 0.06);
  }
  skin.computeVertexNormals();
  b.place(age1Material('hide'), skin, new Vector3(x, 1.2, z), 0.1);
}

/** Stone ring with charred logs; the flames themselves are FireFx. */
function campfireStructure(b: PieceBuilder, rnd: () => number, x: number, z: number): void {
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rnd() * 0.2;
    const s = 0.22 + rnd() * 0.08;
    const stone = new DodecahedronGeometry(1, 0);
    b.place(age1Material('stone'), stone, new Vector3(x + Math.cos(a) * 0.85, s * 0.45, z + Math.sin(a) * 0.85), rnd() * 6, new Vector3(s * 1.3, s * 0.9, s));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rnd() * 0.3;
    b.log(age1Material('charred'), new Vector3(x + Math.cos(a) * 0.65, 0.05, z + Math.sin(a) * 0.65), new Vector3(x - Math.cos(a) * 0.05, 0.45, z - Math.sin(a) * 0.05), 0.07, { sides: 5 });
  }
  const ash = new CircleGeometry(0.7, 12);
  ash.rotateX(-Math.PI / 2);
  b.place(age1Material('charred'), ash, new Vector3(x, 0.03, z));
  // seats: two logs around the fire
  for (const [dx, dz, ry] of [[0, 1.9, 0], [-1.8, -0.5, 1.3]] as const) {
    const d = new Vector3(Math.cos(ry), 0, Math.sin(ry));
    b.log(age1Material('bark'), new Vector3(x + dx, 0.2, z + dz).addScaledVector(d, -0.9), new Vector3(x + dx, 0.2, z + dz).addScaledVector(d, 0.9), 0.2, { taper: 0.95, caps: true });
  }
}

interface WavingCloth {
  root: Object3D;
  wave(t: number): void;
}

/** Waving cloth helper: a segmented plane whose free edge ripples. Hinged at local x = 0. */
function cloth(tint: number, w: number, h: number): { mesh: Mesh; wave: (t: number, amp: number) => void } {
  const geo = new PlaneGeometry(w, h, 8, 3);
  geo.translate(w / 2, -h / 2, 0);
  const pos = geo.attributes.position as BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  const mesh = new Mesh(geo, teamClothMaterial(tint));
  mesh.castShadow = true;
  mesh.name = 'TeamColor';
  const wave = (t: number, amp: number): void => {
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3]!;
      const k = x / w;
      pos.setZ(i, Math.sin(t * 3.1 - x * 2.2) * amp * k + Math.sin(t * 1.7 + base[i * 3 + 1]! * 1.5) * 0.04 * k);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  wave(0, 0.2);
  return { mesh, wave };
}

/** Tall pole with a cross-bar and a team-coloured banner (painted hide) plus a horn finial. */
function bannerPole(tint: number, x: number, z: number, h: number): WavingCloth {
  const b = new PieceBuilder();
  b.post(age1Material('bark'), x, z, h, 0.16);
  b.log(age1Material('log'), new Vector3(x, h - 0.4, z - 0.1), new Vector3(x + 2.4, h - 0.4, z - 0.1), 0.06);
  b.log(age1Material('log'), new Vector3(x - 0.05, h, z), new Vector3(x + 0.25, h + 0.6, z + 0.1), 0.06, { cone: true });
  // feathers/tassels hanging from the bar ends
  for (const dx of [0.3, 2.3]) b.log(age1Material('rope'), new Vector3(x + dx, h - 0.45, z - 0.1), new Vector3(x + dx + 0.05, h - 1.3, z - 0.1), 0.03, { sides: 4 });
  const root = b.build();
  const c = cloth(tint, 2.2, 2.8);
  c.mesh.position.set(x + 0.15, h - 0.42, z - 0.1);
  root.add(c.mesh);
  return { root, wave: (t) => c.wave(t, 0.25) };
}

function gatePennant(tint: number, x: number, z: number): WavingCloth {
  const c = cloth(tint, 1.4, 0.7);
  c.mesh.position.set(x, 5.0, z);
  c.mesh.rotation.y = Math.PI; // streams back toward the camp
  const root = new Group();
  root.add(c.mesh);
  return { root, wave: (t) => c.wave(t, 0.3) };
}
