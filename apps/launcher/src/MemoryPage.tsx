import { useMemo, useState, type FormEvent } from 'react';
import MemoryGraph from './MemoryGraph';
import type { CognitiveState, DreamLog, MemoryUnit } from './cognition/types';
import { EMOTION_COLORS } from './cognition/types';
import { emotionOfMemory } from './cognition/memory';
import type { RetrievedMemory } from './cognition/memory';

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function strengthPercent(memory: MemoryUnit) {
  return Math.round(memory.strength * 100);
}

function MemoryRow({
  memory,
  onDecay,
  onRepress,
  onDelete,
}: {
  memory: MemoryUnit;
  onDecay: (id: string) => void;
  onRepress: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const emotion = emotionOfMemory(memory);
  return (
    <div className={`memory-row ${memory.isRepressed ? 'repressed' : ''}`}>
      <div className="memory-row-main">
        <span
          className="memory-emotion-dot"
          style={{ background: EMOTION_COLORS[emotion] }}
          title={emotion}
          aria-hidden="true"
        />
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
        <span>
          {formatTime(memory.createdAt)} · fuerza {strengthPercent(memory)}% ·
          accesos {memory.accessCount}
        </span>
        <div className="cognitive-bar memory-bar" aria-hidden="true">
          <span style={{ width: `${strengthPercent(memory)}%` }} />
        </div>
        <div className="memory-row-actions">
          <button
            type="button"
            className="memory-action"
            title="Debilitar el recuerdo (olvido acelerado)"
            onClick={() => onDecay(memory.id)}
          >
            Decay
          </button>
          <button
            type="button"
            className="memory-action"
            title="Reprimir: mover al subconsciente sin borrarlo"
            onClick={() => onRepress(memory.id)}
          >
            Repress
          </button>
          <button
            type="button"
            className="memory-action memory-action-danger"
            title="Eliminar de todas las capas"
            onClick={() => {
              if (
                window.confirm(
                  'Eliminar este recuerdo de todas las capas de memoria?',
                )
              ) {
                onDelete(memory.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchPanel({
  onSearch,
  onDecay,
  onRepress,
  onDelete,
}: {
  onSearch: (query: string) => RetrievedMemory[];
  onDecay: (id: string) => void;
  onRepress: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(
    () => (query.trim() ? onSearch(query) : []),
    [query, onSearch],
  );

  return (
    <div className="memory-search">
      <div className="cognitive-section-heading">
        <span className="section-kicker">BÚSQUEDA SEMÁNTICA</span>
        <span className="panel-caption">{results.length} RESULTADOS</span>
      </div>
      <input
        className="memory-search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Explora la memoria del agente…"
        aria-label="Buscar en la memoria"
      />
      {query.trim() ? (
        results.length ? (
          <div className="memory-search-results">
            {results.map((memory) => {
              const emotion = emotionOfMemory(memory);
              return (
                <div className="memory-search-item" key={memory.id}>
                  <span
                    className="memory-emotion-dot"
                    style={{ background: EMOTION_COLORS[emotion] }}
                    aria-hidden="true"
                  />
                  <div className="memory-search-item-main">
                    <p>{memory.content}</p>
                    <small>
                      relevancia {Math.round(memory.score * 100)}% · fuerza{' '}
                      {strengthPercent(memory)}%
                      {memory.isRepressed ? ' · reprimido' : ''}
                    </small>
                  </div>
                  <div className="memory-row-actions">
                    <button
                      type="button"
                      className="memory-action"
                      onClick={() => onDecay(memory.id)}
                    >
                      Decay
                    </button>
                    <button
                      type="button"
                      className="memory-action"
                      onClick={() => onRepress(memory.id)}
                    >
                      Repress
                    </button>
                    <button
                      type="button"
                      className="memory-action memory-action-danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Eliminar este recuerdo de todas las capas?',
                          )
                        ) {
                          onDelete(memory.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="memory-search-empty">Sin coincidencias.</p>
        )
      ) : (
        <p className="memory-search-empty">
          Busca por temas o palabras clave. La relevancia combina similitud
          semántica (keywords) con la fuerza actual del recuerdo (Ebbinghaus).
        </p>
      )}
    </div>
  );
}

function InsertMemoryForm({ onInsert }: { onInsert: (text: string) => void }) {
  const [draft, setDraft] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    onInsert(content);
    setDraft('');
  };
  return (
    <form className="memory-insert" onSubmit={submit}>
      <div className="cognitive-section-heading">
        <span className="section-kicker">INSERTAR MEMORIA</span>
        <span className="panel-caption">L0 → L1</span>
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Escribe el recuerdo que Neura debe conservar…"
        rows={2}
      />
      <button className="button-primary" type="submit" disabled={!draft.trim()}>
        Insertar memoria
      </button>
    </form>
  );
}

function MemoryTable({
  units,
  onDecay,
  onRepress,
  onDelete,
}: {
  units: MemoryUnit[];
  onDecay: (id: string) => void;
  onRepress: (id: string) => void;
  onDelete: (id: string) => void;
}) {
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
    .slice(0, 60);
  return (
    <div className="memory-table" role="table" aria-label="Memory units">
      {sorted.map((memory) => (
        <MemoryRow
          key={memory.id}
          memory={memory}
          onDecay={onDecay}
          onRepress={onRepress}
          onDelete={onDelete}
        />
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

function RepressedList({
  units,
  onDelete,
}: {
  units: MemoryUnit[];
  onDelete: (id: string) => void;
}) {
  const repressed = units.filter((unit) => unit.isRepressed);
  return (
    <div className="repressed-block">
      <div className="cognitive-section-heading">
        <span className="section-kicker">REPRIMIDAS (FREUD)</span>
        <span className="panel-caption">
          {repressed.length} EN EL SUBCONSCIENTE
        </span>
      </div>
      {repressed.length ? (
        <div className="repressed-list">
          {repressed.map((memory) => (
            <div className="repressed-item" key={memory.id}>
              <p>{memory.content.slice(0, 90)}</p>
              <small>
                fuerza de represión{' '}
                {Math.round(memory.repressionStrength * 100)}% ·{' '}
                <button
                  type="button"
                  className="memory-action memory-action-danger"
                  onClick={() => onDelete(memory.id)}
                >
                  eliminar
                </button>
              </small>
            </div>
          ))}
        </div>
      ) : (
        <p className="memory-table-empty">
          Ningún recuerdo reprimido por ahora. La represión emerge ante
          experiencias de valencia muy negativa y alto arousal.
        </p>
      )}
    </div>
  );
}

export default function MemoryPage({
  cognition,
  onRunDream,
  dreamStatus,
  onInsertMemory,
  onDecayMemory,
  onRepressMemory,
  onDeleteMemory,
  onSearch,
}: {
  cognition: CognitiveState | null;
  onRunDream: () => void;
  dreamStatus: string;
  onInsertMemory: (text: string) => void;
  onDecayMemory: (id: string) => void;
  onRepressMemory: (id: string) => void;
  onDeleteMemory: (id: string) => void;
  onSearch: (query: string) => RetrievedMemory[];
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

  const handleDecay = (id: string) => onDecayMemory(id);
  const handleRepress = (id: string) => onRepressMemory(id);
  const handleDelete = (id: string) => onDeleteMemory(id);

  return (
    <section className="page" aria-labelledby="memory-page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MEMORY SYSTEM</p>
          <h2 id="memory-page-title">Memory</h2>
          <p className="page-description">
            Grafo de conexiones, búsqueda semántica y edición por capas:
            debilitar, reprimir o eliminar recuerdos.
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
        <article className="surface memory-card memory-card-graph">
          <div className="surface-header">
            <div>
              <span className="section-kicker">MEMORY GRAPH</span>
              <h3>Conexiones de la memoria</h3>
            </div>
            <span className="surface-badge">
              TAMAÑO = IMPORTANCIA · COLOR = EMOCIÓN
            </span>
          </div>
          {cognition ? <MemoryGraph units={cognition.memory.units} /> : null}
        </article>

        <article className="surface memory-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">BÚSQUEDA Y EDICIÓN</span>
              <h3>Explorar la memoria</h3>
            </div>
            <span className="surface-badge">CAPAS</span>
          </div>
          {cognition ? (
            <>
              <SearchPanel
                onSearch={onSearch}
                onDecay={handleDecay}
                onRepress={handleRepress}
                onDelete={handleDelete}
              />
              <InsertMemoryForm onInsert={onInsertMemory} />
            </>
          ) : null}
        </article>
      </div>

      <div className="memory-layout">
        <article className="surface memory-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">L0 → L1 · LOGS</span>
              <h3>Memorias</h3>
            </div>
            <span className="surface-badge">LOCAL</span>
          </div>
          {cognition ? (
            <>
              <div className="working-memory">
                <div className="cognitive-section-heading">
                  <span className="section-kicker">MEMORIA DE TRABAJO</span>
                  <span className="panel-caption">7 ± 2 (MILLER)</span>
                </div>
                {cognition.memory.workingMemory.length ? (
                  <div className="working-memory-chips">
                    {cognition.memory.workingMemory.map((id) => {
                      const unit = cognition.memory.units.find(
                        (m) => m.id === id,
                      );
                      return unit ? (
                        <span
                          className="working-chip"
                          key={id}
                          title={unit.content}
                        >
                          {unit.content.slice(0, 34)}…
                        </span>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <p className="memory-table-empty">Sin ítems activos.</p>
                )}
              </div>
              <MemoryTable
                units={cognition.memory.units}
                onDecay={handleDecay}
                onRepress={handleRepress}
                onDelete={handleDelete}
              />
            </>
          ) : null}
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
          {cognition ? (
            <RepressedList
              units={cognition.memory.units}
              onDelete={handleDelete}
            />
          ) : null}
        </article>
      </div>
    </section>
  );
}
