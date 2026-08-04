export type AuditEntry = {
  at: number;
  tenantId: string;
  action: string;
  target: string;
  actor: string;
  ok: boolean;
};

const STORAGE_KEY = 'neuracore-audit';
const MAX_ENTRIES = 300;

/** Append-only audit log (hito 9.2), persisted locally. */
export function appendAudit(entry: Omit<AuditEntry, 'at'>): AuditEntry {
  const full: AuditEntry = { ...entry, at: Date.now() };
  try {
    const current = readAudit();
    const next = [...current, full].slice(-MAX_ENTRIES);
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
  return full;
}

export function readAudit(tenantId?: string): AuditEntry[] {
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEntry[];
    const entries = Array.isArray(parsed) ? parsed : [];
    return tenantId ? entries.filter((entry) => entry.tenantId === tenantId) : entries;
  } catch {
    return [];
  }
}

export function clearAudit() {
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}
