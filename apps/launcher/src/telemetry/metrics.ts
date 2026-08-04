export type TelemetryMetrics = {
  turnsProcessed: number;
  userMessages: number;
  llmCalls: number;
  llmErrors: number;
  piiScrubbed: number;
  rateLimited: number;
  l1FactsIndexed: number;
  averagePipelineLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  updatedAt: number;
};

const STORAGE_KEY = 'neuracore-telemetry';
const MAX_HISTORY = 200;

type Internal = {
  turnsProcessed: number;
  userMessages: number;
  llmCalls: number;
  llmErrors: number;
  piiScrubbed: number;
  rateLimited: number;
  l1FactsIndexed: number;
  latencyMs?: number;
  ok?: boolean;
  latenciesMs: number[];
  history: Array<{ at: number; latencyMs: number; ok: boolean }>;
};

function read(): Internal {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Internal;
      if (Array.isArray(parsed.latenciesMs)) return parsed;
    }
  } catch {
    // fall through
  }
  return {
    turnsProcessed: 0,
    userMessages: 0,
    llmCalls: 0,
    llmErrors: 0,
    piiScrubbed: 0,
    rateLimited: 0,
    l1FactsIndexed: 0,
    latenciesMs: [],
    history: [],
  };
}

function save(state: Internal) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable
  }
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

export function recordTelemetry(entry: Partial<Internal>) {
  const state = read();
  if (entry.turnsProcessed) state.turnsProcessed += entry.turnsProcessed;
  if (entry.userMessages) state.userMessages += entry.userMessages;
  if (entry.llmCalls) state.llmCalls += entry.llmCalls;
  if (entry.llmErrors) state.llmErrors += entry.llmErrors;
  if (entry.piiScrubbed) state.piiScrubbed += entry.piiScrubbed;
  if (entry.rateLimited) state.rateLimited += entry.rateLimited;
  if (entry.l1FactsIndexed) state.l1FactsIndexed += entry.l1FactsIndexed;
  if (typeof entry.latencyMs === 'number') {
    state.latenciesMs = [...state.latenciesMs, entry.latencyMs].slice(-MAX_HISTORY);
    state.history = [...state.history, { at: Date.now(), latencyMs: entry.latencyMs, ok: entry.ok ?? true }].slice(
      -MAX_HISTORY,
    );
  }
  save(state);
}

export function readTelemetry(): TelemetryMetrics {
  const state = read();
  const sorted = [...state.latenciesMs].sort((a, b) => a - b);
  const total = state.latenciesMs.reduce((sum, value) => sum + value, 0);
  return {
    turnsProcessed: state.turnsProcessed,
    userMessages: state.userMessages,
    llmCalls: state.llmCalls,
    llmErrors: state.llmErrors,
    piiScrubbed: state.piiScrubbed,
    rateLimited: state.rateLimited,
    l1FactsIndexed: state.l1FactsIndexed,
    averagePipelineLatencyMs: state.latenciesMs.length
      ? Math.round(total / state.latenciesMs.length)
      : 0,
    p50LatencyMs: percentile(sorted, 50),
    p95LatencyMs: percentile(sorted, 95),
    updatedAt: Date.now(),
  };
}

export function telemetryHistory(): Array<{ at: number; latencyMs: number; ok: boolean }> {
  return read().history;
}

export function exportTelemetryJson(): string {
  return JSON.stringify({ metrics: readTelemetry(), history: telemetryHistory() }, null, 2);
}
