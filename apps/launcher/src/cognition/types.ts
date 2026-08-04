export const COGNITION_VERSION = 1;

export type TraitKey =
  | 'honesty'
  | 'emotionality'
  | 'extraversion'
  | 'agreeableness'
  | 'conscientiousness'
  | 'openness';

/** HEXACO trait values, 0–100. */
export type TraitProfile = Record<TraitKey, number>;

export const TRAIT_KEYS: TraitKey[] = [
  'honesty',
  'emotionality',
  'extraversion',
  'agreeableness',
  'conscientiousness',
  'openness',
];

export type TraitLabel = Record<TraitKey, string>;

export const TRAIT_LABELS: TraitLabel = {
  honesty: 'Honestidad-Humildad',
  emotionality: 'Emocionalidad',
  extraversion: 'Extraversión',
  agreeableness: 'Amabilidad',
  conscientiousness: 'Conciencia',
  openness: 'Apertura',
};

/** Moral alignment: lawfulness (0 chaotic → 100 lawful) and goodness (0 evil → 100 good). */
export type MoralAlignment = {
  lawfulness: number;
  goodness: number;
};

export type PlutchikEmotions = {
  joy: number;
  trust: number;
  fear: number;
  surprise: number;
  sadness: number;
  disgust: number;
  anger: number;
  anticipation: number;
};

export type EmotionLabel =
  | 'joy'
  | 'trust'
  | 'fear'
  | 'surprise'
  | 'sadness'
  | 'disgust'
  | 'anger'
  | 'anticipation'
  | 'neutral';

export const EMOTION_LABELS: Record<EmotionLabel, string> = {
  joy: 'Alegría',
  trust: 'Confianza',
  fear: 'Miedo',
  surprise: 'Sorpresa',
  sadness: 'Tristeza',
  disgust: 'Disgusto',
  anger: 'Ira',
  anticipation: 'Anticipación',
  neutral: 'Neutro',
};

export type EmotionalState = {
  valence: number; // -1..1
  arousal: number; // -1..1
  dominance: number; // -1..1
  plutchik: PlutchikEmotions; // 0..1 each
  intensity: number; // 0..1
  dominantEmotion: EmotionLabel;
  baseline: { valence: number; arousal: number; dominance: number };
  emotionalInertiaGamma: number; // 0.01..0.99
};

export type MemoryUnit = {
  id: string;
  content: string;
  speaker: 'user' | 'assistant';
  type: 'episodic' | 'semantic';
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
  strength: number; // 0..1 (Ebbinghaus current strength)
  initialStrength: number;
  decayRate: number; // half-life in hours
  valence: number; // -1..1
  arousal: number; // 0..1
  importance: number; // 0..1
  isRepressed: boolean;
  repressionStrength: number; // 0..1
  keywords: string[];
};

export type DreamLog = {
  id: string;
  timestamp: number;
  insights: string[];
  consolidatedCount: number;
  resolvedConflicts: number;
};

export type CognitiveState = {
  version: typeof COGNITION_VERSION;
  agentId: string;
  personality: {
    conscious: TraitProfile;
    subconscious: TraitProfile;
    moral: { conscious: MoralAlignment; subconscious: MoralAlignment };
    conflictLevel: number; // 0..1
    driftRemaining: number; // personality points left to spend today (≤ 5)
    lastUpdate: number;
  };
  emotions: EmotionalState;
  memory: {
    units: MemoryUnit[];
    workingMemory: string[]; // ids of the most recent units
    dreamLogs: DreamLog[];
    lastDreamAt: number;
  };
  introspection: {
    selfAwareness: number; // 0..1
    lastInsight: string;
    updatedAt: number;
  };
  stats: {
    messagesProcessed: number;
    firstMessageAt: number;
  };
};

/** Structured result of analysing a user message. */
export type MessageAnalysis = {
  valence: number; // -1..1
  arousal: number; // 0..1
  dominance: number; // -1..1
  emotions: Partial<PlutchikEmotions>; // 0..1
  intention: string;
  topics: string[];
  traumaRisk: number; // 0..1
  fromModel: boolean;
};

export type IntrospectionReport = {
  mood: string;
  dominantEmotion: EmotionLabel;
  conflictLevel: number;
  selfAwareness: number;
  insight: string;
  repressedCount: number;
  memoryCount: number;
};
