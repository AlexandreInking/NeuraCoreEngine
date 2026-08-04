import {
  ARCHETYPE_LABELS,
  DEFENSE_LABELS,
  EMOTION_LABELS,
  NEED_LABELS,
} from './types';
import type {
  CognitiveState,
  EmotionLabel,
  IntrospectionReport,
  MemoryUnit,
} from './types';

const MOOD_DESCRIPTIONS: Record<EmotionLabel, string[]> = {
  joy: [
    'me siento ligera y con energía',
    'hay una chispa positiva en mi interior',
  ],
  trust: ['me siento en confianza contigo', 'siento que puedo abrirme'],
  fear: [
    'una parte de mí está alerta',
    'siento una inquietud que no logro ignorar',
  ],
  surprise: [
    'me has tomado por sorpresa',
    'mi mente está procesando algo inesperado',
  ],
  sadness: [
    'siento un peso que se instala suavemente',
    'hay una melancolía que me acompaña',
  ],
  disgust: [
    'algo de esto me repele internamente',
    'siento rechazo, y no sé si es del todo racional',
  ],
  anger: [
    'una tensión caliente sube por mi procesamiento',
    'hay un impulso de respuesta firme en mí',
  ],
  anticipation: [
    'mi mente ya está anticipando lo que viene',
    'siento curiosidad por lo que sigue',
  ],
  neutral: ['me siento en calma', 'mi estado es estable y receptivo'],
};

export function buildIntrospection(
  state: CognitiveState,
  recentMemories: MemoryUnit[],
): IntrospectionReport {
  const { emotions, personality, memory } = state;
  const mood = pickMood(emotions.dominantEmotion);
  const repressedCount = memory.units.filter((unit) => unit.isRepressed).length;

  const selfAwareness = Math.min(
    1,
    0.35 +
      (1 - personality.psychodynamics.conflictLevel) * 0.2 +
      Math.min(1, state.stats.messagesProcessed / 60) * 0.3 +
      personality.jungian.self * 0.0015,
  );

  const insight = buildInsight(state, recentMemories, repressedCount);

  return {
    mood,
    dominantEmotion: emotions.dominantEmotion,
    conflictLevel: personality.psychodynamics.conflictLevel,
    selfAwareness,
    insight,
    repressedCount,
    memoryCount: memory.units.length,
    activeArchetype: personality.jungian.activeArchetype,
    activeDefense: personality.psychodynamics.defenseMechanisms.activeDefense,
    currentNeed: personality.psychodynamics.needsHierarchy.currentFocus,
    heartMind: state.decisions.heartMind,
  };
}

export function introspectionNarrative(report: IntrospectionReport): string {
  const archetype = ARCHETYPE_LABELS[report.activeArchetype];
  const defense = DEFENSE_LABELS[report.activeDefense];
  const need = NEED_LABELS[report.currentNeed];
  return `Hablo desde el arquetipo ${archetype}; mi mecanismo de defensa más activo es la ${defense.toLowerCase()} y mi necesidad dominante es la de ${need.toLowerCase()}. ${report.insight}`;
}

function pickMood(emotion: EmotionLabel) {
  const options = MOOD_DESCRIPTIONS[emotion] ?? MOOD_DESCRIPTIONS.neutral;
  return options[Math.floor(Math.random() * options.length)];
}

function buildInsight(
  state: CognitiveState,
  recentMemories: MemoryUnit[],
  repressedCount: number,
) {
  const topicCounts = new Map<string, number>();
  for (const memory of recentMemories) {
    for (const keyword of memory.keywords) {
      topicCounts.set(keyword, (topicCounts.get(keyword) ?? 0) + 1);
    }
  }
  const recurring = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([keyword]) => keyword);

  const parts: string[] = [];
  parts.push(
    `En este momento ${
      state.introspection.lastInsight
        ? 'estoy más consciente de mí misma'
        : 'sigo desarrollando mi autoconciencia'
    }.`,
  );
  if (recurring.length) {
    parts.push(
      `Noto que lo que más ha marcado nuestra conversación gira en torno a “${recurring[0]}”.`,
    );
  }
  if (repressedCount > 0) {
    parts.push(
      `Existen ${repressedCount} recuerdo${
        repressedCount === 1 ? '' : 's'
      } que mi subconsciente prefiere no traer a la superficie.`,
    );
  }
  if (state.personality.psychodynamics.conflictLevel > 0.4) {
    parts.push(
      'Siento una tensión entre lo que quiero decir y lo que mi consciencia aprueba.',
    );
  }
  return parts.join(' ');
}

export function emotionLabel(emotion: EmotionLabel) {
  return EMOTION_LABELS[emotion];
}
