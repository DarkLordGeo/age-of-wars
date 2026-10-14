/**
 * Landed sling stones (render-only debris, src/render/StoneDebris.ts). Stones whose projectile
 * def `persists` stay on the battlefield after they come down: a short damped bounce, a slide /
 * tumble until friction stops them, then they sleep (no per-frame cost) until removed.
 *
 * Limits keep long battles cheap: at most `max` stones lie around; when another lands, the oldest
 * shrinks away over `fade` seconds (never popping out). Stones older than `maxAge` seconds fade the
 * same way (0 = no age limit). All of them are cleared when a new match starts.
 */
export const STONE_DEBRIS = {
  max: 150,
  maxAge: 180,
  fade: 0.6,
  /** Share of the vertical impact speed a stone keeps when it bounces (dirt and grass: low). */
  restitution: 0.22,
  /** Share of the horizontal speed lost in each bounce. */
  impactFriction: 0.55,
  /** Sliding / rolling friction coefficient on the ground (deceleration = friction * g). */
  friction: 0.7,
  /** Below this vertical impact speed (m/s) a stone stops bouncing and slides. */
  bounceMin: 1,
  /** Below this speed (m/s) a stone on the ground comes to rest and sleeps. */
  sleepSpeed: 0.05,
  /** How deep a resting stone sits in the ground, as a share of its radius. */
  embed: 0.2,
  /** A stone that hits a unit drops at its feet (deflected) instead of vanishing. */
  dropOnHit: true,
  /** Share of its speed a stone keeps, bouncing back, when it glances off a unit. */
  hitRebound: 0.05,
  gravity: 9.8,
};
