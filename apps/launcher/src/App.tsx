import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  check,
  type DownloadEvent,
  type Update,
} from '@tauri-apps/plugin-updater';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  HashRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { CHANGELOG } from './changelog';
import MemoryPage from './MemoryPage';
import AffectEnginePage from './AffectEnginePage';
import LiveSessionPage from './LiveSessionPage';
import {
  CognitionEngine,
  DEFAULT_DEEPSEEK_CONFIG,
  testDeepSeekConnection,
  type CognitiveState,
  type DeepSeekConfig,
  type DeepSeekMessage,
} from './cognition';
import {
  ARCHETYPE_LABELS,
  ATTACHMENT_LABELS,
  EMOTION_LABELS,
} from './cognition/types';
import ChatsPage from './chat/ChatsPage';
import { providerManager } from './llm';
import { TenantAdminPanel } from './tenant/TenantAdminPanel';
import { LlmProvidersSettings } from './LlmProvidersSettings';
import { autoPlaceArtifact, parseArtifacts } from './chat/artifacts';
import type { Chat, ChatMessage } from './chat/types';
import { l0StoreFor } from './l0';
import { DEFAULT_PROSODY } from './l0';
import { l1StoreFor } from './l1';
import { l2StoreFor } from './l2';
import { l3ProfileStore, compileSystemPrompt } from './l3';

const VERSION = 'v0.5.0-alpha';

type Theme = 'dark' | 'light';
type IconName =
  | 'dashboard'
  | 'chats'
  | 'memory'
  | 'affect'
  | 'logs'
  | 'updates'
  | 'settings'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'collapse'
  | 'arrow'
  | 'folder'
  | 'download'
  | 'trash'
  | 'pulse';

const NAV_ITEMS: Array<{ path: string; label: string; icon: IconName }> = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/chats', label: 'Chats', icon: 'chats' },
  { path: '/memory', label: 'Memory', icon: 'memory' },
  { path: '/affect-engine', label: 'Affect Engine', icon: 'affect' },
  { path: '/live', label: 'Live Session', icon: 'pulse' },
  { path: '/logs', label: 'Logs', icon: 'logs' },
  { path: '/updates', label: 'Updates', icon: 'download' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

const CONFIG_PATH_KEY = 'neuracore-config-path';
const CHATS_STORAGE_KEY = 'neuracore-chats';
const DEEPSEEK_STORAGE_KEY = 'neuracore-deepseek';

type Vertical = 'Gaming' | 'HR' | 'EdTech';

type ProjectConfig = {
  schemaVersion: 1;
  agentName: string;
  vertical: Vertical;
  workspacePath: string;
  paths: { workspace: string };
  createdAt: string;
};

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: number;
};

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'installing'
  | 'installed'
  | 'up-to-date'
  | 'error';

function Logo() {
  return (
    <div className="brand-mark" aria-label="Neura-Core logo">
      <svg viewBox="0 0 64 64" role="img" aria-hidden="true">
        <path d="M12 48V16l20 32V16M32 48l20-32v32" />
        <circle cx="32" cy="32" r="28" />
      </svg>
    </div>
  );
}

function Icon({ name }: { name: IconName }) {
  if (name === 'sun') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    );
  }

  if (name === 'moon') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.7 8.7 0 1 0 12 12Z" />
      </svg>
    );
  }

  if (name === 'menu') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  }

  if (name === 'collapse') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m15 18-6-6 6-6M4 4v16M20 4v16" />
      </svg>
    );
  }

  if (name === 'arrow') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    );
  }

  if (name === 'folder') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z" />
      </svg>
    );
  }

  if (name === 'download') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12M7 10l5 5 5-5M5 20h14" />
      </svg>
    );
  }

  if (name === 'trash') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3" />
      </svg>
    );
  }

  if (name === 'pulse') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12h4l2-6 4 12 2-6h6" />
      </svg>
    );
  }

  if (name === 'chats') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
        <path d="M7 9h10M7 13h6" />
      </svg>
    );
  }

  if (name === 'memory') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 9h8M8 13h5M8 17h8" />
      </svg>
    );
  }

  if (name === 'affect') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64 5.64 18.36" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (name === 'logs') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5h14M5 12h14M5 19h9" />
        <circle cx="3" cy="5" r=".75" fill="currentColor" stroke="none" />
        <circle cx="3" cy="12" r=".75" fill="currentColor" stroke="none" />
        <circle cx="3" cy="19" r=".75" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === 'settings') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V20h-2.4v-.2a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.56-1.04H6v-2.4h.2A1.7 1.7 0 0 0 7.76 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.7-1.7.06.06A1.7 1.7 0 0 0 11 6.76 1.7 1.7 0 0 0 12.04 5.2V5h2.4v.2A1.7 1.7 0 0 0 15.48 6.76a1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 18.72 10a1.7 1.7 0 0 0 1.56 1.04h.2v2.4h-.2A1.7 1.7 0 0 0 19.4 15Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 13.5 12 4l8 9.5M6.5 11v8h11v-8M10 19v-5h4v5" />
    </svg>
  );
}

function readSavedTheme(): Theme {
  try {
    return globalThis.localStorage.getItem('neuracore-theme') === 'light'
      ? 'light'
      : 'dark';
  } catch {
    return 'dark';
  }
}

function readSavedConfigPath(): string | null {
  try {
    return globalThis.localStorage.getItem(CONFIG_PATH_KEY);
  } catch {
    return null;
  }
}

function saveConfigPath(configPath: string) {
  try {
    globalThis.localStorage.setItem(CONFIG_PATH_KEY, configPath);
  } catch {
    // The launcher can still use the project during this session.
  }
}

function isProjectConfig(value: unknown): value is ProjectConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<ProjectConfig>;
  return (
    config.schemaVersion === 1 &&
    typeof config.agentName === 'string' &&
    ['Gaming', 'HR', 'EdTech'].includes(config.vertical ?? '') &&
    typeof config.workspacePath === 'string' &&
    typeof config.paths?.workspace === 'string' &&
    typeof config.createdAt === 'string'
  );
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
}

function createChat(title = 'New chat'): Chat {
  const now = new Date().toISOString();
  return {
    id: createId('chat'),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
    artifacts: [],
    windowState: { x: 24, y: 24, w: 420, h: 480, z: 10, minimized: false },
  };
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string'
  );
}

function isChat(value: unknown): value is Chat {
  if (!value || typeof value !== 'object') return false;
  const chat = value as Partial<Chat>;
  return (
    typeof chat.id === 'string' &&
    typeof chat.title === 'string' &&
    typeof chat.createdAt === 'string' &&
    typeof chat.updatedAt === 'string' &&
    Array.isArray(chat.messages) &&
    chat.messages.every(isChatMessage)
  );
}

/** Normalize persisted chats (older versions lack artifacts/windowState). */
function normalizeChat(chat: Chat): Chat {
  return {
    ...chat,
    artifacts: Array.isArray(chat.artifacts) ? chat.artifacts : [],
    windowState: chat.windowState ?? {
      x: 24,
      y: 24,
      w: 420,
      h: 480,
      z: 10,
      minimized: false,
    },
  };
}

function readSavedChats(): Chat[] {
  try {
    const saved = globalThis.localStorage.getItem(CHATS_STORAGE_KEY);
    if (!saved) return [createChat()];
    const parsed: unknown = JSON.parse(saved);
    const chats = Array.isArray(parsed)
      ? parsed.filter(isChat).map(normalizeChat)
      : [];
    return chats.length ? chats : [createChat()];
  } catch {
    return [createChat()];
  }
}

function saveChats(chats: Chat[]) {
  try {
    globalThis.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // The current session remains usable when local storage is unavailable.
  }
}

function readSavedDeepSeekConfig(): DeepSeekConfig {
  try {
    const saved = globalThis.localStorage.getItem(DEEPSEEK_STORAGE_KEY);
    if (!saved) return DEFAULT_DEEPSEEK_CONFIG;
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_DEEPSEEK_CONFIG;
    const config = parsed as Partial<DeepSeekConfig>;
    return {
      apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
      baseUrl:
        typeof config.baseUrl === 'string' && config.baseUrl.trim()
          ? config.baseUrl
          : DEFAULT_DEEPSEEK_CONFIG.baseUrl,
      model:
        typeof config.model === 'string' && config.model.trim()
          ? config.model
          : DEFAULT_DEEPSEEK_CONFIG.model,
    };
  } catch {
    return DEFAULT_DEEPSEEK_CONFIG;
  }
}

function saveDeepSeekConfig(config: DeepSeekConfig) {
  try {
    globalThis.localStorage.setItem(
      DEEPSEEK_STORAGE_KEY,
      JSON.stringify(config),
    );
  } catch {
    // The current session remains usable when local storage is unavailable.
  }
}

function StartupScreen() {
  return (
    <main className="startup-screen">
      <Logo />
      <p className="eyebrow">COGNITIVE ENGINE</p>
      <h1>Loading Neura-Core</h1>
      <span className="startup-status">
        <i className="status-dot" /> Preparing desktop workspace
      </span>
    </main>
  );
}

function OnboardingWizard({
  onComplete,
}: {
  onComplete: (config: ProjectConfig) => void;
}) {
  const [step, setStep] = useState(1);
  const [agentName, setAgentName] = useState('');
  const [vertical, setVertical] = useState<Vertical>('Gaming');
  const [workspacePath, setWorkspacePath] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const chooseWorkspace = async () => {
    setError('');
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: 'Seleccionar directorio de trabajo',
      });
      if (typeof selection === 'string') setWorkspacePath(selection);
    } catch (reason) {
      setError(`No se pudo abrir el selector de carpetas: ${String(reason)}`);
    }
  };

  const createProject = async () => {
    setSaving(true);
    setError('');
    const config: ProjectConfig = {
      schemaVersion: 1,
      agentName: agentName.trim(),
      vertical,
      workspacePath,
      paths: { workspace: workspacePath },
      createdAt: new Date().toISOString(),
    };

    try {
      const configPath = await invoke<string>('write_project_config', {
        workspacePath,
        contents: JSON.stringify(config, null, 2),
      });
      saveConfigPath(configPath);
      onComplete(config);
    } catch (reason) {
      setError(`No se pudo crear el proyecto: ${String(reason)}`);
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => {
    setError('');
    if (step === 1 && !agentName.trim()) {
      setError('Escribe un nombre para el agente.');
      return;
    }
    if (step === 2 && !workspacePath) {
      setError('Selecciona un directorio de trabajo.');
      return;
    }
    setStep((current) => Math.min(current + 1, 3));
  };

  return (
    <main className="wizard-shell">
      <section className="wizard-card" aria-labelledby="wizard-title">
        <header className="wizard-header">
          <Logo />
          <div>
            <p className="eyebrow">FIRST LAUNCH</p>
            <h1 id="wizard-title">Set up your workspace</h1>
            <p>
              Configure Neura-Core once. It will remember this project on your
              next launch.
            </p>
          </div>
        </header>
        <div className="wizard-steps" aria-label="Setup progress">
          {[
            ['01', 'Agent'],
            ['02', 'Workspace'],
            ['03', 'Review'],
          ].map(([number, label], index) => (
            <div
              className={`wizard-step ${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'complete' : ''}`}
              key={number}
            >
              <span>{number}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <form
          className="wizard-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (step === 3) void createProject();
            else nextStep();
          }}
        >
          {step === 1 && (
            <div className="wizard-panel">
              <span className="section-kicker">STEP 01 / IDENTITY</span>
              <h2>Name your agent</h2>
              <p>
                Give this local project a clear identity. You can change it
                later in the project file.
              </p>
              <label className="field">
                <span>Agent name</span>
                <input
                  autoFocus
                  value={agentName}
                  onChange={(event) => setAgentName(event.target.value)}
                  placeholder="e.g. Merchant Garrick"
                  maxLength={80}
                />
              </label>
              <label className="field">
                <span>Vertical</span>
                <select
                  value={vertical}
                  onChange={(event) =>
                    setVertical(event.target.value as Vertical)
                  }
                >
                  <option value="Gaming">Gaming</option>
                  <option value="HR">HR</option>
                  <option value="EdTech">EdTech</option>
                </select>
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="wizard-panel">
              <span className="section-kicker">STEP 02 / STORAGE</span>
              <h2>Choose a workspace</h2>
              <p>
                Neura-Core will create <code>neuracore.config.json</code> in
                this folder.
              </p>
              <button
                className="directory-picker"
                type="button"
                onClick={() => void chooseWorkspace()}
              >
                <span className="directory-icon">
                  <Icon name="folder" />
                </span>
                <span>
                  <strong>
                    {workspacePath
                      ? 'Workspace selected'
                      : 'Select workspace folder'}
                  </strong>
                  <small>
                    {workspacePath || 'Open the native desktop folder picker'}
                  </small>
                </span>
                <Icon name="arrow" />
              </button>
            </div>
          )}
          {step === 3 && (
            <div className="wizard-panel">
              <span className="section-kicker">STEP 03 / CONFIRM</span>
              <h2>Ready to create</h2>
              <p>
                Review the project details before writing the configuration file
                to disk.
              </p>
              <div className="wizard-summary">
                <div>
                  <span>Agent</span>
                  <strong>{agentName}</strong>
                </div>
                <div>
                  <span>Vertical</span>
                  <strong>{vertical}</strong>
                </div>
                <div>
                  <span>Workspace</span>
                  <strong className="path-value">{workspacePath}</strong>
                </div>
                <div>
                  <span>File</span>
                  <strong>neuracore.config.json</strong>
                </div>
              </div>
            </div>
          )}
          {error && (
            <p className="wizard-error" role="alert">
              {error}
            </p>
          )}
          <div className="wizard-actions">
            {step > 1 && (
              <button
                className="button-ghost"
                type="button"
                onClick={() => {
                  setError('');
                  setStep((current) => current - 1);
                }}
              >
                Back
              </button>
            )}
            <button className="button-primary" type="submit" disabled={saving}>
              {saving
                ? 'Creating project…'
                : step === 3
                  ? 'Create project'
                  : 'Continue'}{' '}
              <Icon name="arrow" />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function Page({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="page" aria-labelledby="page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="page-title">{title}</h2>
          <p className="page-description">{description}</p>
        </div>
        <span className="page-version">{VERSION}</span>
      </div>
      {children}
    </section>
  );
}

function DashboardPage({
  config,
  cognition,
  deepSeekConfigured,
}: {
  config: ProjectConfig;
  cognition: CognitiveState | null;
  deepSeekConfigured: boolean;
}) {
  const dominant = cognition
    ? EMOTION_LABELS[cognition.emotions.dominantEmotion]
    : '—';
  return (
    <Page
      eyebrow="SYSTEM OVERVIEW"
      title="Dashboard"
      description="A quiet control surface for memory, affect, and agency."
    >
      <div className="metric-grid">
        <article className="metric-card metric-card-accent">
          <span className="metric-label">Launcher status</span>
          <strong>Ready</strong>
          <span className="metric-note">
            <i className="status-dot" /> Native desktop shell online
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Active workspace</span>
          <strong>{config.agentName}</strong>
          <span className="metric-note">{config.vertical} workspace</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Engine bridge</span>
          <strong>{deepSeekConfigured ? 'DeepSeek' : 'Local'}</strong>
          <span className="metric-note">
            {deepSeekConfigured
              ? DEFAULT_DEEPSEEK_CONFIG.model
              : 'Cognition engine offline-ready'}
          </span>
        </article>
      </div>
      <div className="metric-grid dashboard-cognition-grid">
        <article className="metric-card">
          <span className="metric-label">DOMINANT EMOTION</span>
          <strong>{dominant}</strong>
          <span className="metric-note">
            Intensidad{' '}
            {cognition ? Math.round(cognition.emotions.intensity * 100) : '—'}%
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">CONSCIOUSNESS</span>
          <strong>
            {cognition
              ? Math.round(cognition.introspection.selfAwareness * 100)
              : '—'}
            %
          </strong>
          <span className="metric-note">
            {cognition
              ? `Arquetipo ${ARCHETYPE_LABELS[cognition.personality.jungian.activeArchetype]}`
              : 'Esperando al motor cognitivo'}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">MEMORY UNITS</span>
          <strong>{cognition?.memory.units.length ?? '—'}</strong>
          <span className="metric-note">
            {cognition
              ? `${cognition.memory.units.filter((m) => m.isRepressed).length} reprimidas`
              : 'Sin actividad todavía'}
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-label">INTERNAL CONFLICT</span>
          <strong>
            {cognition
              ? Math.round(
                  cognition.personality.psychodynamics.conflictLevel * 100,
                )
              : '—'}
            %
          </strong>
          <span className="metric-note">
            {cognition
              ? `${ATTACHMENT_LABELS[cognition.personality.psychodynamics.attachmentStyle]} · ${cognition.personality.psychodynamics.dominantAspect}`
              : 'Aspecto consciente/subconsciente'}
          </span>
        </article>
      </div>
      <div className="content-grid">
        <article className="surface surface-large">
          <div className="surface-header">
            <div>
              <span className="section-kicker">COGNITIVE SIGNAL</span>
              <h3>The engine is alive</h3>
            </div>
            <span className="surface-badge">0.1 ALPHA</span>
          </div>
          <p className="surface-copy">
            {cognition
              ? cognition.introspection.lastInsight
              : 'Envía un mensaje en Chats para que Neura empiece a sentir y recordar.'}
          </p>
          <NavLink className="text-link" to="/chats">
            Open the conversation layer <Icon name="arrow" />
          </NavLink>
        </article>
        <article className="surface signal-card">
          <span className="section-kicker">CORE SIGNAL</span>
          <div className="signal-visual" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <strong>Memory. Affect. Agency.</strong>
          <span>Neura-Core cognitive engine</span>
        </article>
      </div>
    </Page>
  );
}

function formatLogTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function LogsPage({
  logs,
  onClear,
}: {
  logs: LogEntry[];
  onClear: () => void;
}) {
  const [busy, setBusy] = useState<'test' | 'export' | null>(null);
  const [status, setStatus] = useState('Ready for engine events.');
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const consoleElement = consoleRef.current;
    if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
  }, [logs]);

  const emitTestLogs = async () => {
    setBusy('test');
    setStatus('Emitting test events from Rust…');
    try {
      await invoke('emit_test_logs');
      setStatus('10 test events emitted.');
    } catch (reason) {
      setStatus(`Could not emit test events: ${String(reason)}`);
    } finally {
      setBusy(null);
    }
  };

  const clearLogs = () => {
    onClear();
    setStatus('Log console cleared.');
  };

  const exportLogs = async () => {
    if (!logs.length) {
      setStatus('Nothing to export yet.');
      return;
    }

    setBusy('export');
    setStatus('Choose where to save the text file.');
    try {
      const path = await save({
        defaultPath: 'neuracore-logs.txt',
        filters: [{ name: 'Text file', extensions: ['txt'] }],
      });
      if (!path) {
        setStatus('Export canceled.');
        return;
      }

      const contents = logs
        .map(
          (entry) =>
            `[${formatLogTime(entry.timestamp)}] ${entry.level.padEnd(5)} ${entry.message}`,
        )
        .join('\n');
      await invoke('write_text_file', { path, contents });
      setStatus(`Exported ${logs.length} entries.`);
    } catch (reason) {
      setStatus(`Could not export logs: ${String(reason)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page
      eyebrow="EVENT STREAM"
      title="Logs"
      description="Follow native engine events without leaving the desktop shell."
    >
      <div className="logs-toolbar">
        <div>
          <span className="section-kicker">LIVE CONSOLE</span>
          <p className="logs-status" role="status">
            {status}
          </p>
        </div>
        <div className="log-actions">
          <button
            className="button-primary"
            type="button"
            onClick={() => void emitTestLogs()}
            disabled={busy !== null}
          >
            <Icon name="pulse" /> {busy === 'test' ? 'Sending…' : 'Test Log'}
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={clearLogs}
            disabled={busy !== null || !logs.length}
          >
            <Icon name="trash" /> Clear
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={() => void exportLogs()}
            disabled={busy !== null || !logs.length}
          >
            <Icon name="download" />{' '}
            {busy === 'export' ? 'Saving…' : 'Export .txt'}
          </button>
        </div>
      </div>
      <div
        ref={consoleRef}
        className="log-console"
        role="log"
        aria-live="polite"
        aria-label="Neura-Core event log"
      >
        {!logs.length ? (
          <div className="log-empty">
            <Icon name="logs" />
            <strong>No events yet</strong>
            <span>Use Test Log to emit ten native Rust events.</span>
          </div>
        ) : (
          logs.map((entry, index) => (
            <div className="log-entry" key={`${entry.timestamp}-${index}`}>
              <time>{formatLogTime(entry.timestamp)}</time>
              <span className={`log-level level-${entry.level.toLowerCase()}`}>
                {entry.level}
              </span>
              <span className="log-message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </Page>
  );
}

function updateErrorMessage(reason: unknown) {
  const message = String(reason);
  if (/signature|verify|public key|invalid/i.test(message)) {
    return 'Update rejected: cryptographic signature could not be verified.';
  }
  return `Update check failed: ${message}`;
}

function updateStatusLabel(status: UpdateStatus, error: string | null) {
  switch (status) {
    case 'checking':
      return 'Checking GitHub Releases…';
    case 'available':
      return 'Signed update available.';
    case 'installing':
      return 'Downloading and installing in background…';
    case 'installed':
      return 'Update installed. Restarting is handled by the desktop installer.';
    case 'up-to-date':
      return 'You are running the latest available version.';
    case 'error':
      return error ?? 'Update check failed.';
    default:
      return 'Updater ready.';
  }
}

function formatUpdateDate(date?: string) {
  if (!date) return 'Date unavailable';
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf())
    ? date
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
        parsed,
      );
}

function UpdateBanner({
  update,
  status,
  progress,
  onInstall,
}: {
  update: Update | null;
  status: UpdateStatus;
  progress: number | null;
  onInstall: () => void;
}) {
  if (!update) return null;

  const installing = status === 'installing';
  const installed = status === 'installed';

  return (
    <section className="update-banner" role="status">
      <div className="update-banner-icon">
        <Icon name="download" />
      </div>
      <div className="update-banner-copy">
        <strong>
          {installed ? 'Update installed' : `New version ${update.version}`}
        </strong>
        <span>
          {installed
            ? 'The desktop installer will finish the update.'
            : 'A signed update is ready for Neura-Core.'}
        </span>
        {installing && progress !== null ? (
          <div
            className="update-progress"
            aria-label={`${progress}% downloaded`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </div>
      {!installed ? (
        <button
          className="button-primary update-banner-action"
          type="button"
          onClick={() => void onInstall()}
          disabled={installing}
        >
          <Icon name="download" />
          {installing ? `${progress ?? 0}%` : 'Install update'}
        </button>
      ) : null}
    </section>
  );
}

function UpdatesPage({
  update,
  status,
  error,
  progress,
  onCheck,
  onInstall,
}: {
  update: Update | null;
  status: UpdateStatus;
  error: string | null;
  progress: number | null;
  onCheck: () => void;
  onInstall: () => void;
}) {
  const checking = status === 'checking';
  const installing = status === 'installing';

  return (
    <Page
      eyebrow="RELEASE CHANNEL"
      title="Updates"
      description="Check GitHub Releases for signed desktop updates and review release notes."
    >
      <div className="update-layout">
        <article className="surface update-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">CURRENT RELEASE</span>
              <h3>{VERSION}</h3>
            </div>
            <span className="surface-badge">SIGNED</span>
          </div>
          <p className="surface-copy">{updateStatusLabel(status, error)}</p>
          {update ? (
            <dl className="settings-list update-details">
              <div>
                <dt>Available version</dt>
                <dd>{update.version}</dd>
              </div>
              <div>
                <dt>Published</dt>
                <dd>{formatUpdateDate(update.date)}</dd>
              </div>
              <div>
                <dt>Signature</dt>
                <dd>Verified by Tauri</dd>
              </div>
            </dl>
          ) : null}
          {installing && progress !== null ? (
            <div className="update-progress update-progress-large">
              <span style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          <div className="update-actions">
            <button
              className="button-primary"
              type="button"
              onClick={() => void onCheck()}
              disabled={checking || installing}
            >
              <Icon name="pulse" />
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
            {update ? (
              <button
                className="button-ghost"
                type="button"
                onClick={() => void onInstall()}
                disabled={status !== 'available'}
              >
                <Icon name="download" />
                {installing ? 'Installing…' : 'Install update'}
              </button>
            ) : null}
          </div>
        </article>
        <article className="surface update-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">RELEASE NOTES</span>
              <h3>Changelog</h3>
            </div>
            <span className="surface-badge">LOCAL</span>
          </div>
          {update?.body ? (
            <div className="remote-notes">
              <strong>Notes for {update.version}</strong>
              <p>{update.body}</p>
            </div>
          ) : null}
          <div className="changelog-list">
            {CHANGELOG.map((entry) => (
              <div className="changelog-entry" key={entry.version}>
                <div>
                  <strong>{entry.version}</strong>
                  <span>{entry.date}</span>
                </div>
                <ul>
                  {entry.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </article>
      </div>
    </Page>
  );
}

function SettingsPage({
  theme,
  onThemeChange,
  config,
  deepSeekConfig,
  deepSeekStatus,
  onSaveDeepSeek,
  onTestDeepSeek,
}: {
  theme: Theme;
  onThemeChange: () => void;
  config: ProjectConfig;
  deepSeekConfig: DeepSeekConfig;
  deepSeekStatus: string;
  onSaveDeepSeek: (config: DeepSeekConfig) => void;
  onTestDeepSeek: (config: DeepSeekConfig) => void;
}) {
  const [draft, setDraft] = useState(deepSeekConfig);

  useEffect(() => setDraft(deepSeekConfig), [deepSeekConfig]);

  return (
    <Page
      eyebrow="APPLICATION"
      title="Settings"
      description="Tune the desktop shell before connecting the cognitive engine."
    >
      <div className="settings-layout">
        <article className="surface settings-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">APPEARANCE</span>
              <h3>Theme</h3>
            </div>
            <span className="surface-badge">LOCAL</span>
          </div>
          <p className="surface-copy">
            Your preference is stored locally and restored when the launcher
            starts again.
          </p>
          <button
            className="theme-control"
            type="button"
            onClick={onThemeChange}
          >
            <span className="theme-control-icon">
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} />
            </span>
            <span>
              <strong>{theme === 'dark' ? 'Dark theme' : 'Light theme'}</strong>
              <small>
                Switch to {theme === 'dark' ? 'light' : 'dark'} mode
              </small>
            </span>
            <span className="theme-switch" aria-hidden="true">
              <span />
            </span>
          </button>
        </article>
        <article className="surface settings-card">
          <span className="section-kicker">PROJECT</span>
          <h3>{config.agentName}</h3>
          <dl className="settings-list">
            <div>
              <dt>Vertical</dt>
              <dd>{config.vertical}</dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd className="path-value">{config.workspacePath}</dd>
            </div>
            <div>
              <dt>Config file</dt>
              <dd>neuracore.config.json</dd>
            </div>
          </dl>
        </article>
      </div>
      <article className="surface deepseek-settings">
        <div className="surface-header">
          <div>
            <span className="section-kicker">MODEL CONNECTION</span>
            <h3>DeepSeek API</h3>
          </div>
          <span
            className={`surface-badge ${deepSeekConfig.apiKey ? 'surface-badge-ready' : ''}`}
          >
            {deepSeekConfig.apiKey ? 'CONNECTED' : 'NOT CONFIGURED'}
          </span>
        </div>
        <p className="surface-copy">
          Configure the only external model supported in this milestone. The key
          stays on this computer and is sent only to the DeepSeek endpoint when
          you test the connection or send a chat message.
        </p>
        <form
          className="deepseek-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveDeepSeek(draft);
          }}
        >
          <label className="field settings-field">
            <span>API key</span>
            <input
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  apiKey: event.target.value,
                }))
              }
              placeholder="sk-…"
            />
          </label>
          <label className="field settings-field">
            <span>Base URL</span>
            <input
              type="url"
              value={draft.baseUrl}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  baseUrl: event.target.value,
                }))
              }
            />
          </label>
          <label className="field settings-field">
            <span>Model</span>
            <input
              value={draft.model}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
              placeholder={DEFAULT_DEEPSEEK_CONFIG.model}
            />
          </label>
          {deepSeekStatus ? (
            <p className="settings-status" role="status">
              {deepSeekStatus}
            </p>
          ) : null}
          <div className="settings-actions">
            <button
              className="button-ghost"
              type="button"
              onClick={() => onTestDeepSeek(draft)}
            >
              Test connection
            </button>
            <button className="button-primary" type="submit">
              Save DeepSeek
            </button>
          </div>
        </form>
      </article>

      <LlmProvidersSettings />
      <TenantAdminPanel />
    </Page>
  );
}

function LauncherShell() {
  const location = useLocation();
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(
    null,
  );
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chats, setChats] = useState<Chat[]>(readSavedChats);
  const [activeChatId, setActiveChatId] = useState('');
  const [deepSeekConfig, setDeepSeekConfig] = useState<DeepSeekConfig>(
    readSavedDeepSeekConfig,
  );
  const [deepSeekStatus, setDeepSeekStatus] = useState('');
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const engineRef = useRef<CognitionEngine | null>(null);
  const [cognitionState, setCognitionState] = useState<CognitiveState | null>(
    null,
  );
  const [dreamStatus, setDreamStatus] = useState('Dream engine idle.');
  const currentItem =
    NAV_ITEMS.find((item) => item.path === location.pathname) ?? NAV_ITEMS[0];

  useEffect(() => {
    if (!activeChatId || !chats.some((chat) => chat.id === activeChatId)) {
      setActiveChatId(chats[0]?.id ?? '');
    }
  }, [activeChatId, chats]);

  useEffect(() => saveChats(chats), [chats]);

  useEffect(() => {
    if (!projectConfig) return;
    const engine = CognitionEngine.load(projectConfig.agentName);
    engineRef.current = engine;
    const dream = engine.maybeRunDreamCycle(engine.state, Date.now());
    if (dream) {
      engine.save();
      setDreamStatus(
        `Dream cycle completed: ${dream.consolidatedCount} memories consolidated.`,
      );
    }
    setCognitionState({ ...engine.state });
  }, [projectConfig]);

  const createNewChat = () => {
    const chat = createChat();
    setChats((current) => [chat, ...current]);
    setActiveChatId(chat.id);
  };

  const sendChatMessage = async (content: string) => {
    const targetChatId = activeChatId || chats[0]?.id;
    const targetChat = chats.find((chat) => chat.id === targetChatId);
    const engine = engineRef.current;
    if (
      !targetChat ||
      !engine ||
      targetChat.messages.some((message) => message.content === '…')
    ) {
      return;
    }

    const agentId = projectConfig?.agentName ?? 'Neura';
    const l0 = l0StoreFor(agentId);

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: createId('message'),
      role: 'user',
      content,
      createdAt: now,
    };
    const nextTitle = targetChat.messages.length
      ? targetChat.title
      : content.slice(0, 42) || 'New chat';
    const nextMessages = [...targetChat.messages, userMessage];
    l0.append('main', agentId, 'user', content, { ...DEFAULT_PROSODY });

    setChats((current) =>
      current.map((chat) =>
        chat.id === targetChatId
          ? {
              ...chat,
              title: nextTitle,
              messages: nextMessages,
              updatedAt: now,
            }
          : chat,
      ),
    );

    // The cognition engine always processes the message (deterministic
    // fallback when DeepSeek is not configured).
    const processed = await engine.processMessage(content, deepSeekConfig);
    setCognitionState({ ...processed.state });

    if (!deepSeekConfig.apiKey.trim()) {
      setChats((current) =>
        current.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    id: createId('message'),
                    role: 'assistant',
                    content:
                      'Connect a DeepSeek API key in Settings to continue.',
                    createdAt: new Date().toISOString(),
                  },
                ],
                updatedAt: new Date().toISOString(),
              }
            : chat,
        ),
      );
      return;
    }

    const pendingMessage: ChatMessage = {
      id: createId('message'),
      role: 'assistant',
      content: '…',
      createdAt: new Date().toISOString(),
      vad: engine.state.emotions
        ? {
            valence: engine.state.emotions.valence,
            arousal: engine.state.emotions.arousal,
            dominance: engine.state.emotions.dominance,
          }
        : undefined,
    };
    setChats((current) =>
      current.map((chat) =>
        chat.id === targetChatId
          ? { ...chat, messages: [...chat.messages, pendingMessage] }
          : chat,
      ),
    );

    try {
      const history: DeepSeekMessage[] = nextMessages
        .slice(-6)
        .map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        }));
      const systemPrompt = engine.buildSystemPrompt(
        content,
        processed.analysis,
        processed.memories,
      );

      // L3 persona layer: prepend the compiled ≤800-token profile prompt.
      let finalSystemPrompt = systemPrompt;
      try {
        const profile = l3ProfileStore().get(agentId);
        if (profile) {
          const l1 = l1StoreFor(agentId);
          const facts = await l1.all();
          const topFacts = [...facts]
            .sort((a, b) => b.certainty - a.certainty)
            .slice(0, 3);
          const compiled = compileSystemPrompt({
            profile,
            vad: engine.state.emotions
              ? {
                  valence: engine.state.emotions.valence,
                  arousal: engine.state.emotions.arousal,
                  dominance: engine.state.emotions.dominance,
                }
              : null,
            activeL2Node: l2StoreFor(agentId).active(),
            topL1Facts: topFacts,
          });
          finalSystemPrompt = `${compiled.prompt}\n\n---\n\n${systemPrompt}`;
        }
      } catch {
        // L3 is optional; fall back to the cognitive prompt alone.
      }

      const llmResult = await providerManager().generate(
        [{ role: 'system', content: finalSystemPrompt }, ...history],
        { traits: engine.state.personality.conscious },
      );
      const response = llmResult.content;
      engine.recordAssistantReply(response);
      setCognitionState({ ...engine.state });
      l0.append('main', agentId, 'agent', response, { ...DEFAULT_PROSODY });
      const emergency = llmResult.emergency;
      if (emergency) {
        setLogs((current) => [
          ...current,
          {
            id: createId('log'),
            timestamp: Date.now(),
            message: `LLM agotó proveedores → respuesta de emergencia (${emergency.style})`,
            level: 'WARN',
          },
        ]);
      }

      // Extract fenced blocks (charts, code, tables…) into desktop windows.
      const parsed = parseArtifacts(response);
      const windows = parsed.artifacts.map((artifact, index) =>
        autoPlaceArtifact(
          artifact.window,
          targetChat.artifacts.length + index,
          targetChat.windowState.x,
          targetChat.windowState.y,
        ),
      );

      setChats((current) =>
        current.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === pendingMessage.id
                    ? { ...message, content: parsed.text }
                    : message,
                ),
                artifacts: [...chat.artifacts, ...windows],
                updatedAt: new Date().toISOString(),
              }
            : chat,
        ),
      );
    } catch (reason) {
      setChats((current) =>
        current.map((chat) =>
          chat.id === targetChatId
            ? {
                ...chat,
                messages: chat.messages.map((message) =>
                  message.id === pendingMessage.id
                    ? {
                        ...message,
                        content: `DeepSeek error: ${String(reason)}`,
                      }
                    : message,
                ),
                updatedAt: new Date().toISOString(),
              }
            : chat,
        ),
      );
    }
  };

  const runDreamCycle = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const dream = engine.forceDreamCycle();
    setCognitionState({ ...engine.state });
    setDreamStatus(
      `Dream cycle completed: ${dream.consolidatedCount} memories consolidated, ${dream.resolvedConflicts} conflicts resolved.`,
    );
  };

  const applyStimulus = (
    kind: 'positive' | 'negative' | 'intense_negative' | 'neutral',
  ) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.simulateStimulus(kind);
    setCognitionState({ ...engine.state });
  };

  const tickDecay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.tickDecay(1);
    setCognitionState({ ...engine.state });
  };

  const updateChat = (nextChat: Chat) => {
    setChats((current) =>
      current.map((chat) => (chat.id === nextChat.id ? nextChat : chat)),
    );
  };

  const handleInsertMemory = (text: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.insertMemory(text);
    setCognitionState({ ...engine.state });
  };

  const handleDecayMemory = (id: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.decayMemory(id);
    setCognitionState({ ...engine.state });
  };

  const handleRepressMemory = (id: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.repressMemory(id);
    setCognitionState({ ...engine.state });
  };

  const handleDeleteMemory = (id: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.deleteMemory(id);
    setCognitionState({ ...engine.state });
  };

  const handleSearchMemories = (query: string) => {
    const engine = engineRef.current;
    if (!engine) return [];
    return engine.searchMemories(query);
  };

  const saveDeepSeek = (nextConfig: DeepSeekConfig) => {
    const normalized = {
      apiKey: nextConfig.apiKey.trim(),
      baseUrl: nextConfig.baseUrl.trim() || DEFAULT_DEEPSEEK_CONFIG.baseUrl,
      model: nextConfig.model.trim() || DEFAULT_DEEPSEEK_CONFIG.model,
    };
    setDeepSeekConfig(normalized);
    saveDeepSeekConfig(normalized);
    setDeepSeekStatus('DeepSeek settings saved locally.');
  };

  const testDeepSeek = async (candidate: DeepSeekConfig) => {
    setDeepSeekStatus('Testing DeepSeek connection…');
    try {
      await testDeepSeekConnection(candidate);
      setDeepSeekStatus('Connection successful.');
    } catch (reason) {
      setDeepSeekStatus(`Connection failed: ${String(reason)}`);
    }
  };

  const checkForUpdates = useCallback(async () => {
    setUpdateStatus('checking');
    setUpdateError(null);
    try {
      const candidate = await check({ timeout: 15_000 });
      setUpdate(candidate);
      setUpdateStatus(candidate ? 'available' : 'up-to-date');
    } catch (reason) {
      setUpdateStatus('error');
      setUpdateError(updateErrorMessage(reason));
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!update) return;

    setUpdateStatus('installing');
    setUpdateError(null);
    setUpdateProgress(0);
    let downloaded = 0;
    let contentLength = 0;

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
          setUpdateProgress(0);
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            setUpdateProgress(
              Math.min(99, Math.round((downloaded / contentLength) * 100)),
            );
          }
        } else {
          setUpdateProgress(100);
        }
      });
      setUpdateStatus('installed');
      setUpdateProgress(100);
    } catch (reason) {
      setUpdateStatus('error');
      setUpdateError(updateErrorMessage(reason));
      setUpdateProgress(null);
    }
  }, [update]);

  useEffect(() => {
    globalThis.document.documentElement.dataset.theme = theme;
    globalThis.document.documentElement.style.colorScheme = theme;
    try {
      globalThis.localStorage.setItem('neuracore-theme', theme);
    } catch {
      // Local storage can be unavailable in restricted desktop environments.
    }
  }, [theme]);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  useEffect(() => {
    const unlisten = listen<LogEntry>('engine-log', (event) => {
      setLogs((current) => [...current, event.payload].slice(-500));
    });

    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    const configPath = readSavedConfigPath();
    if (!configPath) {
      setConfigLoading(false);
      return;
    }

    void invoke<string>('read_project_config', { configPath })
      .then((contents) => {
        const parsed: unknown = JSON.parse(contents);
        if (!isProjectConfig(parsed))
          throw new Error('Invalid project configuration');
        setProjectConfig(parsed);
      })
      .catch(() => {
        try {
          globalThis.localStorage.removeItem(CONFIG_PATH_KEY);
        } catch {
          // Continue to onboarding when local storage is unavailable.
        }
      })
      .finally(() => setConfigLoading(false));
  }, []);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  const toggleTheme = () =>
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));

  if (configLoading) return <StartupScreen />;
  if (!projectConfig) return <OnboardingWizard onComplete={setProjectConfig} />;

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}
    >
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand-row">
          <NavLink className="brand" to="/" aria-label="Go to Dashboard">
            <Logo />
            <span className="sidebar-label">
              <strong>Neura-Core</strong>
              <small>COGNITIVE ENGINE</small>
            </span>
          </NavLink>
          <button
            className="icon-button sidebar-collapse"
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={
              sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'
            }
            title={
              sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'
            }
          >
            <Icon name="collapse" />
          </button>
        </div>
        <div className="sidebar-section">
          <span className="sidebar-section-title sidebar-label">WORKSPACE</span>
          <nav className="nav-list">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'active' : ''}`
                }
                to={item.path}
                end={item.path === '/'}
                title={item.label}
              >
                <Icon name={item.icon} />
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <button className="theme-toggle" type="button" onClick={toggleTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            <span className="sidebar-label">
              {theme === 'dark' ? 'Light theme' : 'Dark theme'}
            </span>
          </button>
          <div className="version-block sidebar-label">
            <span>NEURA-CORE</span>
            <strong>{VERSION}</strong>
          </div>
        </div>
      </aside>
      <button
        className="sidebar-backdrop"
        type="button"
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
      />
      <div className="shell-main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            <span>Neura-Core</span>
            <b>/</b>
            <strong>{currentItem.label}</strong>
          </div>
          <div className="topbar-status">
            <span className="status-dot" /> LOCAL DESKTOP
          </div>
        </header>
        <UpdateBanner
          update={update}
          status={updateStatus}
          progress={updateProgress}
          onInstall={installUpdate}
        />
        <main className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <DashboardPage
                  config={projectConfig}
                  cognition={cognitionState}
                  deepSeekConfigured={Boolean(deepSeekConfig.apiKey.trim())}
                />
              }
            />
            <Route
              path="/chats"
              element={
                <ChatsPage
                  chats={chats}
                  activeChatId={activeChatId}
                  deepSeekConfigured={Boolean(deepSeekConfig.apiKey.trim())}
                  cognition={cognitionState}
                  agentId={projectConfig.agentName}
                  onNewChat={createNewChat}
                  onSelectChat={setActiveChatId}
                  onSend={(content) => void sendChatMessage(content)}
                  onUpdateChat={updateChat}
                />
              }
            />
            <Route
              path="/memory"
              element={
                <MemoryPage
                  cognition={cognitionState}
                  onRunDream={runDreamCycle}
                  dreamStatus={dreamStatus}
                  onInsertMemory={handleInsertMemory}
                  onDecayMemory={handleDecayMemory}
                  onRepressMemory={handleRepressMemory}
                  onDeleteMemory={handleDeleteMemory}
                  onSearch={handleSearchMemories}
                  agentId={projectConfig.agentName}
                  deepSeekConfig={deepSeekConfig}
                />
              }
            />
            <Route
              path="/affect-engine"
              element={
                <AffectEnginePage
                  cognition={cognitionState}
                  onStimulus={applyStimulus}
                  onTick={tickDecay}
                />
              }
            />
            <Route
              path="/live"
              element={
                <LiveSessionPage
                  agentId={projectConfig.agentName}
                  deepSeekConfig={deepSeekConfig}
                />
              }
            />
            <Route
              path="/logs"
              element={<LogsPage logs={logs} onClear={() => setLogs([])} />}
            />
            <Route
              path="/updates"
              element={
                <UpdatesPage
                  update={update}
                  status={updateStatus}
                  error={updateError}
                  progress={updateProgress}
                  onCheck={checkForUpdates}
                  onInstall={installUpdate}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  theme={theme}
                  onThemeChange={toggleTheme}
                  config={projectConfig}
                  deepSeekConfig={deepSeekConfig}
                  deepSeekStatus={deepSeekStatus}
                  onSaveDeepSeek={saveDeepSeek}
                  onTestDeepSeek={(config) => void testDeepSeek(config)}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <LauncherShell />
    </HashRouter>
  );
}
