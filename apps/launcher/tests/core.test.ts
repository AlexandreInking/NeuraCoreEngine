import { describe, expect, it } from 'vitest';
import { buildOutputPayload } from '../src/output/payload';
import { validatePayload } from '../src/output/schema';
import { evaluateProactiveProbability, selectProactiveType } from '../src/proactive/engine';
import { cosineSimilarity } from '../src/l1/store';

function unitEmbedding(axis: number): number[] {
  const embedding = new Array<number>(384).fill(0);
  embedding[axis] = 1;
  return embedding;
}

describe('l1/cosineSimilarity', () => {
  it('scores identical vectors at 1 and orthogonal at 0', () => {
    expect(cosineSimilarity(unitEmbedding(0), unitEmbedding(0))).toBeCloseTo(1);
    expect(cosineSimilarity(unitEmbedding(0), unitEmbedding(128))).toBeCloseTo(0);
    expect(cosineSimilarity(unitEmbedding(0), unitEmbedding(256))).toBeCloseTo(0);
  });

  it('is symmetric and handles zero vectors', () => {
    const a = [1, 2, 3];
    const b = [3, 2, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a));
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe('proactive/engine', () => {
  it('probability rises with social traits and idle time', () => {
    const high = evaluateProactiveProbability({
      traits: { extraversion: 90, openness: 80, agreeableness: 80, belongingness: 90 },
      minutesSinceLastInteraction: 60,
    });
    const low = evaluateProactiveProbability({
      traits: { extraversion: 10, openness: 10, agreeableness: 10, belongingness: 10 },
      minutesSinceLastInteraction: 1,
    });
    expect(high).toBeGreaterThan(low);
  });

  it('selects a valid proactive type', () => {
    const type = selectProactiveType({
      extraversion: 70,
      openness: 80,
      agreeableness: 75,
      belongingness: 70,
    });
    expect(['curiosity_driven_question', 'emotional_check_in', 'share_insight', 'memory_reflection']).toContain(
      type,
    );
  });
});

describe('output/payload schema', () => {
  it('validates hex colors and enums', () => {
    const base = buildOutputPayload({
      agentId: 'a',
      sessionId: 's',
      message: 'm',
      vad: { valence: 0, arousal: 0, dominance: 0 },
      quadrant: 'NEUTRAL',
      hexColor: '#8b93a7',
      animationTag: 'GESTURE_NEUTRAL',
      l0Entries: 0,
      l1FactsUsed: 0,
      l2Scenario: null,
      l3Profile: null,
      confidence: 0,
      dominantSystem: null,
      internalConflict: 0,
    });
    expect(validatePayload(base).valid).toBe(true);
    expect(
      validatePayload({ ...base, affectState: { ...base.affectState, hexColor: 'red' } }).valid,
    ).toBe(false);
  });
});
