/**
 * Battlefield camera (Age 1). A fixed shot "standing" just in front of and to the side of the
 * player's camp: slightly elevated (27 m), looking down ~16° and diagonally across the lane toward the
 * enemy camp. The player's camp and watchtower are the near-side anchor, the enemy camp sits in
 * the distance. No player rotation, orbit, pan or zoom.
 *
 * World: the lane runs along +X (player base at x = -40, enemy at +40); the camera side is +Z.
 * Distances in metres, angles in degrees.
 */
export const CAMERA = {
  /** Fixed eye position. */
  position: { x: -86, y: 27, z: 38 },
  /** Default look-at point (mid-lane, a little toward the enemy). */
  target: { x: -10, y: 1.5, z: -4 },
  /** Vertical FOV at 16:9; narrower screens widen it so the horizontal framing holds. */
  fov: 40,
  minHorizontalFov: 66,

  /**
   * The only automatic movement: the look-at point eases a few metres toward the fighting so a
   * push on either base stays well framed. Small and slow on purpose.
   */
  track: { min: -8, max: 10, rate: 0.6, deadzone: 2 },

  /** Main-menu background: same shot with a slow, gentle drift. */
  menuSway: { yawDeg: 3, heightM: 1.2, period: 26 },
} as const;
