export const COGNITION_VERSION = 2;

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

export const EMOTION_COLORS: Record<EmotionLabel, string> = {
  joy: '#10b981',
  trust: '#14b8a6',
  fear: '#a855f7',
  surprise: '#f59e0b',
  sadness: '#3b82f6',
  disgust: '#94a3b8',
  anger: '#dc2626',
  anticipation: '#f97316',
  neutral: '#64748b',
};

/** Ekman universal emotions (0..1 each). */
export type EkmanEmotions = {
  happiness: number;
  sadness: number;
  fear: number;
  anger: number;
  surprise: number;
  disgust: number;
};

export const EKMAN_LABELS: Record<keyof EkmanEmotions, string> = {
  happiness: 'Felicidad',
  sadness: 'Tristeza',
  fear: 'Miedo',
  anger: 'Ira',
  surprise: 'Sorpresa',
  disgust: 'Disgusto',
};

export type EmotionalHistoryEntry = {
  timestamp: number;
  valence: number;
  arousal: number;
  dominance: number;
  dominantEmotion: EmotionLabel;
};

export type SomaticMarker = {
  id: string;
  trigger: string;
  valence: number; // -1..1
  strength: number; // 0..1
  createdAt: number;
  reinforcementCount: number;
};

export type EmotionalIntelligence = {
  selfAwareness: number; // 0..1
  selfRegulation: number; // 0..1
  empathy: number; // 0..1
  socialSkills: number; // 0..1
};

export type EmotionalState = {
  valence: number; // -1..1
  arousal: number; // -1..1
  dominance: number; // -1..1
  plutchik: PlutchikEmotions; // 0..1 each
  ekman: EkmanEmotions; // 0..1 each
  intensity: number; // 0..1
  dominantEmotion: EmotionLabel;
  baseline: { valence: number; arousal: number; dominance: number };
  emotionalInertiaGamma: number; // 0.01..0.99
  history: EmotionalHistoryEntry[];
  intelligence: EmotionalIntelligence;
  contagionSusceptibility: number; // 0..1
  regulationEffectiveness: number; // 0..1
  somaticMarkers: SomaticMarker[];
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

/** Jungian archetypes (0..100 each). */
export type JungianArchetypes = {
  persona: number; // social mask
  shadow: number; // repressed aspects
  animaAnimus: number; // contrasexual aspect
  self: number; // total integration
  activeArchetype: 'persona' | 'shadow' | 'anima_animus' | 'self';
};

export const ARCHETYPE_LABELS: Record<
  JungianArchetypes['activeArchetype'],
  string
> = {
  persona: 'Persona',
  shadow: 'Sombra',
  anima_animus: 'Anima/Animus',
  self: 'Self',
};

export type DefenseKey =
  | 'repression'
  | 'projection'
  | 'displacement'
  | 'sublimation'
  | 'rationalization'
  | 'denial';

export const DEFENSE_LABELS: Record<DefenseKey, string> = {
  repression: 'Represión',
  projection: 'Proyección',
  displacement: 'Desplazamiento',
  sublimation: 'Sublimación',
  rationalization: 'Racionalización',
  denial: 'Negación',
};

export type DefenseMechanisms = Record<DefenseKey, number> & {
  activeDefense: DefenseKey;
};

export type NeedKey =
  'physiological' | 'safety' | 'belongingness' | 'esteem' | 'selfActualization';

export const NEED_LABELS: Record<NeedKey, string> = {
  physiological: 'Fisiológicas',
  safety: 'Seguridad',
  belongingness: 'Pertenencia',
  esteem: 'Estima',
  selfActualization: 'Autorrealización',
};

export type MaslowNeeds = Record<NeedKey, number> & {
  currentFocus: NeedKey;
};

export type AttachmentStyle =
  'secure' | 'anxious' | 'avoidant' | 'disorganized';

export const ATTACHMENT_LABELS: Record<AttachmentStyle, string> = {
  secure: 'Seguro',
  anxious: 'Ansioso',
  avoidant: 'Evitativo',
  disorganized: 'Desorganizado',
};

export type ShadowProfile = {
  aggression: number; // 0..100
  fearfulness: number;
  desire: number;
  rebellion: number;
};

export type HeartMindAlignment = {
  coherenceLevel: number; // 0..1
  conflictIntensity: number; // 0..1
  dominantSystem: 'rational' | 'emotional' | 'integrated' | 'conflicted';
  resolutionStrategy:
    | 'integration'
    | 'rational_override'
    | 'emotional_override'
    | 'delay_decision';
};

export type DecisionSnapshot = {
  id: string;
  timestamp: number;
  context: string;
  logicalAction: string;
  emotionalAction: string;
  alignment: HeartMindAlignment;
  chosen: string;
};

export type CognitiveState = {
  version: typeof COGNITION_VERSION;
  agentId: string;
  personality: {
    conscious: TraitProfile;
    subconscious: TraitProfile;
    moral: { conscious: MoralAlignment; subconscious: MoralAlignment };
    jungian: JungianArchetypes;
    shadow: ShadowProfile;
    psychodynamics: {
      conflictLevel: number; // 0..1
      dominantAspect: 'conscious' | 'subconscious' | 'balanced' | 'conflicted';
      defenseMechanisms: DefenseMechanisms;
      attachmentStyle: AttachmentStyle;
      selfEfficacy: number; // 0..100
      needsHierarchy: MaslowNeeds;
      positiveBias: number; // 0..1 running trust balance
    };
    conflictLevel: number; // derived, kept for convenience
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
  decisions: {
    recent: DecisionSnapshot[];
    heartMind: HeartMindAlignment;
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
  activeArchetype: JungianArchetypes['activeArchetype'];
  activeDefense: DefenseKey;
  currentNeed: NeedKey;
  heartMind: HeartMindAlignment;
};
