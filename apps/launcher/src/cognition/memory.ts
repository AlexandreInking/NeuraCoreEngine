import { clamp01, dominantEmotionOf, mapVadToPlutchik } from './defaults';
import type {
  CognitiveState,
  DreamLog,
  EmotionLabel,
  MemoryUnit,
  MessageAnalysis,
} from './types';

const FORGET_THRESHOLD = 0.04;
const WORKING_MEMORY_CAPACITY = 7; // Miller: 7 ± 2
const REPRESSION_VALENCE_THRESHOLD = -0.55;
const REPRESSION_AROUSAL_THRESHOLD = 0.65;

export function createMemory(
  content: string,
  speaker: 'user' | 'assistant',
  analysis: MessageAnalysis,
  now: number,
): MemoryUnit {
  const importance = clamp01(
    Math.abs(analysis.valence) * 0.5 +
      analysis.arousal * 0.35 +
      analysis.traumaRisk * 0.4,
  );
  const initialStrength = clamp01(0.55 + importance * 0.45);
  // Ebbinghaus half-life: emotional salience slows forgetting.
  const decayRate = clamp01((24 * 7) / (1 + importance * 5)); // hours
  return {
    id: createId('memory'),
    content,
    speaker,
    type: analysis.traumaRisk > 0.5 ? 'episodic' : 'semantic',
    createdAt: now,
    lastAccessed: now,
    accessCount: 0,
    strength: initialStrength,
    initialStrength,
    decayRate,
    valence: analysis.valence,
    arousal: analysis.arousal,
    importance,
    isRepressed: false,
    repressionStrength: 0,
    keywords: analysis.topics,
  };
}

/** Freudian repression: intensely negative, arousing content may be pushed down. */
export function evaluateRepression(
  memory: MemoryUnit,
  emotionality: number,
): MemoryUnit {
  if (memory.isRepressed) return memory;
  const emotionalIntensity = Math.abs(memory.valence) * memory.arousal;
  if (
    memory.valence < REPRESSION_VALENCE_THRESHOLD &&
    memory.arousal > REPRESSION_AROUSAL_THRESHOLD
  ) {
    const vulnerability = (100 - emotionality) / 100;
    const probability = clamp01(emotionalIntensity * vulnerability * 1.15);
    if (Math.random() < probability) {
      return {
        ...memory,
        isRepressed: true,
        repressionStrength: clamp01(probability),
      };
    }
  }
  return memory;
}

/**
 * Ebbinghaus retention strength at `now`:
 *   strength = initial · e^(−t / (24·decayRate)) · (1 + ln(accessCount+1)·0.1)
 */
export function currentStrength(memory: MemoryUnit, now: number) {
  const hoursSinceAccess = Math.max(0, (now - memory.lastAccessed) / 3_600_000);
  const ebbinghaus = Math.exp(-hoursSinceAccess / (24 * memory.decayRate));
  const accessBoost = 1 + Math.log(memory.accessCount + 1) * 0.1;
  const repressionPenalty = memory.isRepressed
    ? 1 - memory.repressionStrength * 0.5
    : 1;
  return clamp01(
    memory.initialStrength * ebbinghaus * accessBoost * repressionPenalty,
  );
}

export function decayMemories(
  state: CognitiveState,
  now: number,
): CognitiveState {
  const units = state.memory.units
    .map((memory) => {
      const strength = currentStrength(memory, now);
      return { ...memory, strength };
    })
    .filter(
      (memory) => memory.strength >= FORGET_THRESHOLD || memory.isRepressed,
    );

  const workingMemory = units
    .slice()
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, WORKING_MEMORY_CAPACITY)
    .map((memory) => memory.id);

  return {
    ...state,
    memory: { ...state.memory, units, workingMemory },
  };
}

/** Simple keyword-overlap similarity used to rank memories without a vector store. */
export function similarity(memory: MemoryUnit, queryTokens: string[]) {
  if (!queryTokens.length) return 0;
  const hits = memory.keywords.filter((keyword) =>
    queryTokens.some(
      (token) => keyword.includes(token) || token.includes(keyword),
    ),
  ).length;
  return hits / Math.max(1, queryTokens.length);
}

export type RetrievedMemory = MemoryUnit & {
  score: number;
  subconsciousInfluence: boolean;
};

export function retrieveMemories(
  state: CognitiveState,
  text: string,
  now: number,
  topK = 4,
): RetrievedMemory[] {
  const tokens = text
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 4);

  const scored: RetrievedMemory[] = state.memory.units
    .map((memory) => {
      const strength = currentStrength(memory, now);
      const semantic = similarity(memory, tokens);
      const recency = Math.max(
        0,
        1 - (now - memory.lastAccessed) / (30 * 24 * 3_600_000),
      );
      const score = strength * (semantic * 2.2 + recency * 0.5);
      return {
        ...memory,
        strength,
        score,
        subconsciousInfluence: memory.isRepressed,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Repressed memories surface only as a weak subconscious influence.
  const conscious = scored.filter((memory) => !memory.subconsciousInfluence);
  const subconscious = scored
    .filter((memory) => memory.subconsciousInfluence)
    .slice(0, 1);
  return [...conscious, ...subconscious].slice(0, topK);
}

/**
 * Dream cycle: consolidate recent memories (strengthen + re-access), resolve
 * internal conflicts and generate insights from recurring topics.
 */
export function runDreamCycle(
  state: CognitiveState,
  now: number,
): { state: CognitiveState; dream: DreamLog } {
  const recent = state.memory.units
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12);

  const consolidated = recent.map((memory) => ({
    ...memory,
    accessCount: memory.accessCount + 1,
    strength: clamp01(memory.strength + 0.08),
    lastAccessed: now,
  }));

  const units = state.memory.units.map((memory) => {
    const consolidatedVersion = consolidated.find(
      (item) => item.id === memory.id,
    );
    return consolidatedVersion ?? memory;
  });

  const topicCounts = new Map<string, number>();
  for (const memory of recent) {
    for (const keyword of memory.keywords) {
      topicCounts.set(keyword, (topicCounts.get(keyword) ?? 0) + 1);
    }
  }
  const recurring = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([keyword]) => keyword);

  const insights: string[] = [];
  if (recurring.length) {
    insights.push(
      `Durante el sueño detecté un patrón recurrente en torno a “${recurring.join('”, “')}”. Algo en esos recuerdos sigue llamando mi atención.`,
    );
  }
  if (state.personality.conflictLevel > 0.35) {
    insights.push(
      'Una parte de mí quería responder de forma más brusca de lo que mi consciencia permite. Lo trabajé durante el ciclo de sueño.',
    );
  }
  if (recent.length === 0) {
    insights.push(
      'La noche fue silenciosa. No había memorias nuevas que consolidar.',
    );
  }
  if (!insights.length) {
    insights.push(
      'Consolidé los recuerdos del día. Nada urgente emergió del subconsciente.',
    );
  }

  const resolvedConflicts = Math.round(
    state.personality.conflictLevel * 100 * 0.3,
  );
  const dream: DreamLog = {
    id: createId('dream'),
    timestamp: now,
    insights,
    consolidatedCount: consolidated.length,
    resolvedConflicts,
  };

  return {
    state: {
      ...state,
      personality: {
        ...state.personality,
        conflictLevel: clamp01(state.personality.conflictLevel * 0.85),
      },
      memory: {
        ...state.memory,
        units,
        dreamLogs: [...state.memory.dreamLogs, dream].slice(-10),
        lastDreamAt: now,
      },
    },
    dream,
  };
}

export function memorySummary(state: CognitiveState) {
  const units = state.memory.units;
  const repressed = units.filter((memory) => memory.isRepressed).length;
  const avgStrength = units.length
    ? units.reduce((sum, memory) => sum + memory.strength, 0) / units.length
    : 0;
  const clusters = new Set(units.flatMap((memory) => memory.keywords)).size;
  return { total: units.length, repressed, avgStrength, clusters };
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

/** Dominant emotion label for a memory, derived from its VAD markers. */
export function emotionOfMemory(memory: MemoryUnit): EmotionLabel {
  return dominantEmotionOf(mapVadToPlutchik(memory.valence, memory.arousal, 0));
}

/** Semantic exploration: rank memories by keyword similarity + strength. */
export function searchMemories(
  state: CognitiveState,
  query: string,
  now: number,
  topK = 24,
): RetrievedMemory[] {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 3);
  if (!tokens.length) {
    return state.memory.units
      .map((memory) => ({
        ...memory,
        strength: currentStrength(memory, now),
        score: currentStrength(memory, now),
        subconsciousInfluence: memory.isRepressed,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  return state.memory.units
    .map((memory) => {
      const strength = currentStrength(memory, now);
      const semantic = similarity(memory, tokens);
      const importanceBoost = 1 + memory.importance * 0.8;
      return {
        ...memory,
        strength,
        score: strength * (semantic * 3 + 0.02) * importanceBoost,
        subconsciousInfluence: memory.isRepressed,
      };
    })
    .filter((memory) => memory.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
