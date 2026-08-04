import { describe, expect, it } from 'vitest';
import { extractVadDelta } from '../src/vad/postresponse';
import { scrubPii } from '../src/privacy/pii';
import { allowRate } from '../src/privacy/ratelimit';
import { buildOutputPayload } from '../src/output/payload';
import { validatePayload } from '../src/output/schema';
import { vadToSsml } from '../src/vad/ssml';

describe('vad/postresponse', () => {
  it('parses a JSON vad_delta block inside the reply', () => {
    const delta = extractVadDelta('Entiendo. {"vad_delta":{"valence":-0.2,"arousal":0.1}}');
    expect(delta).not.toBeNull();
    expect(delta?.valence).toBeCloseTo(-0.2);
    expect(delta?.arousal).toBeCloseTo(0.1);
  });

  it('parses the loose format and rejects plain text', () => {
    expect(extractVadDelta('vad_delta { "dominance": 0.5 }')?.dominance).toBeCloseTo(0.5);
    expect(extractVadDelta('sin delta aquí')).toBeNull();
  });
});

describe('privacy/pii', () => {
  it('masks emails, phones, cards, IPs, GPS and IBANs', () => {
    const text =
      'email juan@correo.com, tel +34 600 123 456, card 4111 1111 1111 1111, ip 192.168.1.10, gps 40.7128, -74.0060, iban ES9121000418450200051332';
    const result = scrubPii(text);
    expect(result.text).toContain('[EMAIL]');
    expect(result.text).toContain('[TARJETA]');
    expect(result.text).toContain('[IP]');
    expect(result.text).toContain('[IBAN]');
    expect(result.findings.length).toBeGreaterThanOrEqual(6);
  });

  it('does not mask plain numbers', () => {
    expect(scrubPii('tengo 42 años y 3 gatos').findings.length).toBe(0);
  });
});

describe('privacy/ratelimit', () => {
  it('enforces the token bucket capacity', () => {
    let allowed = 0;
    for (let i = 0; i < 12; i += 1) {
      if (allowRate('test-agent', { capacity: 5, refillPerSecond: 1000 })) allowed += 1;
    }
    expect(allowed).toBe(5);
  });
});

describe('output/payload', () => {
  it('builds and validates a full payload', () => {
    const payload = buildOutputPayload({
      agentId: 'Neura',
      sessionId: 's',
      message: 'hola',
      vad: { valence: 0.2, arousal: 0.3, dominance: 0.1 },
      quadrant: 'Q1',
      hexColor: '#10b981',
      animationTag: 'GESTURE_ENTHUSIASTIC',
      l0Entries: 2,
      l1FactsUsed: 1,
      l2Scenario: 'ESCENARIO',
      l3Profile: 'Neura',
      confidence: 0.8,
      dominantSystem: null,
      internalConflict: 0.1,
    });
    expect(validatePayload(payload).valid).toBe(true);
    expect(validatePayload({ ...payload, affectState: { ...payload.affectState, valence: 2 } }).valid).toBe(
      false,
    );
  });

  it('rejects missing fields', () => {
    expect(validatePayload({ version: '1.0.0' }).valid).toBe(false);
  });
});

describe('output/ssml integration', () => {
  it('escapes XML in SSML', () => {
    expect(vadToSsml({ valence: 0, arousal: 0, dominance: 0 }, 'a < b & c > d')).toContain('a &lt; b');
  });
});
