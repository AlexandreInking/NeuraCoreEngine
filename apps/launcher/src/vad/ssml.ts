import type { VadState } from './types';

export type VadQuadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'NEUTRAL';

export type QuadrantPreset = {
  label: string;
  pitch: number; // percent delta
  rate: number; // percent (100 = normal)
  volume: number; // percent delta
  emphasis: 'none' | 'moderate' | 'strong';
  animationTag: string;
};

export const QUADRANT_PRESETS: Record<VadQuadrant, QuadrantPreset> = {
  Q1: {
    label: 'Entusiasmo / Alegría',
    pitch: 10,
    rate: 118,
    volume: 10,
    emphasis: 'strong',
    animationTag: 'GESTURE_ENTHUSIASTIC',
  },
  Q2: {
    label: 'Empatía / Calma',
    pitch: -2,
    rate: 92,
    volume: -5,
    emphasis: 'none',
    animationTag: 'GESTURE_CALM',
  },
  Q3: {
    label: 'Ira / Frustración',
    pitch: -8,
    rate: 118,
    volume: 15,
    emphasis: 'strong',
    animationTag: 'GESTURE_POINT_FINGER_ANGRY',
  },
  Q4: {
    label: 'Tristeza / Baja energía',
    pitch: -12,
    rate: 85,
    volume: -8,
    emphasis: 'moderate',
    animationTag: 'GESTURE_SUBDUED',
  },
  NEUTRAL: {
    label: 'Neutral',
    pitch: 0,
    rate: 100,
    volume: 0,
    emphasis: 'none',
    animationTag: 'GESTURE_NEUTRAL',
  },
};

/** Map a VAD state to one of the 6 emotional quadrants. */
export function vadQuadrant(vad: VadState): VadQuadrant {
  const { valence, arousal } = vad;
  if (Math.abs(valence) < 0.15 && Math.abs(arousal) < 0.15) return 'NEUTRAL';
  if (valence >= 0 && arousal >= 0) return 'Q1';
  if (valence >= 0 && arousal < 0) return 'Q2';
  if (valence < 0 && arousal >= 0) return 'Q3';
  return 'Q4';
}

/**
 * Build a W3C SSML payload from the VAD state (hito 6.4).
 * Example: <prosody pitch="-8%" rate="118%" volume="+15%">text</prosody>
 */
export function vadToSsml(vad: VadState, text: string): string {
  const preset = QUADRANT_PRESETS[vadQuadrant(vad)];
  const pitch = `${preset.pitch >= 0 ? '+' : ''}${preset.pitch}%`;
  const rate = `${preset.rate}%`;
  const volume = `${preset.volume >= 0 ? '+' : ''}${preset.volume}%`;
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<speak version="1.1" xmlns="http://www.w3.org/2001/10/synthesis">',
    `  <prosody pitch="${pitch}" rate="${rate}" volume="${volume}">${escaped}</prosody>`,
    '</speak>',
  ].join('\n');
}

export function animationTagFor(vad: VadState): string {
  return QUADRANT_PRESETS[vadQuadrant(vad)].animationTag;
}

export function uiHexFor(vad: VadState): string {
  const preset = QUADRANT_PRESETS[vadQuadrant(vad)];
  switch (preset.animationTag) {
    case 'GESTURE_ENTHUSIASTIC':
      return '#10b981';
    case 'GESTURE_CALM':
      return '#60a5fa';
    case 'GESTURE_POINT_FINGER_ANGRY':
      return '#ef4444';
    case 'GESTURE_SUBDUED':
      return '#6b7280';
    default:
      return '#8b93a7';
  }
}
