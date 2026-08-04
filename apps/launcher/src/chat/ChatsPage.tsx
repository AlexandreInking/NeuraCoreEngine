import { useEffect, useRef, useState, type FormEvent } from 'react';
import CognitivePanel from '../CognitivePanel';
import type { CognitiveState } from '../cognition/types';
import { EMOTION_COLORS } from '../cognition/types';
import ArtifactContent from './ArtifactContent';
import WindowFrame from './WindowFrame';
import {
  ARTIFACT_ICONS,
  defaultChatWindowState,
  parseMarker,
  type ArtifactWindow,
  type ChatWindowState,
} from './artifacts';
import type { Chat, ChatMessage } from './types';

const COGNITION_WINDOW_KEY = 'neuracore-cognition-window';

/** The chat desktop is a finite canvas the user can pan across. */
const WORLD_SIZE = { width: 2400, height: 1600 };

type CognitionWindowState = ChatWindowState & { open: boolean };

function defaultCognitionWindowState(width: number): CognitionWindowState {
  return {
    x: Math.max(24, width - 324),
    y: 24,
    w: 300,
    h: 430,
    z: 12,
    minimized: false,
    open: true,
  };
}

function readCognitionWindowState(width: number): CognitionWindowState {
  try {
    const raw = globalThis.localStorage.getItem(COGNITION_WINDOW_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CognitionWindowState>;
      return { ...defaultCognitionWindowState(width), ...parsed };
    }
  } catch {
    // defaults
  }
  return defaultCognitionWindowState(width);
}

function formatChatTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function MessageText({
  text,
  artifacts,
  onFocusArtifact,
}: {
  text: string;
  artifacts: ArtifactWindow[];
  onFocusArtifact: (id: string) => void;
}) {
  const parts = text.split(/(\[art:[a-z]+:[^|\]]+\|[^\]]*\])/g);
  return (
    <>
      {parts.map((part, index) => {
        const marker = parseMarker(part);
        if (marker) {
          const artifact = artifacts.find((item) => item.id === marker.id);
          if (artifact) {
            return (
              <button
                key={index}
                type="button"
                className="artifact-chip"
                title="Abrir ventana del artefacto"
                onClick={() => onFocusArtifact(artifact.id)}
              >
                <span aria-hidden="true">{ARTIFACT_ICONS[artifact.kind]}</span>
                {artifact.title}
              </button>
            );
          }
          return <span key={index}>{part}</span>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

// Human-like typewriter reveal: ≈ 256 words/min (≈ 2 chars per 90ms tick).
const TYPEWRITER_CHARS_PER_TICK = 2;
const TYPEWRITER_TICK_MS = 90;

function StreamedMessage({
  message,
  onRevealed,
}: {
  message: ChatMessage;
  onRevealed: () => void;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (message.revealed) {
      setCount(message.content.length);
      return;
    }
    setCount(0);
    const interval = window.setInterval(() => {
      setCount((current) => {
        const next = current + TYPEWRITER_CHARS_PER_TICK;
        if (next >= message.content.length) {
          window.clearInterval(interval);
          onRevealed();
          return message.content.length;
        }
        return next;
      });
    }, TYPEWRITER_TICK_MS);
    return () => window.clearInterval(interval);
  }, [message.id, message.content]);

  const done = count >= message.content.length;
  return (
    <>
      {message.content.slice(0, count)}
      {!done ? <span className="typewriter-caret" aria-hidden="true" /> : null}
    </>
  );
}

export default function ChatsPage({
  chats,
  activeChatId,
  cognition,
  deepSeekConfigured,
  onNewChat,
  onSelectChat,
  onSend,
  onUpdateChat,
}: {
  chats: Chat[];
  activeChatId: string;
  cognition: CognitiveState | null;
  deepSeekConfigured: boolean;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onSend: (content: string) => void;
  onUpdateChat: (chat: Chat) => void;
}) {
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const [draft, setDraft] = useState('');
  const [railOpen, setRailOpen] = useState(true);
  const [cognitionWindow, setCognitionWindow] = useState<CognitionWindowState>(
    () =>
      readCognitionWindowState(
        typeof window !== 'undefined' ? window.innerWidth : WORLD_SIZE.width,
      ),
  );
  const [topZ, setTopZ] = useState(100);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const desktopSize = WORLD_SIZE;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sending = activeChat?.messages.some(
    (message) => message.role === 'assistant' && message.content === '…',
  );
  const accent = cognition
    ? EMOTION_COLORS[cognition.emotions.dominantEmotion]
    : '#70a1ff';

  // Pan the canvas by dragging with the middle mouse button.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: canvas.scrollLeft,
        scrollTop: canvas.scrollTop,
      };
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== event.pointerId) return;
      canvas.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
      canvas.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  useEffect(() => {
    setDraft('');
  }, [activeChat?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages.length, activeChat?.artifacts.length]);

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(
        COGNITION_WINDOW_KEY,
        JSON.stringify(cognitionWindow),
      );
    } catch {
      // storage unavailable
    }
  }, [cognitionWindow]);

  // Auto-place artifacts that arrived without coordinates.
  useEffect(() => {
    if (!activeChat) return;
    const unplaced = activeChat.artifacts.filter((artifact) => artifact.x < 0);
    if (!unplaced.length) return;
    const base = activeChat.windowState;
    const artifacts = activeChat.artifacts.map((artifact, index) =>
      artifact.x < 0
        ? {
            ...artifact,
            x: base.x + 140 + (index % 3) * 36,
            y: base.y + 70 + (index % 3) * 36,
            z: 20 + index,
          }
        : artifact,
    );
    onUpdateChat({ ...activeChat, artifacts });
  }, [activeChat, activeChat.artifacts.length]);

  const bumpZ = () => {
    const next = topZ + 1;
    setTopZ(next);
    return next;
  };

  const updateChatWindow = (patch: Partial<ChatWindowState>) => {
    if (!activeChat) return;
    onUpdateChat({
      ...activeChat,
      windowState: { ...activeChat.windowState, ...patch },
    });
  };

  const updateArtifact = (id: string, patch: Partial<ArtifactWindow>) => {
    if (!activeChat) return;
    onUpdateChat({
      ...activeChat,
      artifacts: activeChat.artifacts.map((artifact) =>
        artifact.id === id ? { ...artifact, ...patch } : artifact,
      ),
    });
  };

  const closeArtifact = (id: string) => {
    if (!activeChat) return;
    onUpdateChat({
      ...activeChat,
      artifacts: activeChat.artifacts.filter((artifact) => artifact.id !== id),
    });
  };

  const markMessageRevealed = (messageId: string) => {
    if (!activeChat) return;
    onUpdateChat({
      ...activeChat,
      messages: activeChat.messages.map((message) =>
        message.id === messageId ? { ...message, revealed: true } : message,
      ),
    });
  };

  const focusArtifact = (id: string) => {
    updateArtifact(id, { z: bumpZ() });
  };

  const resetLayout = () => {
    if (!activeChat) return;
    const chatWindow = defaultChatWindowState(
      desktopSize.width,
      desktopSize.height,
    );
    const artifacts = activeChat.artifacts.map((artifact, index) => ({
      ...artifact,
      x: chatWindow.x + 140 + (index % 3) * 36,
      y: chatWindow.y + 70 + (index % 3) * 36,
      z: 20 + index,
      minimized: false,
    }));
    onUpdateChat({ ...activeChat, windowState: chatWindow, artifacts });
    setCognitionWindow(defaultCognitionWindowState(desktopSize.width));
    setCognitionWindow((current) => ({ ...current, open: true }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !activeChat) return;
    setDraft('');
    onSend(content);
  };

  const minimizedWindows: Array<{ id: string; label: string; icon: string }> =
    [];
  if (activeChat?.windowState.minimized) {
    minimizedWindows.push({ id: 'chat', label: activeChat.title, icon: '💬' });
  }
  if (cognitionWindow.minimized) {
    minimizedWindows.push({ id: 'cognition', label: 'Cognitive', icon: '🧠' });
  }
  for (const artifact of activeChat?.artifacts ?? []) {
    if (artifact.minimized) {
      minimizedWindows.push({
        id: artifact.id,
        label: artifact.title,
        icon: ARTIFACT_ICONS[artifact.kind],
      });
    }
  }

  return (
    <section className="chat-workspace" aria-labelledby="chat-workspace-title">
      <header className="chat-toolbar">
        <div>
          <p className="eyebrow" id="chat-workspace-title">
            DESKTOP WORKSPACE
          </p>
          <h2>Chats</h2>
          <p className="chat-toolbar-note">
            Ventanas movibles: conversación, mundo interior y artefactos del
            agente. Arrastra por la barra de título.
          </p>
        </div>
        <div className="chat-toolbar-actions">
          <button
            className="button-ghost"
            type="button"
            onClick={() => setRailOpen((current) => !current)}
          >
            {railOpen ? 'Hide list' : 'Show list'}
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={() =>
              setCognitionWindow((current) => ({
                ...current,
                open: !current.open,
                minimized: false,
                z: bumpZ(),
              }))
            }
          >
            {cognitionWindow.open ? 'Hide cognitive' : 'Show cognitive'}
          </button>
          <button className="button-ghost" type="button" onClick={resetLayout}>
            Reset layout
          </button>
          <button className="button-primary" type="button" onClick={onNewChat}>
            + New chat
          </button>
        </div>
      </header>

      <div className="chat-desktop-shell">
        {railOpen ? (
          <aside className="chat-rail" aria-label="Chat list">
            <div className="chat-rail-header">
              <span className="section-kicker">CONVERSATIONS</span>
              <strong>{chats.length}</strong>
            </div>
            <div className="chat-rail-items">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  className={`chat-rail-item ${chat.id === activeChat?.id ? 'active' : ''}`}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <span>{chat.title || 'New chat'}</span>
                  <small>{formatChatTime(chat.updatedAt)}</small>
                </button>
              ))}
              {!chats.length ? (
                <p className="chat-rail-empty">Crea tu primera conversación.</p>
              ) : null}
            </div>
          </aside>
        ) : null}

        <div className="chat-canvas" ref={canvasRef}>
          {!activeChat ? (
            <div className="desktop-empty">
              <span className="desktop-empty-icon">💬</span>
              <h3>No conversation yet</h3>
              <p>
                Create a chat to start talking with{' '}
                {cognition ? 'Neura' : 'the agent'}.
              </p>
              <button
                className="button-primary"
                type="button"
                onClick={onNewChat}
              >
                + New chat
              </button>
            </div>
          ) : (
            <div
              className="canvas-world"
              style={{ width: WORLD_SIZE.width, height: WORLD_SIZE.height }}
            >
              <div
                className="desktop-glow"
                aria-hidden="true"
                style={{
                  background: `radial-gradient(circle at 30% 20%, ${accent}2e, transparent 55%)`,
                }}
              />
              <>
                {!activeChat.windowState.minimized ? (
                  <WindowFrame
                    title={activeChat.title || 'New chat'}
                    kind="chat"
                    x={activeChat.windowState.x}
                    y={activeChat.windowState.y}
                    w={activeChat.windowState.w}
                    h={activeChat.windowState.h}
                    z={activeChat.windowState.z}
                    minimized={false}
                    focused={topZ === activeChat.windowState.z}
                    accent={accent}
                    bounds={desktopSize}
                    onFocus={() => updateChatWindow({ z: bumpZ() })}
                    onMove={(x, y) => updateChatWindow({ x, y })}
                    onResize={(w, h) => updateChatWindow({ w, h })}
                    onMinimize={() => updateChatWindow({ minimized: true })}
                  >
                    <div className="chat-window-body">
                      <div className="chat-window-header">
                        <div>
                          <span className="section-kicker">CONVERSATION</span>
                          <h3>{activeChat.title || 'New chat'}</h3>
                        </div>
                        <span
                          className={`chat-status ${sending ? '' : 'ready'}`}
                        >
                          {sending
                            ? 'thinking…'
                            : deepSeekConfigured
                              ? 'online'
                              : 'local'}
                        </span>
                      </div>
                      <div className="chat-messages">
                        {activeChat.messages.length === 0 && !sending ? (
                          <div className="chat-empty">
                            <strong>Empieza la conversación</strong>
                            <span>
                              El agente responde con su personalidad, emociones
                              y memorias. Puede generar gráficos y código en
                              ventanas separadas.
                            </span>
                          </div>
                        ) : null}
                        {activeChat.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`chat-message ${message.role}`}
                          >
                            <span className="chat-message-role">
                              {message.role === 'user' ? 'TÚ' : 'NEURA'}
                            </span>
                            <p>
                              {message.content === '…' ? (
                                <span className="ai-generating">
                                  Sintetizando respuesta…
                                </span>
                              ) : message.role === 'assistant' &&
                                message.revealed !== true ? (
                                <StreamedMessage
                                  message={message}
                                  onRevealed={() =>
                                    markMessageRevealed(message.id)
                                  }
                                />
                              ) : (
                                <MessageText
                                  text={message.content}
                                  artifacts={activeChat.artifacts}
                                  onFocusArtifact={focusArtifact}
                                />
                              )}
                            </p>
                          </div>
                        ))}
                        <div ref={messagesEndRef} />
                      </div>
                      <form className="chat-composer" onSubmit={submit}>
                        <textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          placeholder="Escribe un mensaje… (usa ```chart / ```code para que Neura abra ventanas)"
                          rows={3}
                        />
                        <div className="composer-footer">
                          <span>Enter para enviar</span>
                          <button
                            className="button-primary"
                            type="submit"
                            disabled={!draft.trim() || sending}
                          >
                            Send
                          </button>
                        </div>
                      </form>
                    </div>
                  </WindowFrame>
                ) : null}

                {cognitionWindow.open && !cognitionWindow.minimized ? (
                  <WindowFrame
                    title="Cognitive"
                    kind="cognition"
                    x={cognitionWindow.x}
                    y={cognitionWindow.y}
                    w={cognitionWindow.w}
                    h={cognitionWindow.h}
                    z={cognitionWindow.z}
                    minimized={false}
                    focused={topZ === cognitionWindow.z}
                    accent="#a78bfa"
                    bounds={desktopSize}
                    onFocus={() =>
                      setCognitionWindow((current) => ({
                        ...current,
                        z: bumpZ(),
                      }))
                    }
                    onMove={(x, y) =>
                      setCognitionWindow((current) => ({ ...current, x, y }))
                    }
                    onResize={(w, h) =>
                      setCognitionWindow((current) => ({ ...current, w, h }))
                    }
                    onMinimize={() =>
                      setCognitionWindow((current) => ({
                        ...current,
                        minimized: true,
                      }))
                    }
                    onClose={() =>
                      setCognitionWindow((current) => ({
                        ...current,
                        open: false,
                      }))
                    }
                  >
                    <div className="window-cognition">
                      <CognitivePanel cognition={cognition} />
                    </div>
                  </WindowFrame>
                ) : null}

                {activeChat.artifacts.map((artifact) =>
                  artifact.minimized ? null : (
                    <WindowFrame
                      key={artifact.id}
                      title={artifact.title}
                      kind={artifact.kind}
                      x={artifact.x}
                      y={artifact.y}
                      w={artifact.w}
                      h={artifact.h}
                      z={artifact.z}
                      minimized={false}
                      focused={topZ === artifact.z}
                      bounds={desktopSize}
                      onFocus={() => focusArtifact(artifact.id)}
                      onMove={(x, y) => updateArtifact(artifact.id, { x, y })}
                      onResize={(w, h) => updateArtifact(artifact.id, { w, h })}
                      onMinimize={() =>
                        updateArtifact(artifact.id, { minimized: true })
                      }
                      onClose={() => closeArtifact(artifact.id)}
                    >
                      <ArtifactContent artifact={artifact} />
                    </WindowFrame>
                  ),
                )}
              </>
            </div>
          )}

          {minimizedWindows.length ? (
            <div
              className="desktop-taskbar"
              role="toolbar"
              aria-label="Minimized windows"
            >
              {minimizedWindows.map((window) => (
                <button
                  key={window.id}
                  type="button"
                  className="taskbar-chip"
                  onClick={() => {
                    if (window.id === 'chat') {
                      updateChatWindow({ minimized: false });
                    } else if (window.id === 'cognition') {
                      setCognitionWindow((current) => ({
                        ...current,
                        minimized: false,
                        open: true,
                        z: bumpZ(),
                      }));
                    } else {
                      updateArtifact(window.id, {
                        minimized: false,
                        z: bumpZ(),
                      });
                    }
                  }}
                >
                  <span aria-hidden="true">{window.icon}</span>
                  {window.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
