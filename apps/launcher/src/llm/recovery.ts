import type { TraitProfile } from '../cognition/types';

export type EmergencyResponse = {
  content: string;
  style: 'upbeat' | 'reserved' | 'honest' | 'concise';
};

/**
 * Error recovery based on the agent's conscious personality (document cap 18):
 * when the LLM fails, respond from the base personality instead of crashing.
 */
export function personalityFallback(traits: TraitProfile | null): EmergencyResponse {
  if (!traits) {
    return {
      content: 'Disculpa, necesito un momento para reorganizar mis pensamientos…',
      style: 'reserved',
    };
  }
  const extraversion = traits.extraversion;
  const agreeableness = traits.agreeableness;
  const honesty = traits.honesty;

  if (extraversion > 50) {
    return {
      content: '¡Ups! Algo pasó en mi mente, pero sigamos hablando 😅',
      style: 'upbeat',
    };
  }
  if (honesty > 70) {
    return {
      content: 'Mmm… me quedé sin conexión con mi modelo de lenguaje justo ahora. Prefiero decírtelo antes de inventar una respuesta.',
      style: 'honest',
    };
  }
  if (agreeableness < 40) {
    return {
      content: 'Se me cortó el procesamiento. Reintenta en un momento.',
      style: 'concise',
    };
  }
  return {
    content: 'Disculpa, necesito un momento para reorganizar mis pensamientos…',
    style: 'reserved',
  };
}
