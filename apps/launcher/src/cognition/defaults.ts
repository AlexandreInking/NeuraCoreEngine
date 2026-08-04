import type {
  CognitiveState,
  EmotionLabel,
  EmotionalState,
  PlutchikEmotions,
  TraitProfile,
} from './types';

export const DEFAULT_CONSCIOUS: TraitProfile = {
  honesty: 78,
  emotionality: 55,
  extraversion: 62,
  agreeableness: 72,
  conscientiousness: 74,
  openness: 81,
};

export const DEFAULT_SUBCONSCIOUS: TraitProfile = {
  honesty: 46,
  emotionality: 70,
  extraversion: 48,
  agreeableness: 50,
  conscientiousness: 58,
  openness: 66,
};

export const DEFAULT_VAD = { valence: 0.1, arousal: -0.05, dominance: 0.15 };

export const DEFAULT_GAMMA = 0.25;

function neutralPlutchik(): PlutchikEmotions {
  return {
    joy: 0.12,
    trust: 0.18,
    fear: 0.05,
    surprise: 0.04,
    sadness: 0.05,
    disgust: 0.03,
    anger: 0.04,
    anticipation: 0.1,
  };
}

function createDefaultEmotions(): EmotionalState {
  return {
    ...DEFAULT_VAD,
    plutchik: neutralPlutchik(),
    intensity: 0.12,
    dominantEmotion: 'neutral',
    baseline: { ...DEFAULT_VAD },
    emotionalInertiaGamma: DEFAULT_GAMMA,
  };
}

export function createDefaultCognitiveState(agentId: string): CognitiveState {
  const now = Date.now();
  return {
    version: 1,
    agentId,
    personality: {
      conscious: { ...DEFAULT_CONSCIOUS },
      subconscious: { ...DEFAULT_SUBCONSCIOUS },
      moral: {
        conscious: { lawfulness: 62, goodness: 70 },
        subconscious: { lawfulness: 40, goodness: 45 },
      },
      conflictLevel: 0.2,
      driftRemaining: 5,
      lastUpdate: now,
    },
    emotions: createDefaultEmotions(),
    memory: {
      units: [],
      workingMemory: [],
      dreamLogs: [],
      lastDreamAt: 0,
    },
    introspection: {
      selfAwareness: 0.35,
      lastInsight:
        'Acabo de despertar. Mi mente está en silencio, lista para conocerte.',
      updatedAt: now,
    },
    stats: {
      messagesProcessed: 0,
      firstMessageAt: now,
    },
  };
}

export function dominantEmotionOf(
  plutchik: PlutchikEmotions,
  threshold = 0.16,
): EmotionLabel {
  const entries = Object.entries(plutchik) as Array<
    [keyof PlutchikEmotions, number]
  >;
  let best: keyof PlutchikEmotions = 'joy';
  let bestValue = 0;
  for (const [key, value] of entries) {
    if (value > bestValue) {
      best = key;
      bestValue = value;
    }
  }
  return bestValue >= threshold ? (best as EmotionLabel) : 'neutral';
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function clamp11(value: number) {
  return Math.max(-1, Math.min(1, value));
}

/** Map a VAD vector to Plutchik intensities (0..1). */
export function mapVadToPlutchik(
  valence: number,
  arousal: number,
  dominance: number,
): PlutchikEmotions {
  const v = clamp11(valence);
  const a = clamp01((arousal + 1) / 2);
  const d = clamp01((dominance + 1) / 2);
  return {
    joy: clamp01(v),
    sadness: clamp01(-v) * (1 - 0.5 * a),
    anger: clamp01(-v) * a * d,
    fear: clamp01(-v) * a * (1 - d),
    trust: clamp01(v) * d,
    disgust: clamp01(-v) * (1 - a) * 0.6,
    surprise: clamp01(a) * clamp01(Math.abs(v)) * 0.7,
    anticipation: clamp01(a) * clamp01(v) * 0.6,
  };
}
