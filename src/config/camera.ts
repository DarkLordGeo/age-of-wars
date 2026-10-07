/** Camera tuning. Angles in degrees, distances in metres. */
export const CAMERA = {
  fov: 38,
  /** Angle above the ground plane. */
  elevation: 38,
  /** Rotation around the vertical axis away from the lane normal; gives the 3/4 diagonal look. */
  azimuth: 32,
  /** Camera-to-focus distance. */
  distance: { min: 22, max: 105, initial: 44 },
  /** Height of the point the camera looks at. */
  focusHeight: 1.5,
  /** How far past the bases the focus point may travel. */
  panMargin: 6,

  pan: { keySpeed: 28, dragSpeed: 0.0016 },
  zoomStep: 0.12,
  /** Exponential smoothing rates (1/s); higher = snappier. */
  smoothing: { pan: 7, zoom: 6 },

  follow: {
    enabledByDefault: true,
    /** Focus moves toward the front line at this rate (1/s). */
    rate: 1.6,
    /** Front-line movement smaller than this (m) is ignored to avoid jitter. */
    deadzone: 3,
    /** Seconds follow stays paused after manual panning. */
    resumeDelay: 3,
  },
} as const;
