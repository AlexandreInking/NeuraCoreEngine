import { useEffect, useRef, useState, type FormEvent } from 'react';
import CognitivePanel from '../CognitivePanel';
import type { CognitiveState } from '../cognition/types';
import { EMOTION_COLORS } from '../cognition/types';
import ArtifactContent from './ArtifactContent';
import WindowFrame from './WindowFrame';
import {
  ARTIFACT_ICONS,
  parseMarker,
  type ArtifactWindow,
  type ChatWindowState,
} from './artifacts';
import type { Chat, ChatMessage } from './types';
import {
  useIntentionCapture,
  INTENTION_LABELS,
  type PredictedIntent,
} from '../intention';

const COGNITION_WINDOW_KEY = 'neuracore-cognition-window';

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
  const intentionCapture = useIntentionCapture();
  const [lastPrediction, setLastPrediction] = useState<PredictedIntent | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [cognitionWindow, setCognitionWindow] = useState<CognitionWindowState>(
    () =>
      readCognitionWindowState(
        typeof window !== 'undefined' ? window.innerWidth : 1280,
      ),
  );
  const [topZ, setTopZ] = useState(100);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panMode, setPanMode] = useState(false);
  const panModeRef = useRef(false);
  panModeRef.current = panMode;
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const sending = activeChat?.messages.some(
    (message) => message.role === 'assistant' && message.content === '…',
  );
  const accent = cognition
    ? EMOTION_COLORS[cognition.emotions.dominantEmotion]
    : '#70a1ff';

  // Pan the infinite canvas: middle-drag always, or left-drag in pan mode.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (event: PointerEvent) => {
      const panning =
        event.button === 1 || (event.button === 0 && panModeRef.current);
      if (!panning) return;
      event.preventDefault();
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origX: pan.x,
        origY: pan.y,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-panning');
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = panRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setPan({
        x: drag.origX + (event.clientX - drag.startX),
        y: drag.origY + (event.clientY - drag.startY),
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (panRef.current?.pointerId === event.pointerId) {
        panRef.current = null;
        canvas.classList.remove('is-panning');
      }
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
  }, [pan.x, pan.y]);

  useEffect(() => {
    setDraft('');
  }, [activeChat?.id]);

  // When switching chats, center the conversation window on the viewport.
  useEffect(() => {
    if (!activeChat) return;
    centerRect(activeChat.windowState);
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

  /** Pan so a rectangle's center sits on the viewport center. */
  const centerRect = (rect: { x: number; y: number; w: number; h: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPan({
      x: canvas.clientWidth / 2 - (rect.x + rect.w / 2),
      y: canvas.clientHeight / 2 - (rect.y + rect.h / 2),
    });
  };

  const centerAll = () => {
    if (!activeChat) return;
    const rects: Array<{ x: number; y: number; w: number; h: number }> = [
      activeChat.windowState,
    ];
    if (cognitionWindow.open) rects.push(cognitionWindow);
    for (const artifact of activeChat.artifacts) {
      if (!artifact.minimized) rects.push(artifact);
    }
    const minX = Math.min(...rects.map((rect) => rect.x));
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
    const maxY = Math.max(...rects.map((rect) => rect.y + rect.h));
    centerRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  };

  const resetLayout = () => {
    if (!activeChat) return;
    const chatWindow = { x: 0, y: 0, w: 460, h: 520, z: 10, minimized: false };
    const artifacts = activeChat.artifacts.map((artifact, index) => ({
      ...artifact,
      x: chatWindow.x + 150 + (index % 3) * 36,
      y: chatWindow.y + 80 + (index % 3) * 36,
      z: 20 + index,
      minimized: false,
    }));
    onUpdateChat({ ...activeChat, windowState: chatWindow, artifacts });
    setCognitionWindow(
      defaultCognitionWindowState(
        typeof window !== 'undefined' ? window.innerWidth : 1280,
      ),
    );
    setCognitionWindow((current) => ({ ...current, open: true }));
    setPan({ x: 0, y: 0 });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || !activeChat) return;
    const used = intentionCapture.validateAndClear(content);
    setLastPrediction(used);
    setDraft('');
    onSend(content);
  };

  // Window manager: every open window, for finding/restoring/centering.
  const windowList: Array<{
    id: string;
    label: string;
    icon: string;
    minimized: boolean;
    focused: boolean;
  }> = [];
  if (activeChat) {
    windowList.push({
      id: 'chat',
      label: activeChat.title || 'New chat',
      icon: '💬',
      minimized: activeChat.windowState.minimized,
      focused: topZ === activeChat.windowState.z,
    });
  }
  if (cognitionWindow.open) {
    windowList.push({
      id: 'cognition',
      label: 'Cognitive',
      icon: '🧠',
      minimized: cognitionWindow.minimized,
      focused: topZ === cognitionWindow.z,
    });
  }
  for (const artifact of activeChat?.artifacts ?? []) {
    windowList.push({
      id: artifact.id,
      label: artifact.title,
      icon: ARTIFACT_ICONS[artifact.kind],
      minimized: artifact.minimized,
      focused: topZ === artifact.z,
    });
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
            className={`button-ghost ${panMode ? 'is-active' : ''}`}
            type="button"
            title="Mantén pulsado o usa el botón central para mover el canvas"
            onClick={() => setPanMode((current) => !current)}
          >
            {panMode ? 'Panning…' : 'Pan'}
          </button>
          <button
            className="button-ghost"
            type="button"
            title="Centra todas las ventanas en la vista"
            onClick={centerAll}
          >
            Center all
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
          <div
            className="desktop-glow"
            aria-hidden="true"
            style={{
              background: `radial-gradient(circle at 30% 20%, ${accent}2e, transparent 55%)`,
            }}
          />
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
              className="canvas-viewport"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
            >
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
                    onFocus={() => updateChatWindow({ z: bumpZ() })}
                    onMove={(x, y) => updateChatWindow({ x, y })}
                    onResize={(w, h) => updateChatWindow({ w, h })}
                    onMinimize={() => updateChatWindow({ minimized: true })}
                    onCenter={() => centerRect(activeChat.windowState)}
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
                          onChange={(event) => {
                            setDraft(event.target.value);
                            intentionCapture.onChange(event.target.value);
                          }}
                          placeholder="Escribe un mensaje… (usa ```chart / ```code para que Neura abra ventanas)"
                          rows={3}
                        />
                        <div className="composer-footer">
                          {intentionCapture.status === 'analyzing' ? (
                            <span className="intention-chip analyzing">
                              ⏳ Analizando intención…
                            </span>
                          ) : intentionCapture.intention ? (
                            <span className="intention-chip ready" title="Intención predictiva cacheada (pausa de 1.99s)">
                              ⚡ {INTENTION_LABELS[intentionCapture.intention.type]} · conf{' '}
                              {Math.round(intentionCapture.intention.confidence * 100)}% · urgencia{' '}
                              {Math.round(intentionCapture.intention.urgency * 100)}%
                              {intentionCapture.intention.topics.length
                                ? ` · ${intentionCapture.intention.topics.join(', ')}`
                                : ''}
                            </span>
                          ) : lastPrediction ? (
                            <span className="intention-chip used" title="Enviado con contexto predictivo">
                              ⚡ Enviado con predicción: {INTENTION_LABELS[lastPrediction.type]}
                            </span>
                          ) : (
                            <span>Enter para enviar</span>
                          )}
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
                    onCenter={() => centerRect(cognitionWindow)}
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
                      onFocus={() => focusArtifact(artifact.id)}
                      onMove={(x, y) => updateArtifact(artifact.id, { x, y })}
                      onResize={(w, h) => updateArtifact(artifact.id, { w, h })}
                      onMinimize={() =>
                        updateArtifact(artifact.id, { minimized: true })
                      }
                      onClose={() => closeArtifact(artifact.id)}
                      onCenter={() => centerRect(artifact)}
                    >
                      <ArtifactContent artifact={artifact} />
                    </WindowFrame>
                  ),
                )}
              </>
            </div>
          )}

          {windowList.length ? (
            <div
              className="desktop-taskbar"
              role="toolbar"
              aria-label="Window manager"
            >
              {windowList.map((window) => (
                <button
                  key={window.id}
                  type="button"
                  className={`taskbar-chip ${window.focused ? 'active' : ''} ${window.minimized ? 'minimized' : ''}`}
                  title="Centrar y traer al frente"
                  onClick={() => {
                    if (window.id === 'chat') {
                      updateChatWindow({ minimized: false, z: bumpZ() });
                      centerRect(activeChat.windowState);
                    } else if (window.id === 'cognition') {
                      setCognitionWindow((current) => ({
                        ...current,
                        minimized: false,
                        open: true,
                        z: bumpZ(),
                      }));
                      centerRect(cognitionWindow);
                    } else {
                      const artifact = activeChat.artifacts.find(
                        (item) => item.id === window.id,
                      );
                      if (artifact) {
                        updateArtifact(artifact.id, {
                          minimized: false,
                          z: bumpZ(),
                        });
                        centerRect(artifact);
                      }
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
