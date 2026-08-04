import { useMemo, useState } from 'react';
import type { MemoryUnit } from './cognition/types';
import { EMOTION_COLORS, EMOTION_LABELS } from './cognition/types';
import { emotionOfMemory } from './cognition/memory';

const MAX_NODES = 60;
const GRID_GAP = 132;
const NODE_MIN = 10;
const NODE_SCALE_IMPORTANCE = 16;
const NODE_SCALE_STRENGTH = 5;

type GraphNode = {
  memory: MemoryUnit;
  x: number;
  y: number;
  r: number;
  emotion: keyof typeof EMOTION_COLORS;
};

type GraphEdge = {
  from: number;
  to: number;
  opacity: number;
};

function layoutNodes(units: MemoryUnit[]): GraphNode[] {
  const sorted = [...units]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_NODES);
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  return sorted.map((memory, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const emotion = emotionOfMemory(memory);
    return {
      memory,
      x: 70 + col * GRID_GAP,
      y: 70 + row * GRID_GAP,
      r:
        NODE_MIN +
        memory.importance * NODE_SCALE_IMPORTANCE +
        memory.strength * NODE_SCALE_STRENGTH,
      emotion,
    };
  });
}

function buildEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  const maxShared = 3;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = new Set(nodes[i].memory.keywords);
      const b = nodes[j].memory.keywords;
      const shared = b.filter((keyword) => a.has(keyword)).length;
      if (shared > 0) {
        edges.push({
          from: i,
          to: j,
          opacity: 0.12 + (shared / maxShared) * 0.45,
        });
      }
    }
  }
  return edges.slice(0, 240);
}

export default function MemoryGraph({ units }: { units: MemoryUnit[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodes = useMemo(() => layoutNodes(units), [units]);
  const edges = useMemo(() => buildEdges(nodes), [nodes]);
  const selected = nodes.find((node) => node.memory.id === selectedId) ?? null;

  if (!nodes.length) {
    return (
      <div className="memory-graph-empty">
        <strong>Sin recuerdos que graficar</strong>
        <span>
          El tamaño de cada nodo representa la importancia del recuerdo y su
          color la emoción asociada.
        </span>
      </div>
    );
  }

  const width = Math.max(600, (nodes[0].x + 90) * 2);
  const maxY = Math.max(...nodes.map((node) => node.y));
  const graphHeight = maxY + 90;

  return (
    <div className="memory-graph">
      <svg
        viewBox={`0 0 ${width} ${graphHeight}`}
        className="memory-graph-svg"
        role="img"
        aria-label="Grafo de conexiones de la memoria"
      >
        {edges.map((edge, index) => {
          const from = nodes[edge.from];
          const to = nodes[edge.to];
          return (
            <line
              key={`edge-${index}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="memory-graph-edge"
              opacity={edge.opacity}
            />
          );
        })}
        {nodes.map((node) => {
          const isSelected = node.memory.id === selectedId;
          return (
            <g
              key={node.memory.id}
              className={`memory-graph-node ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedId(isSelected ? null : node.memory.id)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={EMOTION_COLORS[node.emotion]}
                fillOpacity={0.55}
                stroke={EMOTION_COLORS[node.emotion]}
                strokeWidth={node.memory.isRepressed ? 2 : 1.4}
                strokeDasharray={node.memory.isRepressed ? '4 3' : undefined}
              >
                <title>
                  {node.memory.content.slice(0, 120)}
                  {'\n'}emoción: {EMOTION_LABELS[node.emotion]} · importancia:{' '}
                  {Math.round(node.memory.importance * 100)}% · fuerza:{' '}
                  {Math.round(node.memory.strength * 100)}%
                  {node.memory.isRepressed ? '\n(reprimido)' : ''}
                </title>
              </circle>
            </g>
          );
        })}
      </svg>

      <div className="memory-graph-legend" aria-label="Leyenda de emociones">
        {(
          Object.keys(EMOTION_COLORS) as Array<keyof typeof EMOTION_COLORS>
        ).map((emotion) => (
          <span className="graph-legend-item" key={emotion}>
            <i
              className="graph-legend-dot"
              style={{ background: EMOTION_COLORS[emotion] }}
              aria-hidden="true"
            />
            {EMOTION_LABELS[emotion]}
          </span>
        ))}
      </div>

      {selected ? (
        <div className="memory-graph-detail">
          <strong>{EMOTION_LABELS[selected.emotion]}</strong>
          <p>{selected.memory.content}</p>
          <span>
            importancia {Math.round(selected.memory.importance * 100)}% · fuerza{' '}
            {Math.round(selected.memory.strength * 100)}% · accesos{' '}
            {selected.memory.accessCount}
            {selected.memory.isRepressed ? ' · reprimido' : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
}
