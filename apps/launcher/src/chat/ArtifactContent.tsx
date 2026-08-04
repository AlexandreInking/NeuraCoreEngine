import { useMemo, useState } from 'react';
import type { ChartSpec, ArtifactWindow } from './artifacts';

const SERIES_COLORS = ['#70a1ff', '#10b981', '#f59e0b', '#a855f7', '#f87171'];

function BarChart({ spec }: { spec: ChartSpec }) {
  const labels = spec.labels ?? [];
  const series = useMemo(() => toSeries(spec), [spec]);
  const width = 600;
  const height = 240;
  const pad = { top: 24, right: 16, bottom: 40, left: 44 };
  const max = Math.max(1, ...series.flat());

  if (!labels.length || !series.length) {
    return <p className="chart-empty">Datos insuficientes para el gráfico.</p>;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="chart-svg"
      role="img"
      aria-label={spec.title ?? 'Chart'}
    >
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <line
          key={fraction}
          x1={pad.left}
          x2={width - pad.right}
          y1={height - pad.bottom - fraction * (height - pad.top - pad.bottom)}
          y2={height - pad.bottom - fraction * (height - pad.top - pad.bottom)}
          className="chart-gridline"
        />
      ))}
      {series.map((values, seriesIndex) => {
        const groupWidth = (width - pad.left - pad.right) / labels.length;
        const barWidth = Math.max(4, Math.min(26, groupWidth * 0.6));
        return values.map((value, index) => {
          const barHeight = (value / max) * (height - pad.top - pad.bottom);
          const x = pad.left + index * groupWidth + (groupWidth - barWidth) / 2;
          const y = height - pad.bottom - barHeight;
          return (
            <rect
              key={`${seriesIndex}-${index}`}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
              opacity={0.9}
            />
          );
        });
      })}
      {labels.map((label, index) => {
        const groupWidth = (width - pad.left - pad.right) / labels.length;
        return (
          <text
            key={index}
            x={pad.left + index * groupWidth + groupWidth / 2}
            y={height - 14}
            textAnchor="middle"
            className="chart-label"
          >
            {label.length > 10 ? `${label.slice(0, 9)}…` : label}
          </text>
        );
      })}
      <text x={pad.left} y={16} className="chart-title">
        {spec.title ?? 'Chart'}
      </text>
    </svg>
  );
}

function LineChart({ spec }: { spec: ChartSpec }) {
  const labels = spec.labels ?? [];
  const series = useMemo(() => toSeries(spec), [spec]);
  const width = 600;
  const height = 240;
  const pad = { top: 24, right: 16, bottom: 40, left: 44 };
  const max = Math.max(1, ...series.flat());

  if (!labels.length || !series.length) {
    return <p className="chart-empty">Datos insuficientes para el gráfico.</p>;
  }

  const toPoint = (value: number, index: number) => {
    const x =
      pad.left +
      (index / Math.max(1, labels.length - 1)) * (width - pad.left - pad.right);
    const y =
      height - pad.bottom - (value / max) * (height - pad.top - pad.bottom);
    return { x, y };
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="chart-svg"
      role="img"
      aria-label={spec.title ?? 'Chart'}
    >
      {[0.25, 0.5, 0.75, 1].map((fraction) => (
        <line
          key={fraction}
          x1={pad.left}
          x2={width - pad.right}
          y1={height - pad.bottom - fraction * (height - pad.top - pad.bottom)}
          y2={height - pad.bottom - fraction * (height - pad.top - pad.bottom)}
          className="chart-gridline"
        />
      ))}
      {series.map((values, seriesIndex) => {
        const points = values.map(toPoint);
        const path = points
          .map(
            (point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`,
          )
          .join(' ');
        return (
          <g key={seriesIndex}>
            <path
              d={path}
              fill="none"
              stroke={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={3}
                fill={SERIES_COLORS[seriesIndex % SERIES_COLORS.length]}
              />
            ))}
          </g>
        );
      })}
      {labels.map((label, index) => {
        const point = toPoint(0, index);
        return (
          <text
            key={index}
            x={point.x}
            y={height - 14}
            textAnchor="middle"
            className="chart-label"
          >
            {label.length > 10 ? `${label.slice(0, 9)}…` : label}
          </text>
        );
      })}
      <text x={pad.left} y={16} className="chart-title">
        {spec.title ?? 'Chart'}
      </text>
    </svg>
  );
}

function toSeries(spec: ChartSpec): number[][] {
  if (Array.isArray(spec.values) && spec.values.length > 0) {
    if (Array.isArray(spec.values[0])) {
      return (spec.values as number[][]).map((row) =>
        row.filter((value) => Number.isFinite(value)),
      );
    }
    return [
      (spec.values as number[]).filter((value) => Number.isFinite(value)),
    ];
  }
  return [];
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard unavailable
    }
  };
  return (
    <div className="code-window">
      <div className="code-window-toolbar">
        <span className="code-window-lang">{language}</span>
        <button
          type="button"
          className="code-window-copy"
          onClick={() => void copy()}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-window-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownTable({ markdown }: { markdown: string }) {
  const rows = useMemo(() => parseTable(markdown), [markdown]);
  if (!rows.length) {
    return <p className="chart-empty">Tabla vacía.</p>;
  }
  const headers = rows[0];
  return (
    <div className="table-scroll">
      <table className="artifact-table">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={index}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((_, colIndex) => (
                <td key={colIndex}>{row[colIndex] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseTable(markdown: string): string[][] {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .filter((line) => !/^\|?[\s:|-]+\|?$/.test(line))
    .map((line) =>
      line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((cell) => cell.trim()),
    );
}

export default function ArtifactContent({
  artifact,
}: {
  artifact: ArtifactWindow;
}) {
  const content = artifact.content;
  switch (content.kind) {
    case 'chart':
      return content.spec.type === 'line' ? (
        <LineChart spec={content.spec} />
      ) : (
        <BarChart spec={content.spec} />
      );
    case 'code':
      return <CodeBlock language={content.language} code={content.code} />;
    case 'note':
      return (
        <div className="note-window">
          <p>{content.text}</p>
        </div>
      );
    case 'table':
      return <MarkdownTable markdown={content.markdown} />;
    case 'diagram':
      return (
        <div className="diagram-window">
          <p className="diagram-hint">
            Renderizado de diagramas (Mermaid) llegará en un próximo hito.
          </p>
          <pre className="code-window-pre diagram-source">
            <code>{content.source}</code>
          </pre>
        </div>
      );
    case 'image':
      return content.url ? (
        <div className="image-window">
          <img src={content.url} alt={content.caption ?? 'agent image'} />
          {content.caption ? <p>{content.caption}</p> : null}
        </div>
      ) : (
        <div className="image-window image-placeholder">
          <span>🖼️</span>
          <p>La generación de imágenes llegará en un próximo hito.</p>
        </div>
      );
    default:
      return null;
  }
}
