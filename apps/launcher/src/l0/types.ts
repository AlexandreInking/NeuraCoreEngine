export type L0Prosody = {
  pitch: number; // Hz (simulated 60-400)
  energy: number; // dB (simulated -30..0)
  speechRate: number; // syllables/s (0-10)
};

export type L0Entry = {
  id: string;
  sessionId: string;
  speaker: 'user' | 'agent';
  text: string;
  prosody: L0Prosody;
  timestamp: number;
  raw: Record<string, unknown>;
};

export type L0Session = {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
  entries: L0Entry[];
};

export type L0Config = {
  bufferSize: number; // MAXLEN of the circular buffer
  ttlHours: number; // session TTL (EXPIRE)
};

export const DEFAULT_L0_CONFIG: L0Config = { bufferSize: 200, ttlHours: 24 };

export const DEFAULT_PROSODY: L0Prosody = {
  pitch: 120,
  energy: -18,
  speechRate: 4.5,
};

export type SessionSummary = {
  id: string;
  name: string;
  totalEntries: number;
  durationMinutes: number;
  exportedAt: number;
};
