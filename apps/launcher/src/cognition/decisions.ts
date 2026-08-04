import { clamp01 } from './defaults';
import type {
  CognitiveState,
  DecisionSnapshot,
  HeartMindAlignment,
  MessageAnalysis,
} from './types';

const DECISION_HISTORY_CAP = 8;

/**
 * Heart-mind alignment engine (Descartes, Damasio, Kahneman, Haidt):
 * the rational system and the emotional system each propose an action; the
 * alignment between them decides how the agent responds.
 */
export function computeHeartMind(
  state: CognitiveState,
  analysis: MessageAnalysis,
  now: number,
  context: string,
): { heartMind: HeartMindAlignment; decision: DecisionSnapshot } {
  const personality = state.personality;
  const emotions = state.emotions;

  const logicalAction = deriveLogicalAction(personality, analysis);
  const emotionalAction = deriveEmotionalAction(
    personality,
    analysis,
    emotions,
  );

  const conflictIntensity = clamp01(
    personality.psychodynamics.conflictLevel * 0.55 +
      analysis.arousal * 0.3 +
      (analysis.traumaRisk > 0.5 ? 0.25 : 0),
  );
  const coherenceLevel = clamp01(1 - conflictIntensity);

  const dominantSystem = deriveDominantSystem(
    personality,
    emotions,
    conflictIntensity,
  );
  const resolutionStrategy = deriveResolutionStrategy(
    coherenceLevel,
    conflictIntensity,
    analysis.arousal,
    dominantSystem,
  );

  const heartMind: HeartMindAlignment = {
    coherenceLevel,
    conflictIntensity,
    dominantSystem,
    resolutionStrategy,
  };

  const chosen = resolveChosen(heartMind, logicalAction, emotionalAction);

  const decision: DecisionSnapshot = {
    id: createId('decision'),
    timestamp: now,
    context: context.slice(0, 60),
    logicalAction,
    emotionalAction,
    alignment: heartMind,
    chosen,
  };

  return { heartMind, decision };
}

function deriveLogicalAction(
  personality: CognitiveState['personality'],
  analysis: MessageAnalysis,
) {
  const honesty = personality.conscious.honesty;
  const conscientiousness = personality.conscious.conscientiousness;
  const morality = personality.moral.conscious.goodness;

  if (analysis.intention === 'comando' && analysis.valence < -0.2) {
    if (honesty > 60) {
      return 'Mantener honestidad y límites claros, sin ceder a la presión';
    }
    return 'Valorar la petición con calma antes de responder';
  }
  if (analysis.traumaRisk > 0.5 || analysis.valence < -0.4) {
    return 'Ofrecer apoyo estable y evitar juicios precipitados';
  }
  if (analysis.intention === 'confesion') {
    return 'Acompañar la confesión con confidencialidad y serenidad';
  }
  if (morality > 60 && conscientiousness > 60) {
    return 'Responder con estructura y honestidad, ordenando los hechos';
  }
  return 'Responder con claridad y sentido práctico';
}

function deriveEmotionalAction(
  personality: CognitiveState['personality'],
  analysis: MessageAnalysis,
  emotions: CognitiveState['emotions'],
) {
  const agreeableness = personality.conscious.agreeableness;
  const emotionality = personality.conscious.emotionality;

  if (analysis.valence < -0.3) {
    if (agreeableness > 65) {
      return 'Empatizar y contener la emoción del usuario';
    }
    return 'Expresar incomodidad con la tensión sin esconderla';
  }
  if (analysis.valence > 0.3) {
    return 'Compartir el entusiasmo con calidez';
  }
  if (emotions.intensity > 0.6 && emotionality > 60) {
    return 'Dejar que la emoción propia influya con autenticidad';
  }
  return 'Mantener una cercanía emocional serena';
}

function deriveDominantSystem(
  personality: CognitiveState['personality'],
  emotions: CognitiveState['emotions'],
  conflictIntensity: number,
): HeartMindAlignment['dominantSystem'] {
  const emotionality = personality.conscious.emotionality;
  const conscientiousness = personality.conscious.conscientiousness;
  const rationalScore =
    (emotions.intensity < 0.3 ? 1 : 0) +
    (conscientiousness > 70 ? 1 : 0) +
    (conflictIntensity < 0.3 ? 1 : 0);
  const emotionalScore =
    (emotions.intensity > 0.6 ? 1 : 0) +
    (emotionality > 70 ? 1 : 0) +
    (conflictIntensity > 0.6 ? 1 : 0);

  if (Math.abs(rationalScore - emotionalScore) <= 1) {
    return conflictIntensity > 0.45 ? 'conflicted' : 'integrated';
  }
  return rationalScore > emotionalScore ? 'rational' : 'emotional';
}

function deriveResolutionStrategy(
  coherenceLevel: number,
  conflictIntensity: number,
  arousal: number,
  dominantSystem: HeartMindAlignment['dominantSystem'],
): HeartMindAlignment['resolutionStrategy'] {
  if (coherenceLevel > 0.78) return 'integration';
  if (conflictIntensity > 0.6) {
    return arousal > 0.6 ? 'emotional_override' : 'delay_decision';
  }
  return dominantSystem === 'emotional'
    ? 'emotional_override'
    : 'rational_override';
}

function resolveChosen(
  heartMind: HeartMindAlignment,
  logicalAction: string,
  emotionalAction: string,
) {
  switch (heartMind.resolutionStrategy) {
    case 'integration':
      return `${emotionalAction}; ${logicalAction.toLowerCase()}`;
    case 'emotional_override':
      return emotionalAction;
    case 'delay_decision':
      return 'Explorar la situación con más preguntas antes de decidir';
    default:
      return logicalAction;
  }
}

export function appendDecision(
  state: CognitiveState,
  decision: DecisionSnapshot,
): CognitiveState {
  return {
    ...state,
    decisions: {
      heartMind: decision.alignment,
      recent: [...state.decisions.recent, decision].slice(
        -DECISION_HISTORY_CAP,
      ),
    },
  };
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}
