import type { VadState } from './types';

export type VadHistoryPoint = {
  at: number;
  state: VadState;
};

const MAX_POINTS = 500;
const STORAGE_PREFIX = 'neuracore-vad-history:';

/** Per-session VAD timeline with JSON export (hito 7.3). */
export class VadHistoryStore {
  private points: VadHistoryPoint[] = [];

  constructor(
    private readonly agentId: string,
    private readonly sessionId: string,
  ) {
    this.points = this.read();
  }

  private key() {
    return `${STORAGE_PREFIX}${this.agentId}:${this.sessionId}`;
  }

  private read(): VadHistoryPoint[] {
    try {
      const raw = globalThis.localStorage.getItem(this.key());
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as VadHistoryPoint[]) : [];
    } catch {
      return [];
    }
  }

  private save() {
    try {
      globalThis.localStorage.setItem(this.key(), JSON.stringify(this.points));
    } catch {
      // storage unavailable
    }
  }

  add(state: VadState, at = Date.now()) {
    this.points = [...this.points, { at, state }].slice(-MAX_POINTS);
    this.save();
  }

  all() {
    return [...this.points];
  }

  clear() {
    this.points = [];
    this.save();
  }

  exportJson(): string {
    return JSON.stringify(
      {
        sessionId: this.sessionId,
        exportedAt: new Date().toISOString(),
        points: this.points,
      },
      null,
      2,
    );
  }
}
