import { useEffect, useState } from 'react';
import {
  readTelemetry,
  telemetryHistory,
  exportTelemetryJson,
  type TelemetryMetrics,
} from './metrics';

/**
 * Observability panel (hito 9.6): live metrics from the orchestrator and
 * L1 worker, latency history and JSON export.
 */
export function TelemetryPanel() {
  const [metrics, setMetrics] = useState<TelemetryMetrics>(readTelemetry);
  const [history, setHistory] = useState(telemetryHistory());

  useEffect(() => {
    const timer = setInterval(() => {
      setMetrics(readTelemetry());
      setHistory(telemetryHistory());
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const rows: Array<[string, string | number]> = [
    ['Turnos procesados', metrics.turnsProcessed],
    ['Mensajes de usuario', metrics.userMessages],
    ['Llamadas LLM', metrics.llmCalls],
    ['Errores LLM', metrics.llmErrors],
    ['PII enmascaradas', metrics.piiScrubbed],
    ['Turns limitados (rate limit)', metrics.rateLimited],
    ['Facts L1 indexados', metrics.l1FactsIndexed],
    ['Latencia media pipeline', `${metrics.averagePipelineLatencyMs} ms`],
    ['Latencia p50', `${metrics.p50LatencyMs} ms`],
    ['Latencia p95', `${metrics.p95LatencyMs} ms`],
  ];

  return (
    <section className="l1-section">
      <div className="cognitive-section-heading">
        <span className="section-kicker">OBSERVABILIDAD</span>
        <span className="panel-caption">10 MÉTRICAS</span>
      </div>
      <div className="subsystem-grid">
        {rows.map(([label, value]) => (
          <div className="subsystem-chip ok" key={label}>
            <span className="subsystem-dot" aria-hidden="true" />
            <strong>{value}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>
      {history.length >= 2 ? (
        <svg
          className="vad-sparkline"
          viewBox="0 0 360 64"
          role="img"
          aria-label="Historial de latencia"
        >
          {history.slice(-40).map((point, index, array) => {
            const x = (index / (array.length - 1)) * 360;
            const y = 60 - Math.min(1, point.latencyMs / 2000) * 54;
            return <circle key={point.at} cx={x} cy={y} r={1.6} fill={point.ok ? '#22c55e' : '#ef4444'} />;
          })}
        </svg>
      ) : (
        <p className="memory-search-empty">
          Ejecuta el pipeline para acumular métricas (se refrescan cada 3s).
        </p>
      )}
      <div className="l1-actions">
        <a
          className="memory-action"
          download="neuracore_telemetry.json"
          href={`data:application/json;charset=utf-8,${encodeURIComponent(exportTelemetryJson())}`}
        >
          Exportar telemetría JSON
        </a>
      </div>
    </section>
  );
}
