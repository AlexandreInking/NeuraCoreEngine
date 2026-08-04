import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeepSeekConfig } from './cognition/deepseek';
import {
  embedTexts,
  EMBEDDING_DIMENSION,
  embeddingStatus,
} from './l1/embedder';
import { extractSpo, type SpoTriplet } from './l1/extractor';
import { l1StoreFor, type L1Store } from './l1/store';
import { l1WorkerFor, type L1AutoWorker } from './l1/worker';
import {
  DEFAULT_L1_CONFIG,
  type L1Fact,
  type L1SearchResult,
} from './l1/types';

function formatAge(hours: number) {
  if (hours < 1) return `hace ${Math.max(1, Math.round(hours * 60))}min`;
  if (hours < 24) return `hace ${Math.round(hours)}h`;
  return `hace ${Math.round(hours / 24)}d`;
}

function TripletEditor({
  triplets,
  onTriplets,
}: {
  triplets: SpoTriplet[];
  onTriplets: (next: SpoTriplet[]) => void;
}) {
  return (
    <div className="l1-triplets" role="table" aria-label="SPO triplets">
      {triplets.map((triplet, index) => (
        <div className="l1-triplet" key={index}>
          <input
            value={triplet.subject}
            aria-label={`Tripleta ${index + 1} sujeto`}
            onChange={(event) => {
              const next = [...triplets];
              next[index] = { ...triplet, subject: event.target.value };
              onTriplets(next);
            }}
          />
          <input
            value={triplet.predicate}
            aria-label={`Tripleta ${index + 1} predicado`}
            onChange={(event) => {
              const next = [...triplets];
              next[index] = { ...triplet, predicate: event.target.value };
              onTriplets(next);
            }}
          />
          <input
            value={triplet.object}
            aria-label={`Tripleta ${index + 1} objeto`}
            onChange={(event) => {
              const next = [...triplets];
              next[index] = { ...triplet, object: event.target.value };
              onTriplets(next);
            }}
          />
          <span
            className={`l1-certainty ${triplet.certainty >= 0.75 ? 'high' : ''}`}
          >
            {Math.round(triplet.certainty * 100)}%
          </span>
          <button
            type="button"
            className="memory-action memory-action-danger"
            aria-label={`Eliminar tripleta ${index + 1}`}
            onClick={() => onTriplets(triplets.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function SearchResults({ results }: { results: L1SearchResult[] }) {
  if (!results.length) {
    return <p className="memory-search-empty">Sin hechos relevantes.</p>;
  }
  return (
    <div className="l1-search-results">
      {results.map((result) => (
        <div className="l1-search-item" key={result.fact.id}>
          <div className="l1-search-item-main">
            <p>
              <strong>{result.fact.subject}</strong> {result.fact.predicate}{' '}
              <strong>{result.fact.object}</strong>
            </p>
            <small>
              certeza {Math.round(result.fact.certainty * 100)}% · score{' '}
              {result.score.toFixed(3)} · cosine {result.cosine.toFixed(3)} ·{' '}
              {formatAge(result.ageHours)} · accesos {result.fact.accessCount}
            </small>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function L1Panel({
  agentId,
  deepSeekConfig,
}: {
  agentId: string;
  deepSeekConfig: DeepSeekConfig;
}) {
  const store: L1Store = useMemo(() => l1StoreFor(agentId), [agentId]);
  const workerRef = useRef<L1AutoWorker | null>(null);
  const [, setTick] = useState(0);
  const refresh = () => setTick((value) => value + 1);

  const [embedText, setEmbedText] = useState('');
  const [embeddingPreview, setEmbeddingPreview] = useState<number[] | null>(
    null,
  );
  const [embeddingError, setEmbeddingError] = useState('');

  const [spoText, setSpoText] = useState('');
  const [spoBusy, setSpoBusy] = useState(false);
  const [spoSource, setSpoSource] = useState('');
  const [triplets, setTriplets] = useState<SpoTriplet[]>([]);
  const [filterThreshold, setFilterThreshold] = useState(true);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<L1SearchResult[] | null>(
    null,
  );
  const [searchBusy, setSearchBusy] = useState(false);

  const [lambda, setLambda] = useState(store.config.lambda);
  const [autoOn, setAutoOn] = useState(store.config.autoExtract);
  const [pending, setPending] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  const embedding = embeddingStatus();

  useEffect(() => {
    const worker = l1WorkerFor(
      agentId,
      store.config.batchSize || DEFAULT_L1_CONFIG.batchSize,
    );
    workerRef.current = worker;
    if (store.config.autoExtract) {
      worker.start();
      setAutoOn(true);
    }
    setPending(worker.pendingCount());
    setLogs(worker.logs());
    const timer = setInterval(() => {
      setPending(worker.pendingCount());
      setLogs(worker.logs());
    }, 2000);
    return () => clearInterval(timer);
  }, [agentId]);

  const generateEmbedding = async () => {
    const text = embedText.trim();
    if (!text) return;
    setEmbeddingError('');
    setEmbeddingPreview(null);
    const vectors = await embedTexts([text]);
    if (!vectors) {
      setEmbeddingError(
        'No se pudo generar el embedding. Revisa la conexión para descargar el modelo local (primera vez).',
      );
      return;
    }
    setEmbeddingPreview(Array.from(vectors[0]));
  };

  const runExtraction = async () => {
    const text = spoText.trim();
    if (!text) return;
    setSpoBusy(true);
    setSpoSource(text);
    const { triplets: extracted, fromModel } = await extractSpo(
      text,
      deepSeekConfig,
    );
    setTriplets(extracted);
    setSpoBusy(false);
    setSpoSource(
      `${fromModel ? 'LLM (DeepSeek)' : 'Heurístico local'} · ${extracted.length} tripletas`,
    );
  };

  const visibleTriplets = useMemo(
    () =>
      filterThreshold
        ? triplets.filter((triplet) => triplet.certainty >= 0.75)
        : triplets,
    [triplets, filterThreshold],
  );

  const indexTriplets = async () => {
    const selected = visibleTriplets;
    if (!selected.length) return;
    const vectors = await embedTexts(
      selected.map((t) => `${t.subject} ${t.predicate} ${t.object}`),
    );
    if (!vectors) return;
    selected.forEach((triplet, index) => {
      const fact: L1Fact = {
        id: `fact-${Date.now()}-${index}`,
        subject: triplet.subject,
        predicate: triplet.predicate,
        object: triplet.object,
        certainty: triplet.certainty,
        embedding: Array.from(vectors[index]),
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
        fromModel: spoSource.startsWith('LLM'),
      };
      store.upsert(fact);
    });
    setTriplets([]);
    setSpoText('');
    setSpoSource('');
    refresh();
  };

  const runSearch = async () => {
    const text = query.trim();
    if (!text) return;
    setSearchBusy(true);
    const vectors = await embedTexts([text]);
    setSearchBusy(false);
    if (!vectors) return;
    setSearchResults(store.search(Array.from(vectors[0]), 5, lambda));
    refresh();
  };

  const toggleAuto = (next: boolean) => {
    store.config = { ...store.config, autoExtract: next };
    setAutoOn(next);
    if (next) {
      workerRef.current?.start();
      void workerRef.current?.drain();
    } else {
      workerRef.current?.stop();
    }
    refresh();
  };

  const facts = store.all();
  const embeddingReady = embedding.state === 'ready';

  return (
    <div className="l1-panel">
      <div className="surface-header">
        <div>
          <span className="section-kicker">L1 · ATOMIC FACTS INDEX</span>
          <h3>Hechos vectoriales</h3>
        </div>
        <span
          className={`surface-badge ${embeddingReady ? 'surface-badge-ready' : ''}`}
        >
          {embedding.state === 'ready'
            ? `EMBEDDINGS ${EMBEDDING_DIMENSION}D`
            : embedding.state === 'loading'
              ? 'CARGANDO MODELO…'
              : embedding.state === 'error'
                ? 'EMBEDDING ERROR'
                : 'MODELO LOCAL'}
        </span>
      </div>
      {embedding.state === 'error' ? (
        <p className="l1-error" role="alert">
          {embedding.message}
        </p>
      ) : null}

      <div className="metric-grid l1-metric-grid">
        <article className="metric-card">
          <span className="metric-label">FACTS INDEXED</span>
          <strong>{facts.length}</strong>
          <span className="metric-note">Tripletas SPO vectorizadas</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">DIMENSIÓN</span>
          <strong>{EMBEDDING_DIMENSION}</strong>
          <span className="metric-note">all-MiniLM-L6-v2 (local)</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">DECAY λ</span>
          <strong>{lambda.toFixed(2)}</strong>
          <span className="metric-note">Score = cos · e^(−λ·Δt)</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">PENDIENTES L0</span>
          <strong>{pending}</strong>
          <span className="metric-note">Entradas sin procesar</span>
        </article>
      </div>

      <div className="l1-grid">
        <section className="l1-section">
          <div className="cognitive-section-heading">
            <span className="section-kicker">EMBEDDING PIPELINE</span>
            <span className="panel-caption">TEXTO → VECTOR</span>
          </div>
          <textarea
            value={embedText}
            onChange={(event) => setEmbedText(event.target.value)}
            placeholder="Texto a vectorizar (ej: El usuario exige un reembolso urgente)"
            rows={2}
          />
          <div className="l1-actions">
            <button
              className="button-primary"
              type="button"
              onClick={() => void generateEmbedding()}
              disabled={!embedText.trim()}
            >
              Generar embedding
            </button>
          </div>
          {embeddingError ? <p className="l1-error">{embeddingError}</p> : null}
          {embeddingPreview ? (
            <div className="l1-vector-preview">
              <small>
                Vector [{embeddingPreview.length} dims]: [
                {embeddingPreview
                  .slice(0, 10)
                  .map((value) => value.toFixed(4))
                  .join(', ')}
                , …]
              </small>
            </div>
          ) : null}
        </section>

        <section className="l1-section">
          <div className="cognitive-section-heading">
            <span className="section-kicker">AUTO-EXTRACCIÓN L0 → L1</span>
            <span className="panel-caption">WORKER LOCAL</span>
          </div>
          <div className="l1-auto-row">
            <label className="l1-toggle">
              <input
                type="checkbox"
                checked={autoOn}
                onChange={(event) => toggleAuto(event.target.checked)}
              />
              <span className="l1-toggle-track" aria-hidden="true" />
              Auto-extracción: {autoOn ? 'ON' : 'OFF'}
            </label>
            <span
              className={`surface-badge ${autoOn ? 'surface-badge-ready' : ''}`}
            >
              {pending} PENDIENTES
            </span>
          </div>
          <p className="l1-note">
            Cada {store.config.batchSize || DEFAULT_L1_CONFIG.batchSize}{' '}
            entradas nuevas del buffer L0 disparan extracción SPO automática.
          </p>
          <div className="l1-logs">
            {logs.length ? (
              logs.slice(-6).map((line, index) => (
                <small key={index} className="l1-log-line">
                  {line}
                </small>
              ))
            ) : (
              <small className="l1-log-line muted">
                Sin actividad todavía. Envía mensajes en Chats y activa el
                toggle.
              </small>
            )}
          </div>
        </section>
      </div>

      <section className="l1-section">
        <div className="cognitive-section-heading">
          <span className="section-kicker">EXTRACTOR SPO</span>
          <span className="panel-caption">
            {spoSource || 'TEXTO → TRIPLETAS'}
          </span>
        </div>
        <textarea
          value={spoText}
          onChange={(event) => setSpoText(event.target.value)}
          placeholder="Pega un texto (ej: El mercader de Damasco pidió un reembolso de 200 monedas)"
          rows={3}
        />
        <div className="l1-actions">
          <button
            className="button-primary"
            type="button"
            onClick={() => void runExtraction()}
            disabled={!spoText.trim() || spoBusy}
          >
            {spoBusy ? 'Extrayendo…' : 'Extraer hechos'}
          </button>
          <label className="l1-toggle l1-toggle-inline">
            <input
              type="checkbox"
              checked={filterThreshold}
              onChange={(event) => setFilterThreshold(event.target.checked)}
            />
            <span className="l1-toggle-track" aria-hidden="true" />
            Solo certeza ≥ 75%
          </label>
        </div>
        {triplets.length ? (
          <>
            <TripletEditor
              triplets={visibleTriplets}
              onTriplets={setTriplets}
            />
            <div className="l1-actions">
              <button
                className="button-primary"
                type="button"
                onClick={() => void indexTriplets()}
                disabled={!visibleTriplets.length}
              >
                Indexar {visibleTriplets.length} hechos seleccionados
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section className="l1-section">
        <div className="cognitive-section-heading">
          <span className="section-kicker">BÚSQUEDA VECTORIAL</span>
          <span className="panel-caption">TOP-5 · COSINE × DECAY</span>
        </div>
        <div className="l1-search-row">
          <input
            className="memory-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
            placeholder="Buscar hechos relevantes…"
            aria-label="Buscar hechos vectoriales"
          />
          <button
            className="button-primary"
            type="button"
            onClick={() => void runSearch()}
            disabled={!query.trim() || searchBusy}
          >
            Buscar
          </button>
        </div>
        <div className="l1-lambda-row">
          <label htmlFor="l1-lambda">λ decay</label>
          <input
            id="l1-lambda"
            type="range"
            min={0.01}
            max={0.5}
            step={0.01}
            value={lambda}
            onChange={(event) => {
              const next = Number(event.target.value);
              setLambda(next);
              store.config = { ...store.config, lambda: next };
            }}
          />
          <span>{lambda.toFixed(2)}</span>
        </div>
        {searchBusy ? (
          <p className="l1-note">Embedding de la consulta…</p>
        ) : searchResults ? (
          <SearchResults results={searchResults} />
        ) : (
          <p className="memory-search-empty">
            Busca en lenguaje natural: el índice devuelve hechos por similitud
            semántica penalizados por antigüedad.
          </p>
        )}
      </section>
    </div>
  );
}
