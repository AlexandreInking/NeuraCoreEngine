import {
  clamp01,
  clamp11,
  dominantEmotionOf,
  mapVadToPlutchik,
} from './defaults';
import type {
  EmotionalState,
  MessageAnalysis,
  PlutchikEmotions,
} from './types';

/**
 * Emotional transition toward baseline with inertia (from the Neura-Core spec):
 *   E(t + Δt) = baseline + (E(t) − baseline) · e^(−γ·Δt) + ΔE_stimulus
 * Δt is expressed in hours; γ is the emotional inertia coefficient.
 */
export function applyEmotionalDecay(
  state: EmotionalState,
  elapsedHours: number,
): Pick<EmotionalState, 'valence' | 'arousal' | 'dominance'> {
  const gamma = state.emotionalInertiaGamma;
  const factor = Math.exp(-gamma * elapsedHours);
  return {
    valence: clamp11(
      state.baseline.valence +
        (state.valence - state.baseline.valence) * factor,
    ),
    arousal: clamp11(
      state.baseline.arousal +
        (state.arousal - state.baseline.arousal) * factor,
    ),
    dominance: clamp11(
      state.baseline.dominance +
        (state.dominance - state.baseline.dominance) * factor,
    ),
  };
}

function mergePlutchik(
  vadMapped: PlutchikEmotions,
  detected: Partial<PlutchikEmotions>,
  fromModel: boolean,
): PlutchikEmotions {
  const keys = Object.keys(vadMapped) as Array<keyof PlutchikEmotions>;
  const detectedWeight = fromModel ? 0.55 : 0.4;
  const result = {} as PlutchikEmotions;
  for (const key of keys) {
    const detectedValue = detected[key] ?? 0;
    result[key] = clamp01(
      vadMapped[key] * (1 - detectedWeight) + detectedValue * detectedWeight,
    );
  }
  return result;
}

/**
 * Apply a message's emotional impact to the current state: decay first, then
 * blend the stimulus with the VAD-mapped Plutchik values.
 */
export function applyStimulus(
  state: EmotionalState,
  analysis: MessageAnalysis,
  elapsedHours: number,
): EmotionalState {
  const decayed = applyEmotionalDecay(state, elapsedHours);
  const stimulusScale = 0.75;

  const valence = clamp11(decayed.valence + analysis.valence * stimulusScale);
  const arousal = clamp11(decayed.arousal + analysis.arousal * 1.4 - 0.2);
  const dominance = clamp11(decayed.dominance + analysis.dominance * 0.6);

  const vadMapped = mapVadToPlutchik(valence, arousal, dominance);
  const plutchik = mergePlutchik(
    vadMapped,
    analysis.emotions,
    analysis.fromModel,
  );

  const intensity = clamp01(
    Math.max(
      ...(Object.values(plutchik) as number[]),
      Math.abs(valence),
      Math.abs(arousal),
    ) * 0.9,
  );

  return {
    ...state,
    valence,
    arousal,
    dominance,
    plutchik,
    intensity,
    dominantEmotion: dominantEmotionOf(plutchik),
  };
}

/** Small passive oscillation so the state never feels frozen. */
export function addSubtleDrift(state: EmotionalState): EmotionalState {
  const drift = Math.sin(Date.now() / 60_000) * 0.02;
  return {
    ...state,
    valence: clamp11(state.valence + drift),
    arousal: clamp11(state.arousal - drift * 0.5),
  };
}
