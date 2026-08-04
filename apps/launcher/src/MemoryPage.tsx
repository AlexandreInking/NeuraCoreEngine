import type { CognitiveState, DreamLog, MemoryUnit } from './cognition/types';

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function strengthPercent(memory: MemoryUnit) {
  return Math.round(memory.strength * 100);
}

function MemoryTable({ units }: { units: MemoryUnit[] }) {
  if (!units.length) {
    return (
      <div className="memory-table-empty">
        <strong>Sin memorias todavía</strong>
        <span>Envía mensajes en Chats para que Neura empiece a recordar.</span>
      </div>
    );
  }

  const sorted = [...units]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);
  return (
    <div className="memory-table" role="table" aria-label="Memory units">
      {sorted.map((memory) => (
        <div
          className={`memory-row ${memory.isRepressed ? 'repressed' : ''}`}
          key={memory.id}
        >
          <div className="memory-row-main">
            <span className={`memory-badge badge-${memory.speaker}`}>
              {memory.speaker === 'user' ? 'USER' : 'CORE'}
            </span>
            <p>{memory.content}</p>
            {memory.isRepressed ? (
              <span className="memory-repressed" title="Recuerdo reprimido">
                REPRIMIDA
              </span>
            ) : null}
          </div>
          <div className="memory-row-meta">
            <span>{formatTime(memory.createdAt)}</span>
            <span>
              fuerza {strengthPercent(memory)}% · accesos {memory.accessCount}
            </span>
            <div className="cognitive-bar memory-bar" aria-hidden="true">
              <span style={{ width: `${strengthPercent(memory)}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DreamLogs({ logs }: { logs: DreamLog[] }) {
  if (!logs.length) {
    return (
      <p className="dream-empty">
        Aún no hay ciclos de sueño. Los sueños consolidan memorias y resuelven
        conflictos internos mientras Neura reposa.
      </p>
    );
  }
  const recent = [...logs].reverse().slice(0, 5);
  return (
    <div className="dream-log-list">
      {recent.map((dream) => (
        <div className="dream-log" key={dream.id}>
          <div className="dream-log-head">
            <strong>{formatTime(dream.timestamp)}</strong>
            <span>
              {dream.consolidatedCount} consolidadas · {dream.resolvedConflicts}{' '}
              conflictos
            </span>
          </div>
          <ul>
            {dream.insights.map((insight, index) => (
              <li key={index}>{insight}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function MemoryPage({
  cognition,
  onRunDream,
  dreamStatus,
}: {
  cognition: CognitiveState | null;
  onRunDream: () => void;
  dreamStatus: string;
}) {
  const summary = cognition
    ? {
        total: cognition.memory.units.length,
        repressed: cognition.memory.units.filter((unit) => unit.isRepressed)
          .length,
        avgStrength: cognition.memory.units.length
          ? Math.round(
              (cognition.memory.units.reduce(
                (sum, unit) => sum + unit.strength,
                0,
              ) /
                cognition.memory.units.length) *
                100,
            )
          : 0,
        dreams: cognition.memory.dreamLogs.length,
        lastDreamAt: cognition.memory.lastDreamAt,
      }
    : null;

  return (
    <section className="page" aria-labelledby="memory-page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MEMORY SYSTEM</p>
          <h2 id="memory-page-title">Memory</h2>
          <p className="page-description">
            Recuerdos con curva de olvido (Ebbinghaus), represión freudiana y
            consolidación onírica.
          </p>
        </div>
        <span className="page-version">v0.1.0-alpha</span>
      </div>

      <div className="memory-toolbar">
        <div>
          <span className="section-kicker">FOUR-TIER MEMORY ENGINE</span>
          <p className="memory-toolbar-note" role="status">
            {dreamStatus}
          </p>
        </div>
        <button
          className="button-primary"
          type="button"
          onClick={onRunDream}
          disabled={!cognition}
        >
          Dream cycle
        </button>
      </div>

      <div className="metric-grid memory-metric-grid">
        <article className="metric-card">
          <span className="metric-label">MEMORY UNITS</span>
          <strong>{summary?.total ?? '—'}</strong>
          <span className="metric-note">Episódicas + semánticas</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">REPRESSED</span>
          <strong>{summary?.repressed ?? '—'}</strong>
          <span className="metric-note">Subconsciente (Freud)</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">AVG STRENGTH</span>
          <strong>{summary ? `${summary.avgStrength}%` : '—'}</strong>
          <span className="metric-note">Retención Ebbinghaus</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">DREAM CYCLES</span>
          <strong>{summary?.dreams ?? '—'}</strong>
          <span className="metric-note">
            {summary?.lastDreamAt
              ? `Último: ${formatTime(summary.lastDreamAt)}`
              : 'Sin sueños aún'}
          </span>
        </article>
      </div>

      <div className="memory-layout">
        <article className="surface memory-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">L0 → L1</span>
              <h3>Memorias</h3>
            </div>
            <span className="surface-badge">LOCAL</span>
          </div>
          {cognition ? <MemoryTable units={cognition.memory.units} /> : null}
        </article>
        <article className="surface memory-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">CONSOLIDACIÓN</span>
              <h3>Sueños</h3>
            </div>
            <span className="surface-badge">JUNG / FREUD</span>
          </div>
          {cognition ? <DreamLogs logs={cognition.memory.dreamLogs} /> : null}
        </article>
      </div>
    </section>
  );
}
