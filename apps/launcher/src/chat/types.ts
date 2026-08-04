import type { ArtifactWindow, ChatWindowState } from './artifacts';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
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
