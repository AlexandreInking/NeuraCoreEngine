import type { VadState } from './types';

/**
 * Post-response VAD (hito 7.3): the LLM can return a structured
 * `{"vad_delta": {"valence":..,"arousal":..,"dominance":..}}` block in its
 * reply. Parse it tolerantly (JSON block anywhere in the text); null = none.
 */
export function extractVadDelta(response: string): Partial<VadState> | null {
  const patterns = [
    /\{\s*"vad_delta"\s*:\s*\{([^}]*)\}\s*\}/i,
    /vad_delta[:\s]*\{([^}]*)\}/i,
  ];
  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (!match) continue;
    try {
      const payload = JSON.parse(`{${match[1]}}`);
      const delta: Partial<VadState> = {};
      if (typeof payload.valence === 'number') delta.valence = clamp(payload.valence);
      if (typeof payload.arousal === 'number') delta.arousal = clamp(payload.arousal);
      if (typeof payload.dominance === 'number') delta.dominance = clamp(payload.dominance);
      if (Object.keys(delta).length) return delta;
    } catch {
      // try next pattern
    }
  }
  return null;
}

function clamp(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export function vadDeltaPromptHint(): string {
  return 'Al final de tu respuesta, si tu estado emocional cambió, añade un bloque JSON como este (opcional): {"vad_delta":{"valence":-0.2,"arousal":0.1,"dominance":0.0}}';
}
