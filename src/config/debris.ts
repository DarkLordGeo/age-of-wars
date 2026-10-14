/**
 * Landed sling stones (render-only debris, src/render/StoneDebris.ts). Stones whose projectile
 * def `persists` stay on the battlefield after they come down. They are small rigid spheres
 * (mass from their size, spin, inertia) colliding with the terrain and with each other: they
 * bounce, slide, roll and settle, then sleep (no per-frame cost) until removed.
 *
 * Limits keep long battles cheap: at most `max` stones lie around; when another lands, the oldest
 * shrinks away over `fade` seconds (never popping out). Stones older than `maxAge` seconds fade the
 * same way (0 = no age limit). At most `maxAwake` stones are simulated at once (the oldest
 * settled-enough ones are put to sleep first). All of them are cleared when a new match starts.
 */
export const STONE_DEBRIS = {
  max: 150,
  maxAge: 180,
  fade: 0.6,
  maxAwake: 48,
  /** Physics sub-step (s); more sub-steps when stones move fast, so they cannot pass through each other. */
  substep: 1 / 120,
  maxSubsteps: 16,
  gravity: 9.8,
  /** Ground (dirt, grass): share of the normal impact speed kept in a bounce, and Coulomb friction. */
  restitution: 0.25,
  friction: 0.8,
  /** Share of its sideways speed and spin a stone loses digging into the turf on a hard impact. */
  turfDrag: 0.4,
  /** Stone on stone. */
  stoneRestitution: 0.3,
  stoneFriction: 0.5,
  /** Rolling resistance on the ground (deceleration = rolling * g): uneven turf stops a roll (and holds stones on the slopes). */
  rolling: 0.6,
  /** Impacts slower than this (m/s) do not bounce (no endless micro-bounces). */
  bounceMin: 0.6,
  /** A supported stone slower than this (m/s, also at its surface from spin) for `sleepTime` s rests. */
  sleepSpeed: 0.06,
  sleepTime: 0.3,
  /** A resting stone wakes when a hit would move it faster than this (m/s); softer touches leave it. */
  wakeSpeed: 0.35,
  /** How deep a resting stone sits in the ground, as a share of its radius. */
  embed: 0.15,
  /** A stone that hits a unit drops at its feet (deflected) instead of vanishing. */
  dropOnHit: true,
  /** Share of its speed a stone keeps, bouncing back, when it glances off a unit. */
  hitRebound: 0.05,
};
