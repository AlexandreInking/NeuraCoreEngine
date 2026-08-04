export type VadAxis = 'valence' | 'arousal' | 'dominance';

export type VadState = {
  valence: number; // -1..1
  arousal: number; // -1..1
  dominance: number; // -1..1
};

export type VadConfig = {
  /** Emotional inertia: higher γ = faster return to baseline (0.01 - 0.99). */
  gamma: number;
  baseline: VadState;
  /** Intensity of Gaussian process noise η(t) added each tick. */
  noiseSigma: number;
};

export type EkfConfig = {
  /** Process noise covariance Q (trust in dynamics). */
  q: number;
  /** Measurement noise covariance R (trust in sensors). */
  r: number;
};

export const DEFAULT_VAD_CONFIG: VadConfig = {
  gamma: 0.15,
  baseline: { valence: 0, arousal: 0, dominance: 0 },
  noiseSigma: 0.02,
};

export const DEFAULT_EKF_CONFIG: EkfConfig = { q: 0.001, r: 0.05 };

export const DEFAULT_VAD_STATE: VadState = {
  valence: 0,
  arousal: 0,
  dominance: 0,
};

/** Prosody features extracted from live audio (pitch / energy / cadence). */
export type ProsodyFeatures = {
  /** Fundamental frequency in Hz (e.g. 120). */
  pitchHz: number;
  /** RMS energy in dB (negative, e.g. -18). */
  energyDb: number;
  /** Speech rate in syllables/s (0-10). */
  speechRate: number;
};

/** Normalized prosody in [-1, 1] ready to map to ΔVAD. */
export type NormalizedProsody = {
  pitchNorm: number;
  energyNorm: number;
  rateNorm: number;
};

export type VadSource =
  | { kind: 'prosody'; features: ProsodyFeatures }
  | { kind: 'lexical'; delta: Partial<VadState> }
  | { kind: 'manual'; delta: Partial<VadState> };
