import { describe, expect, it } from 'vitest';
import { analyzeIntention, textSimilarity, INTENTION_LABELS } from '../src/intention/analyzer';
import { IntentionCache } from '../src/intention/cache';

describe('intention/analyzer', () => {
  it('classifies questions, commands and emotional messages', () => {
    expect(analyzeIntention('¿cuánto cuesta la poción?').type).toBe('pregunta');
    expect(analyzeIntention('dame el inventario urgente').type).toBe('comando');
    expect(analyzeIntention('estoy muy enojado y frustrado').type).toBe('emocional');
    expect(analyzeIntention('ayer estuve en el mercado').type).toBe('conversacion');
  });

  it('marks urgency and extracts topics', () => {
    const intent = analyzeIntention('dame el inventario urgente');
    expect(intent.urgency).toBeGreaterThan(0.5);
    expect(intent.topics).toContain('inventario');
    expect(INTENTION_LABELS[intent.type]).toBe('comando');
  });

  it('computes text similarity for cache validation', () => {
    expect(textSimilarity('hola mundo', 'hola mundo')).toBe(1);
    expect(textSimilarity('hola mundo', 'hola luna')).toBeCloseTo(0.5);
  });
});

describe('intention/cache', () => {
  it('hits near-identical keys and invalidates different ones', () => {
    const cache = new IntentionCache();
    const intent = analyzeIntention('¿cuánto cuesta la poción?');
    cache.set('¿cuánto cuesta la poción?', intent);
    expect(cache.get('¿cuánto cuesta la poción?')?.type).toBe('pregunta');
    expect(cache.get('¿cuánto cuesta la luna?')).toBeNull();
  });
});
