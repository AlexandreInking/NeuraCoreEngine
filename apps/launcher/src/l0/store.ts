import {
  DEFAULT_L0_CONFIG,
  type L0Config,
  type L0Entry,
  type L0Prosody,
  type L0Session,
  type SessionSummary,
} from './types';

/**
 * Seam for the L0 buffer (Redis Stream semantics, local-first).
 * A future Redis adapter can implement the same interface when Docker is
 * available; the UI only depends on this contract.
 */
export interface L0Store {
  readonly agentId: string;
  config: L0Config;
  append(
    sessionId: string,
    name: string,
    speaker: 'user' | 'agent',
    text: string,
    prosody: L0Prosody,
  ): L0Entry;
  read(sessionId: string): L0Entry[];
  sessions(): L0Session[];
  session(sessionId: string): L0Session | null;
  flush(sessionId: string): void;
  closeSession(sessionId: string): SessionSummary;
  cleanup(now?: number): void;
}

type PersistedL0 = {
  agentId: string;
  config: L0Config;
  sessions: Record<string, L0Session>;
};

const STORAGE_PREFIX = 'neuracore-l0:';

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

export class LocalL0Store implements L0Store {
  readonly agentId: string;
  config: L0Config;
  private sessionsMap: Record<string, L0Session>;

  constructor(agentId: string) {
    this.agentId = agentId;
    const persisted = this.readPersisted();
    this.config = persisted?.config ?? { ...DEFAULT_L0_CONFIG };
    this.sessionsMap = persisted?.sessions ?? {};
    this.cleanup();
  }

  private readPersisted(): PersistedL0 | null {
    try {
      const raw = globalThis.localStorage.getItem(
        STORAGE_PREFIX + this.agentId,
      );
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedL0;
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
          sessions: this.sessionsMap,
        } satisfies PersistedL0),
      );
    } catch {
      // storage unavailable; buffer stays in-memory
    }
  }

  append(
    sessionId: string,
    name: string,
    speaker: 'user' | 'agent',
    text: string,
    prosody: L0Prosody,
  ): L0Entry {
    this.cleanup();
    let session = this.sessionsMap[sessionId];
    const now = Date.now();
    if (!session) {
      session = {
        id: sessionId,
        name,
        createdAt: now,
        expiresAt: now + this.config.ttlHours * 3_600_000,
        entries: [],
      };
      this.sessionsMap[sessionId] = session;
    }
    const entry: L0Entry = {
      id: createId('l0'),
      sessionId,
      speaker,
      text,
      prosody,
      timestamp: now,
      raw: {
        entryId: `${now}-${Math.floor(Math.random() * 10_000)}`,
        session: sessionId,
        speaker,
        text,
        prosody,
        timestamp: now,
        streamKey: `l0:${sessionId}`,
      },
    };
    // Circular buffer: keep the newest `bufferSize` entries (MAXLEN ~).
    session.entries = [...session.entries, entry].slice(
      -this.config.bufferSize,
    );
    this.save();
    return entry;
  }

  read(sessionId: string) {
    return this.sessionsMap[sessionId]?.entries ?? [];
  }

  sessions() {
    this.cleanup();
    return Object.values(this.sessionsMap);
  }

  session(sessionId: string) {
    return this.sessionsMap[sessionId] ?? null;
  }

  flush(sessionId: string) {
    const session = this.sessionsMap[sessionId];
    if (session) {
      session.entries = [];
      this.save();
    }
  }

  closeSession(sessionId: string): SessionSummary {
    const session = this.sessionsMap[sessionId];
    const summary: SessionSummary = {
      id: sessionId,
      name: session?.name ?? sessionId,
      totalEntries: session?.entries.length ?? 0,
      durationMinutes: session
        ? Math.max(0, Math.round((Date.now() - session.createdAt) / 60_000))
        : 0,
      exportedAt: Date.now(),
    };
    delete this.sessionsMap[sessionId];
    this.save();
    return summary;
  }

  cleanup(now = Date.now()) {
    const sessions = this.sessionsMap;
    for (const id of Object.keys(sessions)) {
      if (sessions[id].expiresAt < now) {
        delete sessions[id];
      }
    }
  }
}

const instances = new Map<string, L0Store>();

export function l0StoreFor(agentId: string): L0Store {
  let store = instances.get(agentId);
  if (!store) {
    store = new LocalL0Store(agentId);
    instances.set(agentId, store);
  }
  return store;
}
