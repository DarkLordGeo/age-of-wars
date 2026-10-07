/**
 * Builds a tiny skinned + animated GLB in memory (a 1.8m box on a 2-bone spine) to exercise
 * the model pipeline without any real asset. NOT a game asset.
 */
export interface TestRigOptions {
  clipNames?: string[];
  /** Standing height in metres (default 1.8). */
  height?: number;
  /** Lift the model off the ground to violate the origin rule. */
  yOffset?: number;
}

const DEFAULT_CLIPS = ['idle', 'walk', 'attack', 'death'];

export function buildTestRigGlb(opts: TestRigOptions = {}): ArrayBuffer {
  const clipNames = opts.clipNames ?? DEFAULT_CLIPS;
  const H = opts.height ?? 1.8;
  const y0 = opts.yOffset ?? 0;

  const chunks: Uint8Array[] = [];
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  let offset = 0;

  const addAccessor = (data: ArrayBufferView, componentType: number, type: string, count: number, extra: object = {}): number => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
    padded.set(bytes);
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    accessors.push({ bufferView: bufferViews.length - 1, componentType, type, count, ...extra });
    chunks.push(padded);
    offset += padded.length;
    return accessors.length - 1;
  };
  const FLOAT = 5126;
  const UBYTE = 5121;
  const USHORT = 5123;

  // Cube from y=0..H; bottom vertices follow the hip bone, top vertices the spine bone.
  const x = 0.3;
  const corners = [
    [-x, 0, -x], [x, 0, -x], [x, 0, x], [-x, 0, x],
    [-x, H, -x], [x, H, -x], [x, H, x], [-x, H, x],
  ];
  const positions = new Float32Array(corners.flatMap(([a, b, c]) => [a!, b! + y0, c!]));
  const joints = new Uint8Array(corners.flatMap(([, y]) => (y === 0 ? [0, 0, 0, 0] : [1, 0, 0, 0])));
  const weights = new Float32Array(corners.flatMap(() => [1, 0, 0, 0]));
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]);

  // Bones: Hip at (0, y0, 0), Spine at (0, y0 + H/2, 0). Inverse bind = translate(-world).
  const ibm = (ty: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -ty, 0, 1];
  const inverseBind = new Float32Array([...ibm(y0), ...ibm(y0 + H / 2)]);

  const posAcc = addAccessor(positions, FLOAT, 'VEC3', 8, {
    min: [-x, y0, -x],
    max: [x, y0 + H, x],
  });
  const jointAcc = addAccessor(joints, UBYTE, 'VEC4', 8);
  const weightAcc = addAccessor(weights, FLOAT, 'VEC4', 8);
  const indexAcc = addAccessor(indices, USHORT, 'SCALAR', indices.length);
  const ibmAcc = addAccessor(inverseBind, FLOAT, 'MAT4', 2);
  const timeAcc = addAccessor(new Float32Array([0, 1]), FLOAT, 'SCALAR', 2, { min: [0], max: [1] });

  // Each clip sways the spine bone a different amount about Z (death topples it).
  const sway = [0.1, 0.25, 0.5, 1.4];
  const animations = clipNames.map((name, i) => {
    const a = sway[i % sway.length]!;
    const q = (angle: number) => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
    const out = addAccessor(new Float32Array([...q(0), ...q(a)]), FLOAT, 'VEC4', 2);
    return {
      name,
      samplers: [{ input: timeAcc, output: out, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }],
    };
  });

  const json = {
    asset: { version: '2.0', generator: 'age-of-wars test rig' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { name: 'Rig', children: [1, 3] },
      { name: 'Hip', translation: [0, y0, 0], children: [2] },
      { name: 'Spine', translation: [0, H / 2, 0] },
      { name: 'Body', mesh: 0, skin: 0 },
    ],
    skins: [{ joints: [1, 2], inverseBindMatrices: ibmAcc, skeleton: 1 }],
    meshes: [
      {
        name: 'Body',
        primitives: [
          { attributes: { POSITION: posAcc, JOINTS_0: jointAcc, WEIGHTS_0: weightAcc }, indices: indexAcc, material: 0 },
        ],
      },
    ],
    materials: [{ name: 'TeamColor', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0 } }],
    animations,
    buffers: [{ byteLength: offset }],
    bufferViews,
    accessors,
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4).fill(0x20);
  jsonPadded.set(jsonBytes);
  const bin = new Uint8Array(offset);
  let o = 0;
  for (const c of chunks) {
    bin.set(c, o);
    o += c.length;
  }

  const total = 12 + 8 + jsonPadded.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded.length, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonPadded, 20);
  const binHeader = 20 + jsonPadded.length;
  view.setUint32(binHeader, bin.length, true);
  view.setUint32(binHeader + 4, 0x004e4942, true); // 'BIN\0'
  bytes.set(bin, binHeader + 8);
  return out;
}
