import type { L1Config, L1Fact, L1SearchResult } from './types';
import type { L1Store } from './store';

/**
 * Real Qdrant adapter (roadmap 3.1–3.4). Implements the same L1Store seam
 * as LocalL1Store, talking to a Qdrant instance (default localhost:6333).
 * Qdrant computes cosine similarity; temporal decay is applied client-side
 * exactly like the local store: score_final = cosine * exp(-lambda * deltaHours).
 */

export type QdrantConfig = {
  host: string;
  port: number;
};

export const DEFAULT_QDRANT_CONFIG: QdrantConfig = {
  host: 'localhost',
  port: 6333,
};

const QDRANT_STORAGE_KEY = 'neuracore-qdrant';

export function readQdrantConfig(): QdrantConfig {
  try {
    const raw = globalThis.localStorage.getItem(QDRANT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_QDRANT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<QdrantConfig>;
    return {
      host:
        typeof parsed.host === 'string'
          ? parsed.host
          : DEFAULT_QDRANT_CONFIG.host,
      port:
        typeof parsed.port === 'number'
          ? parsed.port
          : DEFAULT_QDRANT_CONFIG.port,
    };
  } catch {
    return { ...DEFAULT_QDRANT_CONFIG };
  }
}

export function saveQdrantConfig(config: QdrantConfig) {
  try {
    globalThis.localStorage.setItem(QDRANT_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

function baseUrl(config: QdrantConfig) {
  return `http://${config.host}:${config.port}`;
}

export async function qdrantAvailable(config: QdrantConfig): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl(config)}/collections`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function listCollections(config: QdrantConfig): Promise<string[]> {
  const response = await fetch(`${baseUrl(config)}/collections`);
  if (!response.ok) throw new Error(`Qdrant unavailable (${response.status}).`);
  const payload = (await response.json()) as {
    result?: { collections?: Array<{ name: string }> };
  };
  return payload.result?.collections?.map((item) => item.name) ?? [];
}

export async function createCollection(
  config: QdrantConfig,
  name: string,
  dimension: number,
) {
  const response = await fetch(`${baseUrl(config)}/collections/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: dimension, distance: 'Cosine' },
    }),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`Failed to create collection (${response.status}).`);
  }
}

/** Deterministic 128-bit hash of the fact id → valid Qdrant point UUID (v4 shape). */
export function idToUuid(id: string) {
  let h1 = 0x9e3779b9;
  let h2 = 0x85ebca6b;
  for (let i = 0; i < id.length; i += 1) {
    const code = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x85ebca6b);
    h2 = Math.imul(h2 ^ code, 0xc2b2ae35);
  }
  h1 >>>= 0;
  h2 >>>= 0;
  const mix = (h1 ^ h2) >>> 0;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    const source = i < 4 ? h1 : i < 8 ? h2 : i < 12 ? mix : (mix ^ (i * 0x9e3779b9)) >>> 0;
    bytes[i] = (source >>> ((i % 4) * 8)) & 0xff;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class QdrantL1Store implements L1Store {
  readonly agentId: string;
  config: L1Config;
  private readonly collection: string;

  constructor(
    agentId: string,
    private readonly qdrant: QdrantConfig,
  ) {
    this.agentId = agentId;
    this.config = { ...readL1Config(agentId) };
    this.collection = `tenant_${agentId}_l1_facts`;
  }

  private pointFor(fact: L1Fact) {
    return {
      id: idToUuid(fact.id),
      vector: fact.embedding,
      payload: {
        factId: fact.id,
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        certainty: fact.certainty,
        createdAt: fact.createdAt,
        lastAccessed: fact.lastAccessed,
        accessCount: fact.accessCount,
        sourceEntryId: fact.sourceEntryId ?? null,
        fromModel: fact.fromModel,
      },
    };
  }

  private factFromPoint(point: {
    payload?: Record<string, unknown>;
  }): L1Fact | null {
    const payload = point.payload;
    if (!payload) return null;
    return {
      id: String(payload.factId ?? ''),
      subject: String(payload.subject ?? ''),
      predicate: String(payload.predicate ?? ''),
      object: String(payload.object ?? ''),
      certainty: Number(payload.certainty ?? 0.5),
      embedding: [],
      createdAt: Number(payload.createdAt ?? 0),
      lastAccessed: Number(payload.lastAccessed ?? 0),
      accessCount: Number(payload.accessCount ?? 0),
      sourceEntryId: payload.sourceEntryId
        ? String(payload.sourceEntryId)
        : undefined,
      fromModel: Boolean(payload.fromModel),
    };
  }

  async upsert(fact: L1Fact) {
    const response = await fetch(
      `${baseUrl(this.qdrant)}/collections/${this.collection}/points?wait=true`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: [this.pointFor(fact)] }),
      },
    );
    if (!response.ok)
      throw new Error(`Qdrant upsert failed (${response.status}).`);
  }

  async update(
    id: string,
    patch: Partial<
      Pick<L1Fact, 'subject' | 'predicate' | 'object' | 'certainty'>
    >,
  ) {
    const response = await fetch(
      `${baseUrl(this.qdrant)}/collections/${this.collection}/points/payload?wait=true`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: patch,
          filter: { must: [{ key: 'factId', match: { value: id } }] },
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Qdrant update failed (${response.status}).`);
  }

  async remove(id: string) {
    const response = await fetch(
      `${baseUrl(this.qdrant)}/collections/${this.collection}/points/delete?wait=true`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: { must: [{ key: 'factId', match: { value: id } }] },
        }),
      },
    );
    if (!response.ok)
      throw new Error(`Qdrant delete failed (${response.status}).`);
  }

  async get(id: string): Promise<L1Fact | null> {
    const hit = await this.scrollByFactId(id, 1);
    return hit.length ? this.factFromPoint(hit[0]) : null;
  }

  async all(): Promise<L1Fact[]> {
    const payload = (await this.request(
      `/collections/${this.collection}/points/scroll`,
      {
        method: 'POST',
        body: { limit: 1000, with_payload: true, with_vector: false },
      },
    )) as {
      result?: { points?: Array<{ payload?: Record<string, unknown> }> };
    };
    return (payload.result?.points ?? [])
      .map((point) => this.factFromPoint(point))
      .filter((fact): fact is L1Fact => fact !== null);
  }

  async count(): Promise<number> {
    try {
      const payload = (await this.request(
        `/collections/${this.collection}`,
        {},
      )) as {
        result?: { points_count?: number };
      };
      return payload.result?.points_count ?? 0;
    } catch {
      return 0;
    }
  }

  async search(
    queryVector: number[],
    topK: number,
    lambda: number,
    now = Date.now(),
  ): Promise<L1SearchResult[]> {
    const payload = (await this.request(
      `/collections/${this.collection}/points/search`,
      {
        method: 'POST',
        body: {
          vector: queryVector,
          limit: topK * 2,
          with_payload: true,
        },
      },
    )) as {
      result?: Array<{ score: number; payload?: Record<string, unknown> }>;
    };

    const results: L1SearchResult[] = [];
    for (const hit of payload.result ?? []) {
      const fact = this.factFromPoint({ payload: hit.payload });
      if (!fact) continue;
      const ageHours = Math.max(0, (now - fact.createdAt) / 3_600_000);
      const score = hit.score * Math.exp(-lambda * ageHours);
      if (hit.score <= 0.05) continue;
      results.push({
        fact: { ...fact, accessCount: fact.accessCount + 1, lastAccessed: now },
        cosine: hit.score,
        score,
        ageHours,
      });
    }
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, topK);
    for (const result of top) {
      await this.upsert(result.fact).catch(() => undefined);
    }
    return top;
  }

  private async scrollByFactId(id: string, limit: number) {
    const payload = (await this.request(
      `/collections/${this.collection}/points/scroll`,
      {
        method: 'POST',
        body: {
          limit,
          with_payload: true,
          with_vector: false,
          filter: { must: [{ key: 'factId', match: { value: id } }] },
        },
      },
    )) as {
      result?: { points?: Array<{ payload?: Record<string, unknown> }> };
    };
    return payload.result?.points ?? [];
  }

  private async request(
    path: string,
    options: { method?: string; body?: unknown },
  ) {
    const response = await fetch(`${baseUrl(this.qdrant)}${path}`, {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok)
      throw new Error(`Qdrant request failed (${response.status}).`);
    return response.json();
  }
}

function readL1Config(agentId: string): L1Config {
  try {
    const raw = globalThis.localStorage.getItem(`neuracore-l1:${agentId}`);
    if (!raw)
      return {
        lambda: 0.03,
        autoExtract: false,
        batchSize: 5,
        certaintyThreshold: 0.75,
      };
    const parsed = JSON.parse(raw) as { config?: L1Config };
    return (
      parsed.config ?? {
        lambda: 0.03,
        autoExtract: false,
        batchSize: 5,
        certaintyThreshold: 0.75,
      }
    );
  } catch {
    return {
      lambda: 0.03,
      autoExtract: false,
      batchSize: 5,
      certaintyThreshold: 0.75,
    };
  }
}
