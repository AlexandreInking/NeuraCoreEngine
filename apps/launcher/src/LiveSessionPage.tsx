import type { DeepSeekConfig } from './cognition/deepseek';
import { LiveSessionPanel } from './orchestrator/LiveSessionPanel';

export default function LiveSessionPage({
  agentId,
  deepSeekConfig,
}: {
  agentId: string;
  deepSeekConfig: DeepSeekConfig;
}) {
  return (
    <section className="page">
      <div className="surface-header">
        <div>
          <span className="section-kicker">v0.7 · ORCHESTRATOR</span>
          <h1>Ciclo cognitivo en vivo</h1>
        </div>
        <span className="surface-badge cognitive-live">LIVE</span>
      </div>
      <p className="page-intro">
        Sesión de prueba del pipeline completo: buffer L0, extracción VAD, hechos L1,
        escenario L2, persona L3 y respuesta del LLM — con health check por subsistema.
      </p>
      <LiveSessionPanel agentId={agentId} deepSeekConfig={deepSeekConfig} />
    </section>
  );
}
