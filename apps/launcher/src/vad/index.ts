export type {
  VadAxis,
  VadConfig,
  VadSource,
  VadState,
  EkfConfig,
  ProsodyFeatures,
  NormalizedProsody,
} from './types';
export {
  DEFAULT_VAD_CONFIG,
  DEFAULT_EKF_CONFIG,
  DEFAULT_VAD_STATE,
} from './types';
export {
  vadStep,
  gaussianNoise,
  clamp11,
  clamp01,
  normalizeProsody,
  prosodyToStimulus,
  stimulusOf,
  neutralVad,
} from './core';
export { EkfVadEngine } from './ekf';
export {
  vadToSsml,
  vadQuadrant,
  animationTagFor,
  uiHexFor,
  QUADRANT_PRESETS,
  type VadQuadrant,
  type QuadrantPreset,
} from './ssml';
