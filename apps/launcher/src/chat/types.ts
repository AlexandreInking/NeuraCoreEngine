import type { ArtifactWindow, ChatWindowState } from './artifacts';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Whether the typewriter reveal has finished (assistant messages only). */
  revealed?: boolean;
  /** VAD snapshot of the agent at the moment this message was produced. */
  vad?: { valence: number; arousal: number; dominance: number };
};

export type Chat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  artifacts: ArtifactWindow[];
  windowState: ChatWindowState;
};
