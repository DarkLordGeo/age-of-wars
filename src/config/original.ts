/**
 * Unit conversions from the original Age of War (docs/AGE1_SPEC.md, "Units of measure").
 * The original lane is 900 units base-to-base at 41 frames per second; ours is 80 m.
 */
export const ORIGINAL_UNITS_PER_METRE = 900 / 80; // 11.25
export const ORIGINAL_FPS = 41;

/** Original distance units -> metres. */
export const u = (units: number): number => units / ORIGINAL_UNITS_PER_METRE;
/** Original frames -> seconds. */
export const frames = (n: number): number => n / ORIGINAL_FPS;
