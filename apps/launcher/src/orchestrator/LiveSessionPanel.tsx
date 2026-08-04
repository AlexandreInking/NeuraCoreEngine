import { useMemo, useRef, useState } from 'react';
import type { DeepSeekConfig } from '../cognition/deepseek';
import type { VadHistoryPoint } from '../vad/history';
import {
  orchestratorFor,
  type CognitiveOrchestrator,
  type PipelineStep,
  type SubsystemStatus,
} from './orchestrator';

function StepNode({ step }: { step: PipelineStep }) {
  const stateClass = step.status === 'ok' ? 'ok' : step.status === 'error' ? 'error' : 'pending';
  return (
    <div className={`pipeline-step ${stateClass}`}>
      <span className="pipeline-step-dot" aria-hidden="true" />
      <div className="pipeline-step-main">
        <strong>{step.name}</strong>
        <small>
          {step.latencyMs > 0 ? `${step.latencyMs} ms` : 'pendiente'}
          {step.detail ? ` · ${step.detail}` : ''}
        </small>
      </div>
    </div>
  );
}

const STEP_NAMES = ['L0 buffer', 'VAD extract', 'L1 facts', 'L2 scenario', 'L3 prompt', 'LLM response', 'VAD post-respuesta'];

function VadSparkline({ history }: { history: VadHistoryPoint[] }) {
  if (history.length < 2) {
    return <p className="memory-search-empty">El historial VAD se llena con cada turno que incluye vad_delta.</p>;
  }
  const width = 360;
  const height = 64;
  const axes = ['valence', 'arousal', 'dominance'] as const;
  const colors = ['#ef4444', '#22c55e', '#3b82f6'];
  const pathFor = (axis: (typeof axes)[number]) => {
    const points = history.map((point, index) => {
      const x = (index / (history.length - 1)) * width;
      const y = height / 2 - point.state[axis] * (height / 2 - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  };
  return (
    <svg className="vad-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Historial VAD">
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--border)" strokeDasharray="3 3" />
      {axes.map((axis, index) => (
        <path key={axis} d={pathFor(axis)} fill="none" stroke={colors[index]} strokeWidth={1.5} />
      ))}
    </svg>
  );
}

/**
 * Live Session panel (hito 7.1-7.2): subsystem indicators, health check
 * with latency, and the full pipeline visual with real-time step lighting.
 */
export function LiveSessionPanel({
  agentId,
  deepSeekConfig,
}: {
  agentId: string;
  deepSeekConfig: DeepSeekConfig;
}) {
  const orchestrator: CognitiveOrchestrator = useMemo(
    () => orchestratorFor(agentId),
    [agentId],
  );
  const [, setTick] = useState(0);
  const refresh = () => setTick((value) => value + 1);

  const [health, setHealth] = useState<SubsystemStatus[] | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState('');
  const [message, setMessage] = useState('');
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [response, setResponse] = useState('');
  const [pipelineError, setPipelineError] = useState('');
  const [lastVad, setLastVad] = useState<{ valence: number; arousal: number; dominance: number } | null>(null);
  const [vadHistory, setVadHistory] = useState<VadHistoryPoint[]>([]);
  const [lastScenario, setLastScenario] = useState<string | null>(null);
  const logRef = useRef<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [, setLastLog] = useState(0);

  const pushLog = (line: string) => {
    logRef.current = [...logRef.current, `[${new Date().toLocaleTimeString()}] ${line}`].slice(-40);
    setLog(logRef.current);
    setLastLog((value) => value + 1);
  };

  const runHealthCheck = async () => {
    setHealthBusy(true);
    setHealthError('');
    pushLog('Health Check iniciado…');
    try {
      const result = await orchestrator.healthCheck(deepSeekConfig);
      setHealth(result.subsystems);
      pushLog(
        `Health Check: ${result.subsystems.filter((s) => s.ok).length}/6 OK (${result.subsystems
          .map((s) => `${s.name} ${s.latencyMs}ms`)
          .join(', ')})`,
      );
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : String(error));
      pushLog(`Health Check falló: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setHealthBusy(false);
    }
  };

  const runPipeline = async () => {
    const text = message.trim();
    if (!text) return;
    setPipelineBusy(true);
    setPipelineError('');
    setResponse('');
    setSteps(STEP_NAMES.map((name) => ({ name, status: 'pending', latencyMs: 0 })));
    pushLog(`Pipeline: mensaje "${text.slice(0, 60)}"`);
    try {
      const result = await orchestrator.runPipeline(text, deepSeekConfig, (step) => {
        setSteps((current) => current.map((item) => (item.name === step.name ? step : item)));
        pushLog(`${step.name}: ${step.status.toUpperCase()} en ${step.latencyMs}ms${step.detail ? ` — ${step.detail}` : ''}`);
      });
      setResponse(result.response);
      setLastVad(result.vad);
      setVadHistory(result.vadHistory);
      setLastScenario(result.activeScenario);
      pushLog(`Pipeline completo · escenario L2: ${result.activeScenario ?? 'ninguno'}`);
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : String(error));
      pushLog(`Pipeline falló: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPipelineBusy(false);
      refresh();
    }
  };

  return (
    <div className="live-session">
      <div className="l1-grid">
        <section className="l1-section">
          <div className="cognitive-section-heading">
            <span className="section-kicker">SUBSISTEMAS</span>
            <span className="panel-caption">HEALTH CHECK</span>
          </div>
          <div className="subsystem-grid">
            {health
              ? health.map((subsystem) => (
                  <div key={subsystem.name} className={`subsystem-chip ${subsystem.ok ? 'ok' : 'bad'}`}>
                    <span className="subsystem-dot" aria-hidden="true" />
                    <strong>{subsystem.name}</strong>
                    <small>{subsystem.latencyMs} ms</small>
                  </div>
                ))
              : ['L0', 'L1', 'L2', 'L3', 'VAD', 'LLM'].map((name) => (
                  <div key={name} className="subsystem-chip pending">
                    <span className="subsystem-dot" aria-hidden="true" />
                    <strong>{name}</strong>
                    <small>—</small>
                  </div>
                ))}
          </div>
          <div className="l1-actions">
            <button
              className="button-primary"
              type="button"
              onClick={() => void runHealthCheck()}
              disabled={healthBusy}
            >
              {healthBusy ? 'Comprobando…' : 'Health Check'}
            </button>
          </div>
          {healthError ? <p className="l1-error">{healthError}</p> : null}
        </section>

        <section className="l1-section">
          <div className="cognitive-section-heading">
            <span className="section-kicker">PIPELINE E2E</span>
            <span className="panel-caption">L0 → VAD → L1 → L2 → L3 → LLM</span>
          </div>
          <textarea
            rows={2}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mensaje de prueba (ej: ¡Es un robo!)"
            aria-label="Mensaje del pipeline"
          />
          <div className="l1-actions">
            <button
              className="button-primary"
              type="button"
              onClick={() => void runPipeline()}
              disabled={!message.trim() || pipelineBusy}
            >
              {pipelineBusy ? 'Ejecutando…' : 'Ejecutar pipeline'}
            </button>
          </div>
          <div className="pipeline-steps">
            {steps.length
              ? steps.map((step) => <StepNode key={step.name} step={step} />)
              : STEP_NAMES.map((name) => (
                  <StepNode key={name} step={{ name, status: 'pending', latencyMs: 0 }} />
                ))}
          </div>
          {pipelineError ? <p className="l1-error">{pipelineError}</p> : null}
          {lastVad ? (
            <p className="l1-note" role="status">
              VAD post-pipeline: V {lastVad.valence.toFixed(2)} · A {lastVad.arousal.toFixed(2)} · D{' '}
              {lastVad.dominance.toFixed(2)} · Escenario L2: {lastScenario ?? 'ninguno'}
            </p>
          ) : null}
          <VadSparkline history={vadHistory} />
          {vadHistory.length ? (
            <div className="l1-actions">
              <a
                className="memory-action"
                download={`vad_history_${orchestrator.sessionId}.json`}
                href={`data:application/json;charset=utf-8,${encodeURIComponent(orchestrator.vadHistory.exportJson())}`}
              >
                Exportar vad_history_{orchestrator.sessionId}.json
              </a>
            </div>
          ) : null}
          {response ? (
            <div className="l3-test-output">
              <span className="panel-caption">RESPUESTA LLM</span>
              <p>{response}</p>
            </div>
          ) : null}
        </section>
      </div>

      <section className="l1-section">
        <div className="cognitive-section-heading">
          <span className="section-kicker">LOG DE SESIÓN</span>
          <span className="panel-caption">{orchestrator.sessionId}</span>
        </div>
        <div className="l1-logs">
          {log.length ? (
            log.slice(-14).map((line, index) => (
              <small key={index} className="l1-log-line">
                {line}
              </small>
            ))
          ) : (
            <small className="l1-log-line muted">Inicia una sesión para ver el log estructurado.</small>
          )}
        </div>
      </section>
    </div>
  );
}
