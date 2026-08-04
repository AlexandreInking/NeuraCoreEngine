import Ajv, { type ErrorObject } from 'ajv';
import type { NeuraCoreOutputPayload } from './payload';

export const OUTPUT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'NeuraCoreOutputPayload',
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'agentId',
    'sessionId',
    'timestamp',
    'affectState',
    'memoryTrace',
    'cognitiveOutput',
    'behavioralTriggers',
  ],
  properties: {
    version: { const: '1.0.0' },
    agentId: { type: 'string', minLength: 1 },
    sessionId: { type: 'string', minLength: 1 },
    timestamp: { type: 'string', minLength: 1 },
    affectState: {
      type: 'object',
      additionalProperties: false,
      required: ['valence', 'arousal', 'dominance', 'quadrant', 'hexColor', 'animationTag'],
      properties: {
        valence: { type: 'number', minimum: -1, maximum: 1 },
        arousal: { type: 'number', minimum: -1, maximum: 1 },
        dominance: { type: 'number', minimum: -1, maximum: 1 },
        quadrant: { type: 'string' },
        hexColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        animationTag: { type: 'string' },
      },
    },
    memoryTrace: {
      type: 'object',
      additionalProperties: false,
      required: ['l0Entries', 'l1FactsUsed', 'l2Scenario', 'l3Profile'],
      properties: {
        l0Entries: { type: 'integer', minimum: 0 },
        l1FactsUsed: { type: 'integer', minimum: 0 },
        l2Scenario: { type: ['string', 'null'] },
        l3Profile: { type: ['string', 'null'] },
      },
    },
    cognitiveOutput: {
      type: 'object',
      additionalProperties: false,
      required: ['message', 'confidence', 'dominantSystem', 'internalConflict'],
      properties: {
        message: { type: 'string', minLength: 1 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        dominantSystem: {
          type: ['string', 'null'],
          enum: ['rational', 'emotional', 'integrated', 'conflicted', null],
        },
        internalConflict: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    behavioralTriggers: {
      type: 'object',
      additionalProperties: false,
      required: ['animationTag', 'uiHexColor', 'proactive'],
      properties: {
        animationTag: { type: 'string' },
        uiHexColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        proactive: { type: 'boolean' },
      },
    },
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(OUTPUT_SCHEMA);

export type PayloadValidation = {
  valid: boolean;
  errors: Array<ErrorObject | string>;
};

/** Validate a payload against the JSON Schema draft-07 (hito 8.2). */
export function validatePayload(payload: unknown): PayloadValidation {
  const ok = validate(payload);
  return {
    valid: ok === true,
    errors: ok === true ? [] : (validate.errors ?? []).map((error) => error.message ?? error.keyword),
  };
}

export function payloadBytes(payload: NeuraCoreOutputPayload): number {
  return new Blob([JSON.stringify(payload)]).size;
}
