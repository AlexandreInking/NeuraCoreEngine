export type OutputPayloadVad = {
  valence: number;
  arousal: number;
  dominance: number;
  quadrant: string;
  hexColor: string;
  animationTag: string;
};

export type OutputMemoryTrace = {
  l0Entries: number;
  l1FactsUsed: number;
  l2Scenario: string | null;
  l3Profile: string | null;
};

export type OutputCognitive = {
  message: string;
  confidence: number;
  dominantSystem: 'rational' | 'emotional' | 'integrated' | 'conflicted' | null;
  internalConflict: number;
};

export type NeuraCoreOutputPayload = {
  version: '1.0.0';
  agentId: string;
  sessionId: string;
  timestamp: string;
  affectState: OutputPayloadVad;
  memoryTrace: OutputMemoryTrace;
  cognitiveOutput: OutputCognitive;
  behavioralTriggers: {
    animationTag: string;
    uiHexColor: string;
    proactive: boolean;
  };
};

export type PayloadInput = {
  agentId: string;
  sessionId: string;
  message: string;
  vad: { valence: number; arousal: number; dominance: number };
  quadrant: string;
  hexColor: string;
  animationTag: string;
  l0Entries: number;
  l1FactsUsed: number;
  l2Scenario: string | null;
  l3Profile: string | null;
  confidence: number;
  dominantSystem: OutputCognitive['dominantSystem'];
  internalConflict: number;
  proactive?: boolean;
};

/** Build the full SDK-facing output payload (hito 8.1). */
export function buildOutputPayload(input: PayloadInput): NeuraCoreOutputPayload {
  return {
    version: '1.0.0',
    agentId: input.agentId,
    sessionId: input.sessionId,
    timestamp: new Date().toISOString(),
    affectState: {
      valence: input.vad.valence,
      arousal: input.vad.arousal,
      dominance: input.vad.dominance,
      quadrant: input.quadrant,
      hexColor: input.hexColor,
      animationTag: input.animationTag,
    },
    memoryTrace: {
      l0Entries: input.l0Entries,
      l1FactsUsed: input.l1FactsUsed,
      l2Scenario: input.l2Scenario,
      l3Profile: input.l3Profile,
    },
    cognitiveOutput: {
      message: input.message,
      confidence: input.confidence,
      dominantSystem: input.dominantSystem,
      internalConflict: input.internalConflict,
    },
    behavioralTriggers: {
      animationTag: input.animationTag,
      uiHexColor: input.hexColor,
      proactive: input.proactive ?? false,
    },
  };
}
