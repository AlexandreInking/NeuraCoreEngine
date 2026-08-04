import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type WheelEvent as ReactWheelEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { DeepSeekConfig } from './cognition/deepseek';
import { l1StoreFor, type L1Store } from './l1/store';
import { l2StoreFor, type L2Store, createNodeId } from './l2/store';
import {
  ROOT_SCENARIO,
  L2_STATUSES,
  type L2Node,
  type L2Status,
  type L2ToolCall,
} from './l2/types';
import { clusterFactsIntoScenarios, type ClusterResult } from './l2/cluster';
import {
  mermaidForNodes,
  nodeColor,
  estimateTokenReduction,
  buildToolCallNode,
} from './l2/mermaid';
import { l0StoreFor } from './l0/store';
import { EMBEDDING_DIMENSION } from './l1/embedder';

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

function findL0Entry(agentId: string, entryId: string) {
  const l0 = l0StoreFor(agentId);
  for (const session of l0.sessions()) {
    const entry = l0.read(session.id).find((item) => item.id === entryId);
    if (entry) return { entry, session };
  }
  return null;
}

function L2Canvas({
  nodes,
  selectedId,
  onSelect,
  onEdit,
}: {
  nodes: L2Node[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  onEdit: (node: L2Node) => void;
}) {
  const [view, setView] = useState({ tx: 40, ty: 20, scale: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const layout = useMemo(() => {
    const width = 1200;
    const scenarioY = 150;
    const factY = 290;
    const nodesWide = Math.max(1, nodes.length);
    const step = Math.min(260, width / (nodesWide + 1));
    const positioned = nodes.map((node, index) => ({
      node,
      x: 90 + (index + 1) * step,
      y: scenarioY,
      facts: node.linkedFactIds.map((factId, factIndex) => ({
        factId,
        x: 90 + (index + 1) * step,
        y: factY + factIndex * 56,
      })),
    }));
    return {
      positioned,
      width: Math.max(width, 90 + (nodesWide + 1) * step),
      height: 460,
    };
  }, [nodes]);

  const handleWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    setView((current) => ({
      ...current,
      scale: Math.min(2.5, Math.max(0.4, current.scale * factor)),
    }));
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    setView((current) => ({
      ...current,
      tx: current.tx + (event.clientX - dragRef.current!.x),
      ty: current.ty + (event.clientY - dragRef.current!.y),
    }));
    dragRef.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = layout.width * 2;
      canvas.height = layout.height * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const themeBg =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--bg')
          .trim() || '#0d1117';
      ctx.fillStyle = themeBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const link = document.createElement('a');
      link.download = 'l2-graph.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  return (
    <div className="l2-canvas-wrap">
      <div className="l2-canvas-toolbar">
        <span>
          Pan: arrastra el fondo · Zoom: rueda · Click: detalle · Doble click:
          editar
        </span>
        <button type="button" className="memory-action" onClick={exportPng}>
          Exportar PNG
        </button>
      </div>
      <svg
        ref={svgRef}
        className="l2-canvas"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        onWheel={handleWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        role="img"
        aria-label="Grafo L2 de escenarios"
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          <circle
            cx={layout.width / 2}
            cy={40}
            r={26}
            fill="var(--indigo)"
            stroke="#fff"
            strokeWidth={2}
          />
          <text
            x={layout.width / 2}
            y={46}
            textAnchor="middle"
            fill="#fff"
            fontSize={10}
            fontWeight={700}
          >
            ROOT
          </text>
          {layout.positioned.map(({ node, x, y, facts }) => {
            const color = nodeColor(node);
            const selected = selectedId === node.nodeId;
            return (
              <g key={node.nodeId}>
                <path
                  d={`M ${layout.width / 2} 66 C ${layout.width / 2} ${y - 40}, ${x} ${y - 40}, ${x} ${y - 28}`}
                  fill="none"
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                />
                <rect
                  x={x - 92}
                  y={y - 22}
                  width={184}
                  height={44}
                  rx={8}
                  fill={color}
                  stroke={selected ? '#fff' : 'transparent'}
                  strokeWidth={selected ? 2 : 0}
                  className="l2-node"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(node.nodeId);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    onEdit(node);
                  }}
                />
                <text
                  x={x}
                  y={y - 2}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize={10}
                  fontWeight={600}
                  pointerEvents="none"
                >
                  {node.name.length > 22
                    ? `${node.name.slice(0, 21)}…`
                    : node.name}
                </text>
                <text
                  x={x}
                  y={y + 12}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.85)"
                  fontSize={8}
                  pointerEvents="none"
                >
                  {node.toolCall
                    ? `HTTP ${node.toolCall.httpStatus}`
                    : node.status}{' '}
                  · {node.linkedFactIds.length} hechos
                </text>
                {facts.map((fact) => (
                  <g key={fact.factId}>
                    <path
                      d={`M ${x} ${y + 22} C ${x} ${fact.y - 14}, ${fact.x} ${fact.y - 14}, ${fact.x} ${fact.y - 8}`}
                      fill="none"
                      stroke="var(--border-strong)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={fact.x}
                      cy={fact.y}
                      r={5}
                      fill="var(--text-subtle)"
                    />
                    <text
                      x={fact.x + 10}
                      y={fact.y + 3}
                      fill="var(--text-muted)"
                      fontSize={8}
                    >
                      fact {fact.factId.slice(0, 14)}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function ToolCallSimulator({
  onCompressed,
}: {
  onCompressed: (nodes: L2Node[]) => void;
}) {
  const [calls, setCalls] = useState<L2ToolCall[]>([]);
  const [name, setName] = useState('');
  const [result, setResult] = useState('');
  const [httpStatus, setHttpStatus] = useState(200);
  const [stats, setStats] = useState<ReturnType<
    typeof estimateTokenReduction
  > | null>(null);

  const addCall = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setCalls((current) => [
      ...current,
      {
        name: name.trim(),
        result: result.trim() || '(sin resultado)',
        httpStatus,
      },
    ]);
    setName('');
    setResult('');
  };

  const compress = () => {
    if (!calls.length) return;
    const estimation = estimateTokenReduction(calls);
    setStats(estimation);
    const nodes = calls.map((call, index) => buildToolCallNode(call, index));
    onCompressed(nodes);
  };

  return (
    <section className="l2-section">
      <div className="cognitive-section-heading">
        <span className="section-kicker">MERMAID CANVAS SIMULATOR</span>
        <span className="panel-caption">
          COMPRESIÓN SIMBÓLICA DE TOOL CALLS
        </span>
      </div>
      <form className="l2-tool-form" onSubmit={addCall}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nombre de la tool (ej: get_inventory)"
          aria-label="Nombre de tool call"
        />
        <input
          value={result}
          onChange={(event) => setResult(event.target.value)}
          placeholder="Resultado (ej: 12 items)"
          aria-label="Resultado"
        />
        <input
          type="number"
          min={100}
          max={599}
          value={httpStatus}
          onChange={(event) => setHttpStatus(Number(event.target.value) || 200)}
          aria-label="HTTP status"
          className="l2-http-input"
        />
        <button
          className="button-primary"
          type="submit"
          disabled={!name.trim()}
        >
          Añadir
        </button>
      </form>
      {calls.length ? (
        <div className="l2-tool-list">
          {calls.map((call, index) => (
            <div className="l2-tool-item" key={index}>
              <span
                className="l2-http-dot"
                style={{
                  background:
                    call.httpStatus >= 500
                      ? '#c62828'
                      : call.httpStatus >= 400
                        ? '#b58900'
                        : '#2e7d32',
                }}
                title={`HTTP ${call.httpStatus}`}
              />
              <code>{call.name}</code>
              <span>{call.result.slice(0, 40)}</span>
              <span
                className={`l2-http-tag ${call.httpStatus >= 500 ? 'err' : call.httpStatus >= 400 ? 'warn' : 'ok'}`}
              >
                {call.httpStatus}
              </span>
              <button
                type="button"
                className="memory-action memory-action-danger"
                onClick={() => setCalls(calls.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="l1-actions">
        <button
          className="button-primary"
          type="button"
          onClick={compress}
          disabled={!calls.length}
        >
          Comprimir a Mermaid
        </button>
      </div>
      {stats ? (
        <p className="l1-note">
          Reducción: {stats.rawTokens.toLocaleString()} →{' '}
          {stats.mermaidTokens.toLocaleString()} tokens ({stats.savedPct}%)
          {stats.saved < 0
            ? ' (la secuencia es corta; Mermaid añade estructura)'
            : ''}
        </p>
      ) : null}
    </section>
  );
}

export default function L2Panel({
  agentId,
  deepSeekConfig,
}: {
  agentId: string;
  deepSeekConfig: DeepSeekConfig;
}) {
  const store: L2Store = useMemo(() => l2StoreFor(agentId), [agentId]);
  const [, setTick] = useState(0);
  const refresh = () => setTick((value) => value + 1);

  const [busy, setBusy] = useState(false);
  const [clusterMessage, setClusterMessage] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<L2Node | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [drillDown, setDrillDown] = useState<{
    node: L2Node;
    entry: ReturnType<typeof findL0Entry>;
  } | null>(null);
  const [manualName, setManualName] = useState('');

  const nodes = store.all();
  const mermaid = useMemo(() => mermaidForNodes(nodes), [nodes]);
  const selected = nodes.find((node) => node.nodeId === selectedId) ?? null;

  const runClustering = async () => {
    setBusy(true);
    setClusterMessage('');
    const l1: L1Store = l1StoreFor(agentId);
    const facts = await l1.all();
    const result: ClusterResult = await clusterFactsIntoScenarios(
      facts,
      deepSeekConfig,
      store.all(),
    );
    for (const node of result.created) store.upsert(node);
    setClusterMessage(result.message);
    setBusy(false);
    refresh();
  };

  const createManualNode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    const now = Date.now();
    store.upsert({
      nodeId: createNodeId('SCENARIO'),
      parentScenario: ROOT_SCENARIO,
      name: name.toUpperCase(),
      status: 'ACTIVE',
      linkedFactIds: [],
      createdAt: now,
      updatedAt: now,
      manual: true,
    });
    setManualName('');
    refresh();
  };

  const drillInto = (node: L2Node) => {
    const entryId = node.toolCall?.l0EntryId;
    if (!entryId) {
      setDrillDown({ node, entry: null });
      return;
    }
    setDrillDown({ node, entry: findL0Entry(agentId, entryId) });
  };

  const startEdit = (node: L2Node) => {
    setEditing(node);
    setEditLabel(node.name);
  };

  const saveEdit = () => {
    if (editing && editLabel.trim()) {
      store.upsert({
        ...editing,
        name: editLabel.trim(),
        updatedAt: Date.now(),
      });
      refresh();
    }
    setEditing(null);
  };

  const saveCompressed = (compressed: L2Node[]) => {
    for (const node of compressed) {
      const existing = store.get(node.nodeId);
      store.upsert(
        existing
          ? {
              ...existing,
              toolCall: node.toolCall,
              name: node.name,
              status: node.status,
            }
          : node,
      );
    }
    refresh();
  };

  return (
    <div className="l1-panel">
      <div className="surface-header">
        <div>
          <span className="section-kicker">L2 · SCENARIO GRAPH</span>
          <h3>Escenarios situacionales</h3>
        </div>
        <span className="surface-badge">
          {nodes.length} NODOS · LOCAL-FIRST (seam L2Store)
        </span>
      </div>

      <div className="l1-grid">
        <section className="l2-section">
          <div className="cognitive-section-heading">
            <span className="section-kicker">CLUSTERING SEMÁNTICO</span>
            <span className="panel-caption">L1 FACTS → NODOS L2</span>
          </div>
          <p className="l1-note">
            Agrupa hechos L1 con certeza ≥ 75% por similitud de embeddings (
            {EMBEDDING_DIMENSION}d) y entidades compartidas; grupos de 3+ hechos
            crean un nodo escenario con nombre generado por LLM.
          </p>
          <div className="l1-actions">
            <button
              className="button-primary"
              type="button"
              onClick={() => void runClustering()}
              disabled={busy}
            >
              {busy ? 'Analizando…' : 'Analizar L1 → Crear Nodos L2'}
            </button>
          </div>
          {clusterMessage ? (
            <p className="l1-note" role="status">
              {clusterMessage}
            </p>
          ) : null}

          <form className="l2-manual-form" onSubmit={createManualNode}>
            <input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              placeholder="Nombre del nodo manual (ej: PRICE_NEGOTIATION)"
              aria-label="Nombre del nodo manual"
            />
            <button
              className="memory-action"
              type="submit"
              disabled={!manualName.trim()}
            >
              Crear nodo manual
            </button>
          </form>
        </section>

        <section className="l2-section">
          <div className="cognitive-section-heading">
            <span className="section-kicker">NODOS L2</span>
            <span className="panel-caption">{nodes.length} ESCENARIOS</span>
          </div>
          {nodes.length ? (
            <div className="l2-node-list">
              {nodes.map((node) => (
                <div className="l2-node-item" key={node.nodeId}>
                  <span
                    className="l2-http-dot"
                    style={{ background: nodeColor(node) }}
                  />
                  <div className="l2-node-item-main">
                    <strong>{node.name}</strong>
                    <small>
                      {node.linkedFactIds.length} hechos ·{' '}
                      {node.toolCall
                        ? `tool ${node.toolCall.name} HTTP ${node.toolCall.httpStatus}`
                        : node.manual
                          ? 'manual'
                          : 'cluster'}{' '}
                      · {formatTime(node.createdAt)}
                    </small>
                  </div>
                  <select
                    className="l2-status-select"
                    value={node.status}
                    aria-label={`Estado de ${node.name}`}
                    onChange={(event) => {
                      store.setStatus(
                        node.nodeId,
                        event.target.value as L2Status,
                      );
                      refresh();
                    }}
                  >
                    {L2_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="memory-action"
                    onClick={() => drillInto(node)}
                  >
                    Drill-down
                  </button>
                  <button
                    type="button"
                    className="memory-action memory-action-danger"
                    onClick={() => {
                      if (window.confirm(`Eliminar el nodo ${node.name}?`)) {
                        store.remove(node.nodeId);
                        refresh();
                      }
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="memory-search-empty">
              Sin escenarios todavía. Indexa hechos en L1 y ejecuta el análisis,
              o crea un nodo manual.
            </p>
          )}
        </section>
      </div>

      <section className="l2-section">
        <div className="cognitive-section-heading">
          <span className="section-kicker">MERMAID CANVAS</span>
          <span className="panel-caption">
            GRAFO INTERACTIVO · PAN/ZOOM · PNG
          </span>
        </div>
        {nodes.length ? (
          <>
            <L2Canvas
              nodes={nodes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEdit={startEdit}
            />
            {selected ? (
              <div className="l2-detail">
                <strong>{selected.name}</strong> · {selected.status} ·{' '}
                {formatTime(selected.updatedAt)}
                {selected.toolCall ? (
                  <p className="l1-note">
                    Tool {selected.toolCall.name} → HTTP{' '}
                    {selected.toolCall.httpStatus}: {selected.toolCall.result}
                  </p>
                ) : null}
                {selected.linkedFactIds.length ? (
                  <ul className="l2-fact-list">
                    {selected.linkedFactIds.map((factId) => (
                      <li key={factId}>{factId}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="l1-note">Sin hechos L1 vinculados.</p>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <p className="memory-search-empty">
            El canvas se activa cuando existan nodos L2.
          </p>
        )}
      </section>

      <section className="l2-section">
        <div className="cognitive-section-heading">
          <span className="section-kicker">STRING MERMAIND</span>
          <span className="panel-caption">EDITABLE · COPIAR · DESCARGAR</span>
        </div>
        <pre className="l2-mermaid-pre">
          {mermaid || 'graph TD\n  ROOT["ROOT_GAMING_NPC"]'}
        </pre>
        <div className="l1-actions">
          <button
            className="memory-action"
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(mermaid);
            }}
          >
            Copiar Mermaid
          </button>
          <a
            className="memory-action"
            download="l2-graph.mmd"
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(mermaid)}`}
          >
            Descargar .mmd
          </a>
        </div>
      </section>

      <ToolCallSimulator onCompressed={saveCompressed} />

      {editing ? (
        <div
          className="l2-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Editar label"
          onClick={() => setEditing(null)}
        >
          <div
            className="l2-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cognitive-section-heading">
              <span className="section-kicker">EDITAR LABEL</span>
              <span className="panel-caption">ACTUALIZA EL STRING MERMAID</span>
            </div>
            <input
              value={editLabel}
              onChange={(event) => setEditLabel(event.target.value)}
              aria-label="Nuevo label del nodo"
            />
            <div className="l1-actions">
              <button
                className="button-primary"
                type="button"
                onClick={saveEdit}
              >
                Guardar
              </button>
              <button
                className="memory-action"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {drillDown ? (
        <div
          className="l2-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Drill-down L0"
          onClick={() => setDrillDown(null)}
        >
          <div
            className="l2-modal l2-modal-wide"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="cognitive-section-heading">
              <span className="section-kicker">DRILL-DOWN L2 → L0</span>
              <span className="panel-caption">{drillDown.node.name}</span>
            </div>
            {drillDown.node.toolCall?.l0EntryId ? (
              drillDown.entry ? (
                <div className="l2-drilldown">
                  <p className="l1-note">
                    Entry L0 exacto <code>{drillDown.entry.entry.id}</code> ·
                    sesión <code>{drillDown.entry.session.id}</code> ·{' '}
                    {formatTime(drillDown.entry.entry.timestamp)}
                  </p>
                  <pre className="l2-drilldown-raw">
                    {JSON.stringify(drillDown.entry.entry.raw, null, 2)}
                  </pre>
                  <p className="l1-note">
                    Tool: {drillDown.node.toolCall.name} → HTTP{' '}
                    {drillDown.node.toolCall.httpStatus} ·{' '}
                    {drillDown.node.toolCall.result}
                  </p>
                </div>
              ) : (
                <p className="l1-error" role="alert">
                  ⚠ El entry L0 <code>{drillDown.node.toolCall.l0EntryId}</code>{' '}
                  ya expiró en el buffer (TTL 24h). Este es el último snapshot
                  disponible: {drillDown.node.toolCall.result}.
                </p>
              )
            ) : (
              <p className="l1-note">
                Este nodo no tiene <code>l0EntryId</code> vinculado (nodo de
                cluster/manual). El drill-down solo aplica a tool calls con log
                L0.
              </p>
            )}
            <div className="l1-actions">
              <button
                className="memory-action"
                type="button"
                onClick={() => setDrillDown(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
