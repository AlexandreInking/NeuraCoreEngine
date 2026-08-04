import type {
  NormalizedProsody,
  ProsodyFeatures,
  VadConfig,
  VadSource,
  VadState,
} from './types';
import { DEFAULT_VAD_CONFIG } from './types';

export function clamp11(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/** Box–Muller Gaussian noise with configurable sigma. */
export function gaussianNoise(sigma: number): number {
  if (sigma <= 0) return 0;
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * One VAD tick from the Neura-Core spec:
 *   E(t + Δt) = baseline + (E − baseline) · e^(−γ·Δt) + ΔE_stimulus + η(t)
 * Δt is in seconds (auto-tick uses 0.5s; the formula is dt-invariant).
 */
export function vadStep(
  current: VadState,
  config: VadConfig,
  stimulus: Partial<VadState>,
  dtSeconds: number,
): VadState {
  const factor = Math.exp(-config.gamma * dtSeconds);
  const axis = (key: 'valence' | 'arousal' | 'dominance') =>
    clamp11(
      config.baseline[key] +
        (current[key] - config.baseline[key]) * factor +
        (stimulus[key] ?? 0) +
        gaussianNoise(config.noiseSigma),
    );
  return { valence: axis('valence'), arousal: axis('arousal'), dominance: axis('dominance') };
}

/**
 * Normalize raw prosody to [-1, 1]:
 * pitch 60-400 Hz, energy -30..0 dB, speech rate 0-10 syll/s.
 */
export function normalizeProsody(features: ProsodyFeatures): NormalizedProsody {
  const pitchNorm = clamp11(((features.pitchHz - 230) / 170) * 2);
  const energyNorm = clamp11((features.energyDb + 15) / 15);
  const rateNorm = clamp11((features.speechRate - 5) / 5);
  return { pitchNorm, energyNorm, rateNorm };
}

/** Map prosody to an emotional stimulus ΔVAD (hito 6.3 table). */
export function prosodyToStimulus(features: ProsodyFeatures): Partial<VadState> {
  const { pitchNorm, energyNorm, rateNorm } = normalizeProsody(features);
  return {
    valence: clamp11(pitchNorm * 0.3 + energyNorm * 0.4),
    arousal: clamp11(rateNorm * 0.5 + energyNorm * 0.4 + Math.abs(pitchNorm) * 0.2),
    dominance: clamp11(pitchNorm * 0.45 + energyNorm * 0.35),
  };
}

/** Resolve any stimulus source into a ΔVAD vector. */
export function stimulusOf(source: VadSource): Partial<VadState> {
  switch (source.kind) {
    case 'prosody':
      return prosodyToStimulus(source.features);
    case 'lexical':
    case 'manual':
      return source.delta;
    default:
      return {};
  }
}

/** Neutral VAD (used as failover when the engine is unavailable). */
export function neutralVad(): VadState {
  return { valence: 0, arousal: 0, dominance: 0 };
}

export { DEFAULT_VAD_CONFIG };
