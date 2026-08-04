import { l0StoreFor } from '../l0';
import { DEFAULT_PROSODY } from '../l0';
import { l1StoreFor } from '../l1';
import { l2StoreFor } from '../l2';
import { l3ProfileStore } from '../l3';
import { compileSystemPrompt } from '../l3/compiler';
import { EkfVadEngine, DEFAULT_EKF_CONFIG, DEFAULT_VAD_CONFIG } from '../vad';
import {
  deepSeekChat,
  testDeepSeekConnection,
  DEFAULT_DEEPSEEK_CONFIG,
  type DeepSeekConfig,
} from '../cognition/deepseek';
import { heuristicAnalysis } from '../cognition/analysis';
import type { L1Fact } from '../l1/types';

export type SubsystemStatus = {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type PipelineStep = {
  name: string;
  status: 'pending' | 'ok' | 'error';
  latencyMs: number;
  detail?: string;
};

export type PipelineResult = {
  steps: PipelineStep[];
  response: string;
  topFacts: L1Fact[];
  activeScenario: string | null;
  vad: { valence: number; arousal: number; dominance: number };
};

/**
 * CognitiveOrchestrator (hito 7.1-7.2): coordinates the full pipeline
 * L0 → VAD → L1 → L2 → L3 → LLM, measuring each step and exposing
 * per-subsystem health checks.
 */
export class CognitiveOrchestrator {
  readonly agentId: string;
  readonly vad: EkfVadEngine;
  readonly sessionId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.sessionId = `session-${Date.now().toString(36)}`;
    this.vad = new EkfVadEngine(DEFAULT_VAD_CONFIG, DEFAULT_EKF_CONFIG);
  }

  private measure<T>(fn: () => T | Promise<T>): Promise<{ result: T; latencyMs: number }> {
    const started = performance.now();
    return Promise.resolve(fn()).then((result) => ({
      result,
      latencyMs: Math.round((performance.now() - started) * 10) / 10,
    }));
  }

  /** Health check for every subsystem with latency (hito 7.1). */
  async healthCheck(config: DeepSeekConfig): Promise<{
    overall: boolean;
    subsystems: SubsystemStatus[];
  }> {
    const subsystems: SubsystemStatus[] = [];

    const l0 = await this.measure(() => l0StoreFor(this.agentId).sessions().length);
    subsystems.push({ name: 'L0', ok: true, latencyMs: l0.latencyMs });

    const l1 = await this.measure(async () => l1StoreFor(this.agentId).count());
    subsystems.push({ name: 'L1', ok: true, latencyMs: l1.latencyMs });

    const l2 = await this.measure(() => l2StoreFor(this.agentId).count());
    subsystems.push({ name: 'L2', ok: true, latencyMs: l2.latencyMs });

    const l3 = await this.measure(() => (l3ProfileStore().get(this.agentId) ? 1 : 0));
    subsystems.push({
      name: 'L3',
      ok: l3.result > 0,
      latencyMs: l3.latencyMs,
      error: l3.result > 0 ? undefined : 'Sin perfil L3 (opcional)',
    });

    const vad = await this.measure(() => this.vad.predict(0.01));
    subsystems.push({ name: 'VAD', ok: true, latencyMs: vad.latencyMs });

    const llmStarted = performance.now();
    let llmOk = false;
    let llmError: string | undefined;
    try {
      if (!config.apiKey.trim()) {
        throw new Error('API key de DeepSeek no configurada');
      }
      await testDeepSeekConnection(config);
      llmOk = true;
    } catch (error) {
      llmError = error instanceof Error ? error.message : String(error);
    }
    subsystems.push({
      name: 'LLM',
      ok: llmOk,
      latencyMs: Math.round((performance.now() - llmStarted) * 10) / 10,
      error: llmError,
    });

    return {
      overall: subsystems.every((subsystem) => subsystem.ok || subsystem.name === 'LLM'),
      subsystems,
    };
  }

  /**
   * Full pipeline (hito 7.2): L0 write → VAD (lexical) → L1 query →
   * L2 active → L3 compile → LLM streaming response. Each step is measured
   * and reported through `onStep` so the UI can light nodes in real time.
   */
  async runPipeline(
    message: string,
    config: DeepSeekConfig,
    onStep?: (step: PipelineStep) => void,
  ): Promise<PipelineResult> {
    const steps: PipelineStep[] = [];
    const emit = (step: PipelineStep) => {
      steps.push(step);
      onStep?.(step);
    };

    // 1. L0 buffer write
    const l0 = await this.measure(() => {
      const entry = l0StoreFor(this.agentId).append('main', this.agentId, 'user', message, DEFAULT_PROSODY);
      return entry.id;
    });
    emit({ name: 'L0 buffer', status: 'ok', latencyMs: l0.latencyMs, detail: l0.result });

    // 2. VAD extraction (lexical heuristic)
    const analysis = heuristicAnalysis(message);
    const vad = await this.measure(() => {
      this.vad.fuse(
        { kind: 'lexical', delta: { valence: analysis.valence, arousal: analysis.arousal } },
        0.5,
      );
      return this.vad.state();
    });
    emit({
      name: 'VAD extract',
      status: 'ok',
      latencyMs: vad.latencyMs,
      detail: `V ${vad.result.valence.toFixed(2)} A ${vad.result.arousal.toFixed(2)}`,
    });

    // 3. L1 vector query
    const l1 = await this.measure(async () => {
      const facts = await l1StoreFor(this.agentId).all();
      return [...facts].sort((a, b) => b.certainty - a.certainty).slice(0, 3);
    });
    emit({
      name: 'L1 facts',
      status: 'ok',
      latencyMs: l1.latencyMs,
      detail: `${l1.result.length} facts`,
    });

    // 4. L2 active scenario
    const l2 = await this.measure(() => l2StoreFor(this.agentId).active());
    emit({
      name: 'L2 scenario',
      status: 'ok',
      latencyMs: l2.latencyMs,
      detail: l2.result?.name ?? 'ninguno',
    });

    // 5. L3 persona compile
    const l3 = await this.measure(() => {
      const profile = l3ProfileStore().get(this.agentId);
      if (!profile) return null;
      const compiled = compileSystemPrompt({
        profile,
        vad: this.vad.state(),
        activeL2Node: l2.result,
        topL1Facts: l1.result,
      });
      return compiled.prompt;
    });
    emit({
      name: 'L3 prompt',
      status: 'ok',
      latencyMs: l3.latencyMs,
      detail: l3.result ? `≤800 tok` : 'sin perfil',
    });

    // 6. LLM response
    const llmStarted = performance.now();
    let llmContent = '';
    let llmError = '';
    try {
      const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: l3.result ?? 'Eres un asistente coherente.' },
        { role: 'user', content: message },
      ];
      if (!config.apiKey.trim()) {
        throw new Error('DeepSeek API key no configurada');
      }
      llmContent = await deepSeekChat(config, history);
    } catch (error) {
      llmError = error instanceof Error ? error.message : String(error);
    }
    emit({
      name: 'LLM response',
      status: llmError ? 'error' : 'ok',
      latencyMs: Math.round((performance.now() - llmStarted) * 10) / 10,
      detail: llmError || `${llmContent.length} chars`,
    });

    // Write the agent reply to L0 (turn complete).
    try {
      l0StoreFor(this.agentId).append('main', this.agentId, 'agent', llmContent, DEFAULT_PROSODY);
    } catch {
      // L0 write is best-effort
    }

    return {
      steps,
      response: llmContent,
      topFacts: l1.result,
      activeScenario: l2.result?.name ?? null,
      vad: this.vad.state(),
    };
  }
}

const instances = new Map<string, CognitiveOrchestrator>();

export function orchestratorFor(agentId: string): CognitiveOrchestrator {
  let orchestrator = instances.get(agentId);
  if (!orchestrator) {
    orchestrator = new CognitiveOrchestrator(agentId);
    instances.set(agentId, orchestrator);
  }
  return orchestrator;
}

export { DEFAULT_DEEPSEEK_CONFIG };
