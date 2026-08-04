import { clamp01, lowestNeed, pickActiveDefense } from './defaults';
import type {
  AttachmentStyle,
  DefenseKey,
  DefenseMechanisms,
  EmotionalState,
  JungianArchetypes,
  MaslowNeeds,
  MessageAnalysis,
  MoralAlignment,
  TraitKey,
  TraitProfile,
} from './types';

const TRAITS: TraitKey[] = [
  'honesty',
  'emotionality',
  'extraversion',
  'agreeableness',
  'conscientiousness',
  'openness',
];

const DAILY_DRIFT_CAP = 5;

function shift(
  current: number,
  delta: number,
  available: number,
): { value: number; used: number } {
  const capped = Math.max(-available, Math.min(available, delta));
  return {
    value: Math.max(0, Math.min(100, current + capped)),
    used: Math.abs(capped),
  };
}

/**
 * Evolve the personality after an interaction (Bandura social influence +
 * Pavlovian conditioning), respecting the daily drift cap (≤ 5 points/day).
 */
export function updatePersonality(
  personality: CognitivePersonality,
  analysis: MessageAnalysis,
  emotions: EmotionalState,
  now: number,
): CognitivePersonality {
  const elapsingSinceUpdate = Math.max(
    0,
    (now - personality.lastUpdate) / 3_600_000,
  );
  const dayElapsed = elapsingSinceUpdate >= 24;
  const budget = dayElapsed ? DAILY_DRIFT_CAP : personality.driftRemaining;

  let conscious = { ...personality.conscious };
  let subconscious = { ...personality.subconscious };
  let used = 0;

  const apply = (key: TraitKey, delta: number, subconsciousFactor = 0.35) => {
    if (used >= budget) return;
    const available = Math.max(0, budget - used);
    const consciousShift = shift(conscious[key], delta, available);
    conscious = { ...conscious, [key]: consciousShift.value };
    used += consciousShift.used;
    const subDelta = delta * subconsciousFactor;
    const subAvailable = Math.max(0, budget - used);
    const subconsciousShift = shift(subconscious[key], subDelta, subAvailable);
    subconscious = { ...subconscious, [key]: subconsciousShift.value };
    used += subconsciousShift.used;
  };

  const positive = analysis.valence > 0.15;
  const negative = analysis.valence < -0.15;
  const intense = analysis.arousal > 0.6;

  if (positive) {
    apply('agreeableness', 1.6);
    apply('openness', 1.2);
    apply('extraversion', 1.1);
  } else if (negative) {
    apply('emotionality', 1.4);
    apply('agreeableness', -1.1);
    if (intense) apply('emotionality', 1.2);
  }
  if (analysis.intention === 'confesion' || analysis.traumaRisk > 0.6) {
    apply('emotionality', 1.3);
    apply('openness', 0.9);
  }

  const moral = updateMoralAlignment(
    personality.moral,
    analysis,
    personality.conscious.honesty,
  );

  const jungian = updateJungian(
    personality.jungian,
    analysis,
    personality.psychodynamics.conflictLevel,
  );
  const shadow = updateShadow(personality.shadow, analysis);
  const psychodynamics = updatePsychodynamics(
    personality.psychodynamics,
    analysis,
    emotions,
    conscious,
    subconscious,
    moral,
  );

  const conflictLevel = computeConflictLevel(
    conscious,
    subconscious,
    moral,
    psychodynamics.conflictLevel,
  );

  return {
    ...personality,
    conscious,
    subconscious,
    moral,
    jungian,
    shadow,
    psychodynamics,
    conflictLevel,
    driftRemaining: Math.max(0, budget - used),
    lastUpdate: now,
  };
}

function updateMoralAlignment(
  moral: { conscious: MoralAlignment; subconscious: MoralAlignment },
  analysis: MessageAnalysis,
  consciousHonesty: number,
): { conscious: MoralAlignment; subconscious: MoralAlignment } {
  const honestyNudge = consciousHonesty > 60 ? 0.6 : 0.2;
  let goodnessDelta = 0;
  let lawfulnessDelta = 0;

  if (analysis.intention === 'confesion') lawfulnessDelta += honestyNudge;
  if (analysis.traumaRisk > 0.5) goodnessDelta += 0.8;
  if (analysis.valence > 0.4) goodnessDelta += 0.4;
  if (analysis.intention === 'comando' && analysis.valence < -0.3) {
    lawfulnessDelta -= 0.3;
  }

  const consciousGoodness = clamp01(
    (moral.conscious.goodness + goodnessDelta * 0.8) / 100,
  );
  const subconsciousGoodness = clamp01(
    (moral.subconscious.goodness + goodnessDelta * 0.3) / 100,
  );

  return {
    conscious: {
      lawfulness: Math.max(
        0,
        Math.min(100, moral.conscious.lawfulness + lawfulnessDelta),
      ),
      goodness: Math.round(consciousGoodness * 100),
    },
    subconscious: {
      lawfulness: Math.max(
        0,
        Math.min(100, moral.subconscious.lawfulness + lawfulnessDelta * 0.3),
      ),
      goodness: Math.round(subconsciousGoodness * 100),
    },
  };
}

/** Jungian archetypes evolve: shadow grows with pain, self with integration. */
function updateJungian(
  jungian: JungianArchetypes,
  analysis: MessageAnalysis,
  conflictLevel: number,
): JungianArchetypes {
  let persona = jungian.persona;
  let shadow = jungian.shadow;
  let animaAnimus = jungian.animaAnimus;
  let self = jungian.self;

  const negative = analysis.valence < -0.15;
  const trauma = analysis.traumaRisk > 0.5;

  if (negative) {
    shadow = clamp01((shadow + 1.6 + (trauma ? 1.8 : 0)) / 100) * 100;
    persona = clamp01((persona - 0.6) / 100) * 100;
  }
  if (analysis.intention === 'confesion' || analysis.valence > 0.3) {
    self = clamp01((self + 0.9 + conflictLevel * 0.5) / 100) * 100;
    animaAnimus = clamp01((animaAnimus + 0.4) / 100) * 100;
  }
  // The self integrates the shadow instead of repressing it.
  if (self > 50 && shadow > self * 0.6) {
    shadow = clamp01((shadow - 0.4) / 100) * 100;
  }

  const active = pickActiveArchetype({ persona, shadow, animaAnimus, self });
  return { persona, shadow, animaAnimus, self, activeArchetype: active };
}

function pickActiveArchetype(
  archetypes: Pick<
    JungianArchetypes,
    'persona' | 'shadow' | 'animaAnimus' | 'self'
  >,
): JungianArchetypes['activeArchetype'] {
  const entries: Array<[JungianArchetypes['activeArchetype'], number]> = [
    ['persona', archetypes.persona],
    ['shadow', archetypes.shadow],
    ['anima_animus', archetypes.animaAnimus],
    ['self', archetypes.self],
  ];
  let best = entries[0];
  for (const entry of entries) {
    if (entry[1] > best[1]) best = entry;
  }
  return best[0];
}

function updateShadow(
  shadow: CognitivePersonality['shadow'],
  analysis: MessageAnalysis,
): CognitivePersonality['shadow'] {
  const negative = analysis.valence < -0.15;
  const intense = analysis.arousal > 0.6;
  return {
    aggression:
      clamp01(
        (shadow.aggression +
          (negative && intense ? 1.4 : negative ? 0.5 : -0.2)) /
          100,
      ) * 100,
    fearfulness:
      clamp01(
        (shadow.fearfulness +
          (analysis.emotions.fear ?? 0) * 2 +
          (negative ? 0.6 : 0)) /
          100,
      ) * 100,
    desire:
      clamp01(
        (shadow.desire +
          (analysis.emotions.anticipation ?? 0) * 2 +
          (analysis.emotions.joy ?? 0)) /
          100,
      ) * 100,
    rebellion:
      clamp01(
        (shadow.rebellion +
          (analysis.intention === 'comando' && negative ? 0.9 : -0.15)) /
          100,
      ) * 100,
  };
}

function updatePsychodynamics(
  psychodynamics: CognitivePersonality['psychodynamics'],
  analysis: MessageAnalysis,
  emotions: EmotionalState,
  conscious: TraitProfile,
  subconscious: TraitProfile,
  moral: { conscious: MoralAlignment; subconscious: MoralAlignment },
): CognitivePersonality['psychodynamics'] {
  const positiveBias = clamp01(
    psychodynamics.positiveBias * 0.85 +
      (analysis.valence > 0 ? 0.15 : analysis.valence < -0.15 ? -0.05 : 0),
  );

  const needs = { ...psychodynamics.needsHierarchy };
  if (analysis.valence > 0.15) {
    needs.belongingness = Math.max(0, Math.min(100, needs.belongingness + 0.8));
    needs.esteem = Math.max(0, Math.min(100, needs.esteem + 0.7));
  }
  if (analysis.valence < -0.15) {
    needs.safety = Math.max(0, Math.min(100, needs.safety - 0.6));
    needs.esteem = Math.max(0, Math.min(100, needs.esteem - 0.5));
  }
  if (analysis.traumaRisk > 0.5) {
    needs.safety = Math.max(0, Math.min(100, needs.safety - 1.2));
  }
  needs.physiological = Math.max(0, Math.min(100, needs.physiological + 0.05));
  needs.selfActualization = Math.max(
    0,
    Math.min(100, needs.selfActualization + (analysis.valence > 0.3 ? 0.4 : 0)),
  );
  const currentFocus = lowestNeed(needs);

  const selfEfficacy = Math.max(
    0,
    Math.min(
      100,
      psychodynamics.selfEfficacy + (analysis.valence > 0 ? 0.5 : -0.3),
    ),
  );

  const defenses = { ...psychodynamics.defenseMechanisms };
  const keys: DefenseKey[] = [
    'repression',
    'projection',
    'displacement',
    'sublimation',
    'rationalization',
    'denial',
  ];
  for (const key of keys) {
    defenses[key] = Math.max(0, Math.min(100, defenses[key] * 0.995));
  }
  if (analysis.traumaRisk > 0.5) {
    defenses.repression = Math.min(100, defenses.repression + 1.2);
  }
  if (analysis.valence < -0.3 && analysis.intention === 'comando') {
    defenses.displacement = Math.min(100, defenses.displacement + 0.9);
  }
  if (analysis.intention === 'confesion') {
    defenses.rationalization = Math.min(100, defenses.rationalization + 0.7);
  }
  if (emotions.intensity > 0.75 && analysis.valence < -0.4) {
    defenses.sublimation = Math.min(100, defenses.sublimation + 0.8);
  }
  const activeDefense = pickActiveDefense(defenses);

  const attachmentStyle = deriveAttachment(positiveBias, defenses);

  const conflictLevel = computeConflictLevel(
    conscious,
    subconscious,
    moral,
    psychodynamics.conflictLevel,
  );
  const dominantAspect = deriveDominantAspect(
    conscious,
    subconscious,
    conflictLevel,
  );

  return {
    ...psychodynamics,
    conflictLevel,
    dominantAspect,
    defenseMechanisms: { ...defenses, activeDefense },
    attachmentStyle,
    selfEfficacy,
    needsHierarchy: { ...needs, currentFocus },
    positiveBias,
  };
}

function deriveAttachment(
  positiveBias: number,
  defenses: Record<DefenseKey, number>,
): AttachmentStyle {
  if (defenses.denial > 65 && positiveBias < 0.35) return 'disorganized';
  if (positiveBias >= 0.62) return 'secure';
  if (positiveBias <= 0.32) return 'avoidant';
  return 'anxious';
}

function deriveDominantAspect(
  conscious: TraitProfile,
  subconscious: TraitProfile,
  conflictLevel: number,
): 'conscious' | 'subconscious' | 'balanced' | 'conflicted' {
  if (conflictLevel > 0.62) return 'conflicted';
  const consciousAvg =
    TRAITS.reduce((sum, key) => sum + conscious[key], 0) / TRAITS.length;
  const subconsciousAvg =
    TRAITS.reduce((sum, key) => sum + subconscious[key], 0) / TRAITS.length;
  if (consciousAvg - subconsciousAvg > 8) return 'conscious';
  if (subconsciousAvg - consciousAvg > 8) return 'subconscious';
  return 'balanced';
}

export function computeConflictLevel(
  conscious: TraitProfile,
  subconscious: TraitProfile,
  moral: { conscious: MoralAlignment; subconscious: MoralAlignment },
  previousConflict = 0,
) {
  const traitGap =
    TRAITS.reduce(
      (sum, key) => sum + Math.abs(conscious[key] - subconscious[key]),
      0,
    ) /
    (TRAITS.length * 100);
  const moralGap =
    (Math.abs(moral.conscious.goodness - moral.subconscious.goodness) +
      Math.abs(moral.conscious.lawfulness - moral.subconscious.lawfulness)) /
    200;
  // Small inertia so conflict does not flicker wildly.
  const raw = traitGap * 0.75 + moralGap * 0.55;
  return clamp01(raw * 0.7 + previousConflict * 0.3);
}

type CognitivePersonality = {
  conscious: TraitProfile;
  subconscious: TraitProfile;
  moral: { conscious: MoralAlignment; subconscious: MoralAlignment };
  jungian: JungianArchetypes;
  shadow: {
    aggression: number;
    fearfulness: number;
    desire: number;
    rebellion: number;
  };
  psychodynamics: {
    conflictLevel: number;
    dominantAspect: 'conscious' | 'subconscious' | 'balanced' | 'conflicted';
    defenseMechanisms: DefenseMechanisms;
    attachmentStyle: AttachmentStyle;
    selfEfficacy: number;
    needsHierarchy: MaslowNeeds;
    positiveBias: number;
  };
  conflictLevel: number;
  driftRemaining: number;
  lastUpdate: number;
};
