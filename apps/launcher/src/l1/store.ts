import {
  DEFAULT_L1_CONFIG,
  type L1Config,
  type L1Fact,
  type L1SearchResult,
} from './types';

/**
 * Seam for the L1 atomic-facts index (Qdrant semantics, local-first).
 * A future Qdrant adapter can implement the same interface; the UI only
 * depends on this contract.
 */
export interface L1Store {
  readonly agentId: string;
  config: L1Config;
  upsert(fact: L1Fact): Promise<void>;
  update(
    id: string,
    patch: Partial<
      Pick<L1Fact, 'subject' | 'predicate' | 'object' | 'certainty'>
    >,
  ): Promise<void>;
  remove(id: string): Promise<void>;
  get(id: string): Promise<L1Fact | null>;
  all(): Promise<L1Fact[]>;
  count(): Promise<number>;
  search(
    queryVector: number[],
    topK: number,
    lambda: number,
    now?: number,
  ): Promise<L1SearchResult[]>;
}

type PersistedL1 = {
  agentId: string;
  config: L1Config;
  facts: L1Fact[];
};

const STORAGE_PREFIX = 'neuracore-l1:';

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class LocalL1Store implements L1Store {
  readonly agentId: string;
  config: L1Config;
  private facts: L1Fact[];

  constructor(agentId: string) {
    this.agentId = agentId;
    const persisted = this.readPersisted();
    this.config = persisted?.config ?? { ...DEFAULT_L1_CONFIG };
    this.facts = persisted?.facts ?? [];
  }

  private readPersisted(): PersistedL1 | null {
    try {
      const raw = globalThis.localStorage.getItem(
        STORAGE_PREFIX + this.agentId,
      );
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedL1;
      if (parsed && parsed.agentId === this.agentId) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  private save() {
    try {
      globalThis.localStorage.setItem(
        STORAGE_PREFIX + this.agentId,
        JSON.stringify({
          agentId: this.agentId,
          config: this.config,
          facts: this.facts,
        } satisfies PersistedL1),
      );
    } catch {
      // storage unavailable; index stays in-memory
    }
  }

  async upsert(fact: L1Fact) {
    const existingIndex = this.facts.findIndex((item) => item.id === fact.id);
    if (existingIndex >= 0) {
      this.facts[existingIndex] = fact;
    } else {
      this.facts.push(fact);
    }
    this.save();
  }

  async update(
    id: string,
    patch: Partial<
      Pick<L1Fact, 'subject' | 'predicate' | 'object' | 'certainty'>
    >,
  ) {
    this.facts = this.facts.map((fact) =>
      fact.id === id ? { ...fact, ...patch } : fact,
    );
    this.save();
  }

  async remove(id: string) {
    this.facts = this.facts.filter((fact) => fact.id !== id);
    this.save();
  }

  async get(id: string) {
    return this.facts.find((fact) => fact.id === id) ?? null;
  }

  async all() {
    return [...this.facts];
  }

  async count() {
    return this.facts.length;
  }

  async search(
    queryVector: number[],
    topK: number,
    lambda: number,
    now = Date.now(),
  ) {
    return this.facts
      .map((fact) => {
        const cosine = cosineSimilarity(queryVector, fact.embedding);
        const ageHours = Math.max(0, (now - fact.createdAt) / 3_600_000);
        const score = cosine * Math.exp(-lambda * ageHours);
        return { fact, cosine, score, ageHours };
      })
      .filter((result) => result.cosine > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((result) => {
        const touched = {
          ...result.fact,
          accessCount: result.fact.accessCount + 1,
          lastAccessed: now,
        };
        this.facts = this.facts.map((fact) =>
          fact.id === touched.id ? touched : fact,
        );
        this.save();
        return { ...result, fact: touched };
      });
  }
}

const instances = new Map<string, L1Store>();

export function l1StoreFor(agentId: string): L1Store {
  let store = instances.get(agentId);
  if (!store) {
    store = new LocalL1Store(agentId);
    instances.set(agentId, store);
  }
  return store;
}
