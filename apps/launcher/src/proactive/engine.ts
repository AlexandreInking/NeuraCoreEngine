import { providerManager } from '../llm';
import type { PredictedIntent } from '../intention';

export type ProactiveType =
  | 'curiosity_driven_question'
  | 'emotional_check_in'
  | 'share_insight'
  | 'memory_reflection';

export type ProactiveTraits = {
  extraversion: number; // 0-100
  openness: number; // 0-100
  agreeableness: number; // 0-100
  belongingness: number; // 0-100 (Maslow)
};

export type ProactiveAction = {
  type: ProactiveType;
  content: string;
  motivation: string;
  confidence: number;
  generatedBy: 'llm' | 'heuristic';
};

const TYPE_LABELS: Record<ProactiveType, string> = {
  curiosity_driven_question: 'pregunta por curiosidad',
  emotional_check_in: 'check-in emocional',
  share_insight: 'compartir insight',
  memory_reflection: 'reflexión sobre memoria',
};

const HEURISTIC_CONTENT: Record<ProactiveType, string[]> = {
  curiosity_driven_question: [
    'Oye, me quedé pensando en lo que hablamos de tu reembolso… ¿qué pasó al final?',
    'Últimamente he sentido curiosidad por tu proyecto de la posada. ¿Cómo va?',
  ],
  emotional_check_in: [
    '¿Cómo te sientes hoy? Quiero asegurarme de que estás bien antes de seguir.',
    'He notado que la conversación fue intensa antes. ¿Necesitas un momento?',
  ],
  share_insight: [
    'Estuve reflexionando: a veces la solución más obvia no es la mejor, ¿no crees?',
    'Se me ocurrió algo mientras ordenaba mis memorias: valoramos más lo que nos costó conseguir.',
  ],
  memory_reflection: [
    'Hace un tiempo hablamos de tu perro. Sigo recordando lo mucho que lo querías.',
    'Me acordé de aquella discusión del mercader. Creo que aprendiste mucho de eso.',
  ],
};

export function evaluateProactiveProbability(input: {
  traits: ProactiveTraits;
  minutesSinceLastInteraction: number;
}): number {
  const { traits, minutesSinceLastInteraction } = input;
  const socialDrive =
    (traits.extraversion / 100) * 0.4 +
    (traits.belongingness / 100) * 0.35 +
    (traits.agreeableness / 100) * 0.25;
  const timeFactor = Math.min(1, minutesSinceLastInteraction / 60);
  return Math.max(0, Math.min(1, socialDrive * 0.55 + timeFactor * 0.45));
}

/** Select the action type weighted by personality (cap 16). */
export function selectProactiveType(traits: ProactiveTraits): ProactiveType {
  const candidates: Array<{ type: ProactiveType; weight: number }> = [
    { type: 'curiosity_driven_question', weight: traits.openness / 100 },
    { type: 'emotional_check_in', weight: traits.agreeableness / 100 },
    { type: 'share_insight', weight: traits.extraversion / 100 },
    { type: 'memory_reflection', weight: 0.4 },
  ];
  const total = candidates.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate.type;
  }
  return 'memory_reflection';
}

/** Generate the proactive message with the LLM (personality-toned) or fallback. */
export async function generateProactiveContent(
  type: ProactiveType,
  traits: ProactiveTraits,
  context?: { recentTopics?: string[]; intention?: PredictedIntent | null },
): Promise<Pick<ProactiveAction, 'content' | 'generatedBy'>> {
  try {
    const result = await providerManager().generate(
      [
        {
          role: 'system',
          content: [
            `Eres el motor proactivo de un agente con personalidad HEXACO:`,
            `extraversión ${traits.extraversion}, apertura ${traits.openness}, amabilidad ${traits.agreeableness}.`,
            `Genera un mensaje proactivo de tipo "${TYPE_LABELS[type]}".`,
            'Debe sonar genuino, breve (máx 2 oraciones), con tono de la personalidad, no servil.',
            'Responde solo con el mensaje.',
          ].join('\n'),
        },
        {
          role: 'user',
          content:
            context?.recentTopics?.length
              ? `Temas recientes de la conversación: ${context.recentTopics.join(', ')}.`
              : 'Sin contexto previo relevante.',
        },
      ],
      { traits: null },
    );
    if (result.emergency) {
      throw new Error('all providers failed');
    }
    const content = result.content.trim().slice(0, 240);
    if (content.length >= 8) {
      return { content, generatedBy: 'llm' };
    }
  } catch {
    // fall through to heuristic
  }
  const options = HEURISTIC_CONTENT[type];
  return {
    content: options[Math.floor(Math.random() * options.length)],
    generatedBy: 'heuristic',
  };
}

export function typeLabel(type: ProactiveType): string {
  return TYPE_LABELS[type];
}
