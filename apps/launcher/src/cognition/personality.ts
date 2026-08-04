import { clamp01 } from './defaults';
import type {
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

  const conflictLevel = computeConflictLevel(conscious, subconscious, moral);

  return {
    ...personality,
    conscious,
    subconscious,
    moral,
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
  // Honest reflection on honesty-sensitive intentions nudges lawfulness.
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

export function computeConflictLevel(
  conscious: TraitProfile,
  subconscious: TraitProfile,
  moral: { conscious: MoralAlignment; subconscious: MoralAlignment },
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
  return clamp01(traitGap * 0.75 + moralGap * 0.55);
}

type CognitivePersonality = {
  conscious: TraitProfile;
  subconscious: TraitProfile;
  moral: { conscious: MoralAlignment; subconscious: MoralAlignment };
  conflictLevel: number;
  driftRemaining: number;
  lastUpdate: number;
};
