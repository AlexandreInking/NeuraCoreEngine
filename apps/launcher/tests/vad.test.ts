import { describe, expect, it } from 'vitest';
import {
  vadStep,
  prosodyToStimulus,
  normalizeProsody,
  clamp11,
  DEFAULT_VAD_CONFIG,
} from '../src/vad/core';
import { vadToSsml, vadQuadrant, animationTagFor } from '../src/vad/ssml';

describe('vad/core', () => {
  it('decays toward baseline with the exponential formula', () => {
    const config = { ...DEFAULT_VAD_CONFIG, gamma: 0.15, noiseSigma: 0 };
    let state = { valence: -0.8, arousal: 0.9, dominance: 0.5 };
    for (let i = 0; i < 60; i += 1) {
      state = vadStep(state, config, {}, 0.5);
    }
    expect(Math.abs(state.valence)).toBeLessThan(0.05);
    expect(Math.abs(state.arousal)).toBeLessThan(0.05);
  });

  it('clamps stimulus to [-1, 1]', () => {
    const config = { ...DEFAULT_VAD_CONFIG, gamma: 0.15, noiseSigma: 0 };
    const result = vadStep({ valence: 0.9, arousal: 0, dominance: 0 }, config, { valence: 1 }, 0.5);
    expect(result.valence).toBeLessThanOrEqual(1);
    expect(clamp11(2)).toBe(1);
    expect(clamp11(-2)).toBe(-1);
  });

  it('maps prosody to ΔVAD with normalized axes', () => {
    const normalized = normalizeProsody({ pitchHz: 260, energyDb: -6, speechRate: 7.5 });
    expect(normalized.pitchNorm).toBeGreaterThan(0);
    expect(normalized.energyNorm).toBeGreaterThan(0);
    const stimulus = prosodyToStimulus({ pitchHz: 300, energyDb: -5, speechRate: 8 });
    expect(stimulus.arousal).toBeGreaterThan(0.5);
  });
});

describe('vad/ssml', () => {
  it('maps quadrants to SSML presets', () => {
    expect(vadQuadrant({ valence: 0.9, arousal: 0.9, dominance: 0.4 })).toBe('Q1');
    expect(vadQuadrant({ valence: -0.85, arousal: 0.8, dominance: 0.5 })).toBe('Q3');
    const ssml = vadToSsml({ valence: -0.85, arousal: 0.8, dominance: 0.5 }, '¡Es un robo!');
    expect(ssml).toContain('pitch="-8%"');
    expect(ssml).toContain('rate="118%"');
  });

  it('returns neutral animation for neutral VAD', () => {
    expect(animationTagFor({ valence: 0, arousal: 0, dominance: 0 })).toBe('GESTURE_NEUTRAL');
  });
});
