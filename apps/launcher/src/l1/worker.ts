import {
  DEFAULT_DEEPSEEK_CONFIG,
  type DeepSeekConfig,
} from '../cognition/deepseek';
import { embedTexts } from './embedder';
import { extractSpo } from './extractor';
import { scrubPii } from '../privacy/pii';
import { recordTelemetry } from '../telemetry/metrics';
import type { L1Store } from './store';
import { l0StoreFor } from '../l0/store';
import type { L1Fact } from './types';

const DEEPSEEK_STORAGE_KEY = 'neuracore-deepseek';

function readDeepSeekConfig(): DeepSeekConfig {
  try {
    const raw = globalThis.localStorage.getItem(DEEPSEEK_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DEEPSEEK_CONFIG };
    const parsed = JSON.parse(raw) as Partial<DeepSeekConfig>;
    return {
      ...DEFAULT_DEEPSEEK_CONFIG,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      baseUrl:
        typeof parsed.baseUrl === 'string'
          ? parsed.baseUrl
          : DEFAULT_DEEPSEEK_CONFIG.baseUrl,
      model:
        typeof parsed.model === 'string'
          ? parsed.model
          : DEFAULT_DEEPSEEK_CONFIG.model,
    };
  } catch {
    return { ...DEFAULT_DEEPSEEK_CONFIG };
  }
}

/**
 * L1 auto-extraction worker (Redis `XREAD BLOCK` semantics, local-first).
 * Polls the L0 buffer, tracks processed entry ids, and every `batchSize`
 * new entries triggers SPO extraction + embedding + indexing.
 */
export class L1AutoWorker {
  readonly store: L1Store;
  private processed: Set<string>;
  private log: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly agentId: string,
    readonly batchSize: number,
    store: L1Store,
  ) {
    this.store = store;
    this.processed = this.readProcessed();
  }

  private storageKey() {
    return `neuracore-l1:${this.agentId}:processed`;
  }

  private readProcessed() {
    try {
      const raw = globalThis.localStorage.getItem(this.storageKey());
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set<string>();
    }
  }

  private persistProcessed() {
    try {
      globalThis.localStorage.setItem(
        this.storageKey(),
        JSON.stringify([...this.processed]),
      );
    } catch {
      // ignore
    }
  }

  /** Pending = L0 entries not yet processed, across all sessions. */
  pendingCount(): number {
    const l0 = l0StoreFor(this.agentId);
    return l0
      .sessions()
      .flatMap((session) => l0.read(session.id))
      .filter((entry) => !this.processed.has(entry.id)).length;
  }

  logs() {
    return [...this.log];
  }

  clearLogs() {
    this.log = [];
  }

  start() {
    if (this.timer) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.drain();
    }, 3000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  isRunning() {
    return this.running;
  }

  async drain(): Promise<void> {
    if (this.running === false && this.timer) return;
    const l0 = l0StoreFor(this.agentId);
    const pending = l0
      .sessions()
      .flatMap((session) =>
        l0
          .read(session.id)
          .map((entry) => ({ ...entry, sessionId: session.id })),
      )
      .filter((entry) => !this.processed.has(entry.id))
      .sort((a, b) => a.timestamp - b.timestamp);

    if (pending.length < this.batchSize) return;

    const batch = pending.slice(0, this.batchSize);
    const config = readDeepSeekConfig();
    let extracted = 0;
    for (const entry of batch) {
      if (entry.speaker !== 'user' && entry.text.trim().length < 24) {
        this.processed.add(entry.id);
        continue;
      }
      try {
        const safeText = scrubPii(entry.text).text;
        const { triplets, fromModel } = await extractSpo(safeText, config);
        if (triplets.length) {
          recordTelemetry({ l1FactsIndexed: triplets.length });
          const embeddings = await embedTexts(
            triplets.map((triplet) =>
              `${triplet.subject} ${triplet.predicate} ${triplet.object}`.trim(),
            ),
          );
          if (embeddings) {
            triplets.forEach((triplet, index) => {
              const fact: L1Fact = {
                id: `fact-${entry.id}-${index}`,
                subject: triplet.subject,
                predicate: triplet.predicate,
                object: triplet.object,
                certainty: triplet.certainty,
                embedding: Array.from(embeddings[index]),
                createdAt: entry.timestamp,
                lastAccessed: Date.now(),
                accessCount: 0,
                sourceEntryId: entry.id,
                fromModel,
              };
              void this.store.upsert(fact);
            });
            extracted += triplets.length;
            this.logEntry(
              `Extraídos ${triplets.length} hechos de entrada ${entry.id}${fromModel ? '' : ' (heurístico)'}`,
            );
          }
        }
      } catch {
        // keep entry unprocessed so it can be retried later
        continue;
      }
      this.processed.add(entry.id);
    }
    this.persistProcessed();
    if (extracted) {
      this.logEntry(
        `Batch procesado: ${batch.length} entradas, ${extracted} hechos indexados.`,
      );
    }
  }

  private logEntry(message: string) {
    this.log = [
      ...this.log,
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ].slice(-30);
  }
}

const workers = new Map<string, L1AutoWorker>();

export function l1WorkerFor(
  agentId: string,
  batchSize: number,
  store: L1Store,
) {
  let worker = workers.get(agentId);
  if (!worker || worker.batchSize !== batchSize || worker.store !== store) {
    worker?.stop();
    worker = new L1AutoWorker(agentId, batchSize, store);
    workers.set(agentId, worker);
  }
  return worker;
}
