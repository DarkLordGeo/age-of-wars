/**
 * Battlefield camera (Age 1). A close, slightly elevated side-on shot (looking ~20° down,
 * angled a little toward the enemy) that the player slides along the lane, from their own
 * cave to the enemy's, like the classic game's scrolling view. Height and angle never change;
 * there is no rotation, orbit or zoom.
 *
 * World: the lane runs along +X (player base at x = -40, enemy at +40); the camera side is +Z.
 * Distances in metres, angles in degrees.
 */
export const CAMERA = {
  /** Eye position relative to the focus point on the lane. */
  offset: { x: -12, y: 10, z: 25 },
  /** Height of the look-at point above the lane. */
  lookY: 2,
  /** Vertical FOV at 16:9; narrower screens widen it so the horizontal framing holds. */
  fov: 40,
  minHorizontalFov: 62,

  /** Player-controlled slide along the lane (focus x, metres). */
  pan: {
    /** Range: one end frames the player's cave, the other the enemy's. */
    min: -37,
    max: 37,
    /** Where a match starts: on the player's base. */
    start: -35,
    /** Arrow keys / A-D speed and edge-scroll speed (m/s). */
    keySpeed: 38,
    edgeSpeed: 30,
    /** Edge-scroll zone width (px); ignored near the HUD at the top. */
    edgePx: 26,
    /** Wheel: metres per wheel pixel. */
    wheel: 0.045,
    /** Smoothing toward the goal (1/s). */
    ease: 9,
  },

  /** Main-menu background: a slow sweep up and down the lane. */
  menuSweep: { amplitude: 26, period: 48 },
} as const;
