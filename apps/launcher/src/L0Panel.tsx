import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DEFAULT_L0_CONFIG, DEFAULT_PROSODY, l0StoreFor } from './l0';
import type { L0Config, L0Entry, L0Prosody } from './l0';

function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function formatTtl(expiresAt: number, now: number) {
  const remaining = expiresAt - now;
  if (remaining <= 0) return 'EXPIRADO';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

function ProsodyGauge({
  label,
  value,
  min,
  max,
  unit,
  low,
  mid,
  high,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  low: string;
  mid: string;
  high: string;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className="prosody-gauge">
      <div className="prosody-gauge-head">
        <span>{label}</span>
        <strong>
          {value.toFixed(1)} {unit}
        </strong>
      </div>
      <div className="prosody-gauge-track" aria-hidden="true">
        <span
          className="prosody-gauge-fill"
          style={{
            width: `${Math.max(0, Math.min(100, percent))}%`,
            background: `linear-gradient(90deg, ${low}, ${mid} 50%, ${high})`,
          }}
        />
      </div>
      <div className="prosody-gauge-scale" aria-hidden="true">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function FeedEntry({
  entry,
  defaultOpen,
}: {
  entry: L0Entry;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`l0-feed-entry ${entry.speaker === 'agent' ? 'agent' : ''}`}
    >
      <button
        type="button"
        className="l0-feed-entry-head"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="l0-feed-time">{formatClock(entry.timestamp)}</span>
        <span className={`l0-feed-speaker ${entry.speaker}`}>
          {entry.speaker === 'user' ? 'USER' : 'AGENT'}
        </span>
        <span className="l0-feed-text">{entry.text}</span>
      </button>
      {open ? (
        <pre className="l0-feed-raw">
          <code>{JSON.stringify(entry.raw, null, 2)}</code>
        </pre>
      ) : null}
    </div>
  );
}

export default function L0Panel({ agentId }: { agentId: string }) {
  const storeRef = useRef(l0StoreFor(agentId));
  const store = storeRef.current;
  const [tick, setTick] = useState(0);
  const [sessionId, setSessionId] = useState('main');
  const [name, setName] = useState(agentId);
  const [speaker, setSpeaker] = useState<'user' | 'agent'>('user');
  const [text, setText] = useState('');
  const [prosody, setProsody] = useState<L0Prosody>({ ...DEFAULT_PROSODY });
  const [paused, setPaused] = useState(false);
  const [autoSim, setAutoSim] = useState(false);
  const [config, setConfig] = useState<L0Config>(() =>
    store.config ? { ...store.config } : { ...DEFAULT_L0_CONFIG },
  );
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  // Live feed refresh (1s tick); simulates a Redis consumer polling.
  useEffect(() => {
    const interval = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Automatic prosody simulation (hito 2.4).
  useEffect(() => {
    if (!autoSim) return;
    const interval = window.setInterval(() => {
      setProsody({
        pitch: 60 + Math.random() * 340,
        energy: -30 + Math.random() * 30,
        speechRate: Math.random() * 10,
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [autoSim]);

  const sessions = useMemo(() => {
    store.cleanup();
    return store.sessions();
  }, [store, tick]);

  const entries = useMemo(
    () => store.read(sessionId),
    [store, sessionId, paused, tick],
  );

  const now = Date.now();
  const bufferCount = entries.length;

  const updateConfig = (patch: Partial<L0Config>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    store.config = next;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = text.trim();
    if (!content) return;
    store.append(sessionId, name, speaker, content, { ...prosody });
    setText('');
  };

  const flush = () => {
    store.flush(sessionId);
    setLastSummary(`Buffer limpiado (${bufferCount} entradas descartadas).`);
  };

  const exportJson = () => {
    const data = {
      session: sessionId,
      name,
      exportedAt: new Date().toISOString(),
      entries,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `prosodia_session_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setLastSummary(`Exportadas ${entries.length} entradas a JSON.`);
  };

  const closeSession = (id: string) => {
    const summary = store.closeSession(id);
    setLastSummary(
      `Sesión "${summary.name}" cerrada: ${summary.totalEntries} entradas, ${summary.durationMinutes} min.`,
    );
    if (id === sessionId) setSessionId('main');
  };

  return (
    <div className="l0-panel">
      <div className="l0-status">
        <span className="surface-badge cognitive-live">● L0 LOCAL READY</span>
        <span className="l0-status-note">
          Buffer circular MAXLEN {store.config.bufferSize} · TTL{' '}
          {store.config.ttlHours}h · ping local 5s · Redis adapter disponible en
          futuros hitos
        </span>
      </div>

      <div className="memory-layout">
        <article className="surface memory-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">L0 · ESCRIBIR</span>
              <h3>Raw Logs</h3>
            </div>
            <span className="surface-badge">
              BUFFER {bufferCount} / {store.config.bufferSize}
            </span>
          </div>

          <form className="l0-form" onSubmit={submit}>
            <label className="field">
              <span>Session</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nombre de sesión"
              />
            </label>
            <div className="l0-form-row">
              <label className="field">
                <span>Speaker</span>
                <select
                  value={speaker}
                  onChange={(event) =>
                    setSpeaker(event.target.value as 'user' | 'agent')
                  }
                >
                  <option value="user">USER</option>
                  <option value="agent">AGENT</option>
                </select>
              </label>
              <label className="field l0-field-grow">
                <span>Texto</span>
                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Registrar entrada en el buffer…"
                />
              </label>
            </div>
            <div className="l0-form-row">
              <button
                className="button-primary"
                type="submit"
                disabled={!text.trim()}
              >
                Enviar al Buffer
              </button>
              <button className="button-ghost" type="button" onClick={flush}>
                Flush Buffer
              </button>
              <button
                className="button-ghost"
                type="button"
                onClick={exportJson}
              >
                Exportar JSON
              </button>
            </div>
          </form>

          <div className="l0-prosody">
            <div className="cognitive-section-heading">
              <span className="section-kicker">PROSODIA (SIMULACIÓN)</span>
              <label className="l0-sim-toggle">
                <input
                  type="checkbox"
                  checked={autoSim}
                  onChange={(event) => setAutoSim(event.target.checked)}
                />
                Auto-sim 500ms
              </label>
            </div>
            <div className="prosody-grid">
              <ProsodyGauge
                label="Pitch"
                value={prosody.pitch}
                min={60}
                max={400}
                unit="Hz"
                low="#dc2626"
                mid="#f59e0b"
                high="#10b981"
              />
              <ProsodyGauge
                label="Energy"
                value={prosody.energy}
                min={-30}
                max={0}
                unit="dB"
                low="#3b82f6"
                mid="#70a1ff"
                high="#10b981"
              />
              <ProsodyGauge
                label="Speech Rate"
                value={prosody.speechRate}
                min={0}
                max={10}
                unit="syl/s"
                low="#a855f7"
                mid="#f59e0b"
                high="#dc2626"
              />
            </div>
            <div className="prosody-sliders">
              <label className="field">
                <span>Pitch {Math.round(prosody.pitch)} Hz</span>
                <input
                  type="range"
                  min={60}
                  max={400}
                  value={Math.round(prosody.pitch)}
                  onChange={(event) =>
                    setProsody((current) => ({
                      ...current,
                      pitch: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Energy {prosody.energy.toFixed(1)} dB</span>
                <input
                  type="range"
                  min={-30}
                  max={0}
                  step={0.5}
                  value={prosody.energy}
                  onChange={(event) =>
                    setProsody((current) => ({
                      ...current,
                      energy: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Speech Rate {prosody.speechRate.toFixed(1)} syl/s</span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.1}
                  value={prosody.speechRate}
                  onChange={(event) =>
                    setProsody((current) => ({
                      ...current,
                      speechRate: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
          </div>
        </article>

        <article className="surface memory-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">L0 · FEED</span>
              <h3>Stream en vivo</h3>
            </div>
            <button
              className="button-ghost"
              type="button"
              onClick={() => setPaused((current) => !current)}
            >
              {paused ? 'Reanudar' : 'Pausar'}
            </button>
          </div>
          <div className="l0-feed">
            {entries.length ? (
              [...entries]
                .slice()
                .reverse()
                .slice(0, 40)
                .map((entry, index) => (
                  <FeedEntry
                    key={entry.id}
                    entry={entry}
                    defaultOpen={index === 0}
                  />
                ))
            ) : (
              <p className="memory-table-empty">
                El feed está vacío. Escribe en Raw Logs o usa Chats para
                registrar entradas.
              </p>
            )}
          </div>
        </article>
      </div>

      <div className="memory-layout">
        <article className="surface memory-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">L0 · SESIONES ACTIVAS</span>
              <h3>TTL &amp; Streams</h3>
            </div>
            <span className="surface-badge">
              {sessions.length} ACTIVAS · CONFIG: MAXLEN {config.bufferSize} ·
              TTL {config.ttlHours}h
            </span>
          </div>
          {sessions.length ? (
            <div className="l0-session-list">
              {sessions.map((session) => {
                const ttlRemaining = session.expiresAt - now;
                const expiring = ttlRemaining < 3_600_000;
                return (
                  <div
                    className={`l0-session ${expiring ? 'expiring' : ''}`}
                    key={session.id}
                  >
                    <div className="l0-session-main">
                      <strong>{session.name}</strong>
                      <span>
                        {session.entries.length} entradas · creada{' '}
                        {formatClock(session.createdAt)} · TTL{' '}
                        <b>{formatTtl(session.expiresAt, now)}</b>
                        {expiring ? ' ⚠' : ''}
                      </span>
                    </div>
                    <div className="l0-session-actions">
                      <button
                        className="memory-action"
                        type="button"
                        onClick={() => setSessionId(session.id)}
                      >
                        Ver
                      </button>
                      <button
                        className="memory-action memory-action-danger"
                        type="button"
                        onClick={() => closeSession(session.id)}
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="memory-table-empty">No hay sesiones activas.</p>
          )}
          <div className="l0-config">
            <div className="cognitive-section-heading">
              <span className="section-kicker">CONFIGURACIÓN DEL BUFFER</span>
              <span className="panel-caption">LOCAL-FIRST</span>
            </div>
            <div className="l0-config-fields">
              <label className="field">
                <span>Buffer MAXLEN</span>
                <input
                  type="number"
                  min={10}
                  max={10000}
                  value={config.bufferSize}
                  onChange={(event) =>
                    updateConfig({
                      bufferSize: Number(event.target.value) || 200,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>TTL (horas)</span>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={config.ttlHours}
                  onChange={(event) =>
                    updateConfig({ ttlHours: Number(event.target.value) || 24 })
                  }
                />
              </label>
            </div>
          </div>
          {lastSummary ? (
            <p className="l0-summary" role="status">
              {lastSummary}
            </p>
          ) : null}
        </article>
      </div>
    </div>
  );
}
