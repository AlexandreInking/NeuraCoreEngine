import {
  MAX_PROFILE_SNAPSHOTS,
  type AgentProfile,
  type ProfileSnapshot,
} from './types';

/**
 * Seam for the L3 persona store (PostgreSQL `agentProfiles` semantics,
 * local-first). A future Postgres adapter can implement the same contract;
 * the UI only depends on this interface.
 */
export interface L3ProfileStore {
  list(): AgentProfile[];
  get(agentId: string): AgentProfile | null;
  upsert(profile: AgentProfile): void;
  remove(agentId: string): void;
  duplicate(
    fromAgentId: string,
    newAgentId: string,
    newName: string,
  ): AgentProfile | null;
  snapshots(agentId: string): ProfileSnapshot[];
  pushSnapshot(agentId: string, reason: string): void;
  rollback(agentId: string, snapshotId: string): AgentProfile | null;
}

type PersistedL3 = {
  profiles: AgentProfile[];
  snapshots: ProfileSnapshot[];
};

const STORAGE_KEY = 'neuracore-l3-profiles';

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 10_000).toString(36)}`;
}

export class LocalL3ProfileStore implements L3ProfileStore {
  private profiles: AgentProfile[];
  private snapshotLog: ProfileSnapshot[];

  constructor() {
    const persisted = this.readPersisted();
    this.profiles = persisted?.profiles ?? [];
    this.snapshotLog = persisted?.snapshots ?? [];
  }

  private readPersisted(): PersistedL3 | null {
    try {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PersistedL3;
    } catch {
      return null;
    }
  }

  private save() {
    try {
      globalThis.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          profiles: this.profiles,
          snapshots: this.snapshotLog,
        } satisfies PersistedL3),
      );
    } catch {
      // storage unavailable; profiles stay in-memory
    }
  }

  list() {
    return [...this.profiles].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(agentId: string) {
    return this.profiles.find((profile) => profile.agentId === agentId) ?? null;
  }

  upsert(profile: AgentProfile) {
    const index = this.profiles.findIndex(
      (item) => item.agentId === profile.agentId,
    );
    if (index >= 0) {
      this.profiles[index] = profile;
    } else {
      this.profiles.push(profile);
    }
    this.save();
  }

  remove(agentId: string) {
    this.profiles = this.profiles.filter(
      (profile) => profile.agentId !== agentId,
    );
    this.snapshotLog = this.snapshotLog.filter(
      (snapshot) => snapshot.agentId !== agentId,
    );
    this.save();
  }

  duplicate(fromAgentId: string, newAgentId: string, newName: string) {
    const source = this.get(fromAgentId);
    if (!source) return null;
    const copy: AgentProfile = {
      ...source,
      agentId: newAgentId,
      personaName: newName || `${source.personaName} Copy`,
      updatedAt: Date.now(),
    };
    this.upsert(copy);
    return copy;
  }

  snapshots(agentId: string) {
    return this.snapshotLog
      .filter((snapshot) => snapshot.agentId === agentId)
      .sort((a, b) => b.capturedAt - a.capturedAt);
  }

  pushSnapshot(agentId: string, reason: string) {
    const profile = this.get(agentId);
    if (!profile) return;
    this.snapshotLog = [
      {
        id: createId('snap'),
        agentId,
        profile: JSON.parse(JSON.stringify(profile)) as AgentProfile,
        capturedAt: Date.now(),
        reason,
      },
      ...this.snapshotLog.filter((snapshot) => snapshot.agentId !== agentId),
    ].slice(0, MAX_PROFILE_SNAPSHOTS * 2);
    this.save();
  }

  rollback(agentId: string, snapshotId: string) {
    const snapshot = this.snapshotLog.find(
      (item) => item.agentId === agentId && item.id === snapshotId,
    );
    if (!snapshot) return null;
    const restored: AgentProfile = {
      ...snapshot.profile,
      agentId,
      updatedAt: Date.now(),
    };
    this.upsert(restored);
    this.save();
    return restored;
  }
}

let instance: L3ProfileStore | null = null;

export function l3ProfileStore(): L3ProfileStore {
  if (!instance) instance = new LocalL3ProfileStore();
  return instance;
}

export function defaultAgentProfile(agentId: string): AgentProfile {
  return {
    agentId,
    tenantId: 'default',
    personaName: agentId,
    vertical: 'Custom',
    description: '',
    moralAlignment: 'neutral',
    baselineVad: { valence: 0.1, arousal: -0.05, dominance: 0.15 },
    emotionalInertiaGamma: 0.25,
    ethicsRules: [],
    promptBaseText: '',
    updatedAt: Date.now(),
  };
}
