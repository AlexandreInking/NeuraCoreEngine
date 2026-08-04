import {
  clamp01,
  clamp11,
  dominantEmotionOf,
  mapPlutchikToEkman,
  mapVadToPlutchik,
} from './defaults';
import type {
  EkmanEmotions,
  EmotionalState,
  MessageAnalysis,
  PlutchikEmotions,
  SomaticMarker,
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
 * Apply a message's emotional impact: decay, emotional contagion from the
 * user, somatic-marker activation, regulation dampening, then history.
 */
export function applyStimulus(
  state: EmotionalState,
  analysis: MessageAnalysis,
  elapsedHours: number,
  now: number,
): EmotionalState {
  const decayed = applyEmotionalDecay(state, elapsedHours);
  const stimulusScale = 0.75;

  let valence = clamp11(decayed.valence + analysis.valence * stimulusScale);
  let arousal = clamp11(decayed.arousal + analysis.arousal * 1.4 - 0.2);
  let dominance = clamp11(decayed.dominance + analysis.dominance * 0.6);

  // Emotional contagion (Hatfield): the user's dominant detected emotion
  // bleeds into the agent's state.
  const detectedJoy = analysis.emotions.joy ?? 0;
  const detectedNegative = Math.max(
    analysis.emotions.anger ?? 0,
    analysis.emotions.sadness ?? 0,
    analysis.emotions.fear ?? 0,
  );
  const contagionPull =
    (detectedJoy - detectedNegative) * state.contagionSusceptibility * 0.35;
  valence = clamp11(valence + contagionPull);

  // Cognitive reappraisal (Gross): high regulation effectiveness damps extremes.
  const regulation = state.regulationEffectiveness;
  if (valence > 0.5)
    valence = clamp11(valence - (valence - 0.5) * regulation * 0.4);
  if (valence < -0.5)
    valence = clamp11(valence + (-0.5 - valence) * regulation * 0.4);
  arousal = clamp11(arousal * (1 - regulation * 0.15));

  const vadMapped = mapVadToPlutchik(valence, arousal, dominance);
  const plutchik = mergePlutchik(
    vadMapped,
    analysis.emotions,
    analysis.fromModel,
  );
  const ekman = mapPlutchikToEkman(plutchik);

  const intensity = clamp01(
    Math.max(
      ...(Object.values(plutchik) as number[]),
      Math.abs(valence),
      Math.abs(arousal),
    ) * 0.9,
  );

  const dominantEmotion = dominantEmotionOf(plutchik);
  const history = [
    ...state.history,
    {
      timestamp: now,
      valence,
      arousal,
      dominance,
      dominantEmotion,
    },
  ].slice(-48);

  return {
    ...state,
    valence,
    arousal,
    dominance,
    plutchik,
    ekman,
    intensity,
    dominantEmotion,
    history,
    intelligence: updateIntelligence(state, analysis),
    somaticMarkers: updateSomaticMarkers(state, analysis, now),
  };
}

function updateIntelligence(
  state: EmotionalState,
  analysis: MessageAnalysis,
): EmotionalState['intelligence'] {
  const intelligence = state.intelligence;
  const experience = clamp01(
    analysis.arousal * 0.5 + Math.abs(analysis.valence) * 0.5,
  );
  return {
    selfAwareness: clamp01(
      intelligence.selfAwareness + 0.0004 + experience * 0.002,
    ),
    selfRegulation: clamp01(
      intelligence.selfRegulation +
        (state.regulationEffectiveness - 0.4) * 0.001 +
        experience * 0.001,
    ),
    empathy: clamp01(
      intelligence.empathy +
        (analysis.emotions.joy !== undefined ||
        analysis.emotions.sadness !== undefined
          ? 0.002
          : 0) +
        experience * 0.001,
    ),
    socialSkills: clamp01(intelligence.socialSkills + experience * 0.001),
  };
}

function updateSomaticMarkers(
  state: EmotionalState,
  analysis: MessageAnalysis,
  now: number,
): SomaticMarker[] {
  const strongImpact =
    Math.abs(analysis.valence) > 0.55 || analysis.traumaRisk > 0.5;
  if (!strongImpact || !analysis.topics.length) return state.somaticMarkers;

  const trigger = analysis.topics[0];
  const existing = state.somaticMarkers.find(
    (marker) => marker.trigger === trigger,
  );
  if (existing) {
    return state.somaticMarkers.map((marker) =>
      marker.id === existing.id
        ? {
            ...marker,
            strength: clamp01(marker.strength + 0.12),
            reinforcementCount: marker.reinforcementCount + 1,
          }
        : marker,
    );
  }

  const marker: SomaticMarker = {
    id: createId('marker'),
    trigger,
    valence: analysis.valence,
    strength: clamp01(
      Math.abs(analysis.valence) * 0.7 + analysis.arousal * 0.3,
    ),
    createdAt: now,
    reinforcementCount: 1,
  };
  return [...state.somaticMarkers, marker].slice(-12);
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

export function neutralEkmanOf(): EkmanEmotions {
  return {
    happiness: 0.12,
    sadness: 0.05,
    fear: 0.05,
    anger: 0.04,
    surprise: 0.04,
    disgust: 0.03,
  };
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}
