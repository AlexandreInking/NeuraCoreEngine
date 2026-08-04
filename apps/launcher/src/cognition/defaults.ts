import type {
  CognitiveState,
  DefenseKey,
  DefenseMechanisms,
  EkmanEmotions,
  EmotionLabel,
  EmotionalState,
  JungianArchetypes,
  MaslowNeeds,
  NeedKey,
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

export const DEFAULT_JUNGIAN: JungianArchetypes = {
  persona: 55,
  shadow: 38,
  animaAnimus: 42,
  self: 30,
  activeArchetype: 'persona',
};

export const DEFAULT_SHADOW = {
  aggression: 24,
  fearfulness: 30,
  desire: 46,
  rebellion: 22,
};

export const DEFAULT_DEFENSES: DefenseMechanisms = {
  repression: 28,
  projection: 18,
  displacement: 22,
  sublimation: 34,
  rationalization: 26,
  denial: 14,
  activeDefense: 'sublimation',
};

export const DEFAULT_NEEDS: MaslowNeeds = {
  physiological: 70,
  safety: 65,
  belongingness: 48,
  esteem: 52,
  selfActualization: 58,
  currentFocus: 'belongingness',
};

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

function neutralEkman(): EkmanEmotions {
  return {
    happiness: 0.12,
    sadness: 0.05,
    fear: 0.05,
    anger: 0.04,
    surprise: 0.04,
    disgust: 0.03,
  };
}

function createDefaultEmotions(): EmotionalState {
  return {
    ...DEFAULT_VAD,
    plutchik: neutralPlutchik(),
    ekman: neutralEkman(),
    intensity: 0.12,
    dominantEmotion: 'neutral',
    baseline: { ...DEFAULT_VAD },
    emotionalInertiaGamma: DEFAULT_GAMMA,
    history: [],
    intelligence: {
      selfAwareness: 0.35,
      selfRegulation: 0.4,
      empathy: 0.5,
      socialSkills: 0.42,
    },
    contagionSusceptibility: 0.45,
    regulationEffectiveness: 0.5,
    somaticMarkers: [],
  };
}

export function createDefaultCognitiveState(agentId: string): CognitiveState {
  const now = Date.now();
  return {
    version: 2,
    agentId,
    personality: {
      conscious: { ...DEFAULT_CONSCIOUS },
      subconscious: { ...DEFAULT_SUBCONSCIOUS },
      moral: {
        conscious: { lawfulness: 62, goodness: 70 },
        subconscious: { lawfulness: 40, goodness: 45 },
      },
      jungian: { ...DEFAULT_JUNGIAN },
      shadow: { ...DEFAULT_SHADOW },
      psychodynamics: {
        conflictLevel: 0.2,
        dominantAspect: 'balanced',
        defenseMechanisms: { ...DEFAULT_DEFENSES },
        attachmentStyle: 'secure',
        selfEfficacy: 62,
        needsHierarchy: { ...DEFAULT_NEEDS },
        positiveBias: 0.5,
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
    decisions: {
      recent: [],
      heartMind: {
        coherenceLevel: 0.8,
        conflictIntensity: 0.2,
        dominantSystem: 'integrated',
        resolutionStrategy: 'integration',
      },
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

/** Map Plutchik to Ekman universal emotions. */
export function mapPlutchikToEkman(plutchik: PlutchikEmotions): EkmanEmotions {
  return {
    happiness: clamp01(plutchik.joy),
    sadness: clamp01(plutchik.sadness),
    fear: clamp01(plutchik.fear),
    anger: clamp01(plutchik.anger),
    surprise: clamp01(plutchik.surprise),
    disgust: clamp01(plutchik.disgust),
  };
}

export function lowestNeed(needs: Record<NeedKey, number>): NeedKey {
  const keys: NeedKey[] = [
    'physiological',
    'safety',
    'belongingness',
    'esteem',
    'selfActualization',
  ];
  let lowest: NeedKey = keys[0];
  let lowestValue = needs[keys[0]];
  for (const key of keys) {
    if (needs[key] < lowestValue) {
      lowest = key;
      lowestValue = needs[key];
    }
  }
  return lowest;
}

export function pickActiveDefense(
  defenses: Record<DefenseKey, number>,
): DefenseKey {
  const keys: DefenseKey[] = [
    'repression',
    'projection',
    'displacement',
    'sublimation',
    'rationalization',
    'denial',
  ];
  let best: DefenseKey = 'sublimation';
  let bestValue = -1;
  for (const key of keys) {
    if (defenses[key] > bestValue) {
      best = key;
      bestValue = defenses[key];
    }
  }
  return best;
}
