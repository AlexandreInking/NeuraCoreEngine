import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DeepSeekConfig } from './cognition/deepseek';
import { deepSeekChatStream } from './cognition/deepseek';
import {
  l3ProfileStore,
  defaultAgentProfile,
  type L3ProfileStore,
} from './l3/store';
import {
  compileSystemPrompt,
  PROMPT_BUDGET,
  PROMPT_YELLOW,
  type CompiledPrompt,
} from './l3/compiler';
import {
  consolidateProfile,
  consolidationState,
  type ConsolidationState,
} from './l3/consolidation';
import type { AgentProfile, Vad, Vertical } from './l3/types';
import { VERTICALS } from './l3/types';
import { l1StoreFor } from './l1/store';
import { l2StoreFor } from './l2/store';

const TESTS_KEY = 'neuracore-l3-tests';

type TestRecord = {
  at: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  model: string;
  preview: string;
};

function readTests(): TestRecord[] {
  try {
    const raw = globalThis.localStorage.getItem(TESTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as TestRecord[]) : [];
  } catch {
    return [];
  }
}

function saveTests(tests: TestRecord[]) {
  try {
    globalThis.localStorage.setItem(
      TESTS_KEY,
      JSON.stringify(tests.slice(0, 5)),
    );
  } catch {
    // ignore
  }
}

function VadSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="l3-vad-slider">
      <span>{label}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <code>{value.toFixed(2)}</code>
    </label>
  );
}

function PromptPreview({ compiled }: { compiled: CompiledPrompt }) {
  const statusLabel =
    compiled.budgetStatus === 'green'
      ? 'OK'
      : compiled.budgetStatus === 'yellow'
        ? 'CERCANO AL LÍMITE'
        : 'SOBRE EL BUDGET';
  return (
    <div className="l3-prompt-preview">
      <div className="l3-token-bar">
        <div
          className={`l3-token-fill ${compiled.budgetStatus}`}
          style={{
            width: `${Math.min(100, (compiled.totalTokens / PROMPT_BUDGET) * 100)}%`,
          }}
        />
      </div>
      <p className="l1-note">
        {compiled.totalTokens} / {PROMPT_BUDGET} tokens · {statusLabel} ·
        recorte L1: {compiled.trimmedFacts}
        {compiled.totalTokens > PROMPT_YELLOW
          ? ' · ⚠ se recortan hechos automáticamente'
          : ''}
      </p>
      <div className="l3-prompt-sections">
        {compiled.sections.map((section) => (
          <div
            className="l3-prompt-section"
            key={section.id}
            style={{ borderLeftColor: section.color }}
          >
            <span
              className="l3-prompt-section-label"
              style={{ color: section.color }}
            >
              [{section.label} · {section.tokens} tok]
            </span>
            <pre>{section.content}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function L3Panel({
  agentId,
  deepSeekConfig,
  vad,
}: {
  agentId: string;
  deepSeekConfig: DeepSeekConfig;
  vad: Vad | null;
}) {
  const store: L3ProfileStore = useMemo(() => l3ProfileStore(), []);
  const [, setTick] = useState(0);
  const refresh = () => setTick((value) => value + 1);

  const activeProfile = store.get(agentId);
  const [draft, setDraft] = useState<AgentProfile>(
    () => activeProfile ?? defaultAgentProfile(agentId),
  );
  const [ruleDraft, setRuleDraft] = useState('');
  const [savedFlash, setSavedFlash] = useState('');

  const [compiled, setCompiled] = useState<CompiledPrompt | null>(null);
  const [compileNote, setCompileNote] = useState('');

  const [testMessage, setTestMessage] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testMetrics, setTestMetrics] = useState<{
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    model: string;
  } | null>(null);
  const [testHistory, setTestHistory] = useState<TestRecord[]>(readTests);
  const [testError, setTestError] = useState('');

  const [consolidation, setConsolidation] = useState<ConsolidationState>(() =>
    consolidationState(agentId),
  );
  const [consolidationBusy, setConsolidationBusy] = useState(false);
  const [consolidationError, setConsolidationError] = useState('');
  const [lastDiff, setLastDiff] = useState<string[]>([]);

  useEffect(() => {
    setDraft(activeProfile ?? defaultAgentProfile(agentId));
  }, [agentId, activeProfile]);

  const updateDraft = (patch: Partial<AgentProfile>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const saveProfile = () => {
    const next = { ...draft, agentId, updatedAt: Date.now() };
    store.pushSnapshot(agentId, 'edición manual');
    store.upsert(next);
    setSavedFlash('Perfil guardado.');
    setTimeout(() => setSavedFlash(''), 2000);
    refresh();
  };

  const duplicateProfile = () => {
    const copyName = `${draft.personaName} Copy`;
    const created = store.duplicate(agentId, `${agentId}_copy`, copyName);
    if (created) {
      setSavedFlash(`Perfil duplicado como ${created.personaName}.`);
    }
    refresh();
  };

  const deleteProfile = () => {
    if (!window.confirm('Eliminar este perfil L3?')) return;
    store.remove(agentId);
    setDraft(defaultAgentProfile(agentId));
    refresh();
  };

  const addRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const rule = ruleDraft.trim();
    if (!rule) return;
    updateDraft({ ethicsRules: [...draft.ethicsRules, rule] });
    setRuleDraft('');
  };

  const compile = async () => {
    setCompileNote('Recopilando contexto L1/L2…');
    const [facts] = await Promise.all([l1StoreFor(agentId).all()]);
    const activeL2 = l2StoreFor(agentId).active();
    const topFacts = [...facts]
      .sort((a, b) => b.certainty - a.certainty)
      .slice(0, 3);
    const result = compileSystemPrompt({
      profile: draft,
      vad,
      activeL2Node: activeL2,
      topL1Facts: topFacts,
    });
    setCompiled(result);
    setCompileNote(
      `Escenario L2: ${activeL2?.name ?? 'ninguno'} · Top-3 hechos L1 · VAD ${vad ? 'en vivo' : 'baseline'}`,
    );
  };

  const runTest = async () => {
    if (!deepSeekConfig.apiKey.trim()) {
      setTestError('Configura una API key de DeepSeek en Settings primero.');
      return;
    }
    if (!compiled) {
      setTestError('Compila el prompt antes de probarlo.');
      return;
    }
    setTestBusy(true);
    setTestError('');
    setTestOutput('');
    setTestMetrics(null);
    try {
      const reply = await deepSeekChatStream(
        deepSeekConfig,
        [
          { role: 'system', content: compiled.prompt },
          {
            role: 'user',
            content: testMessage.trim() || 'Preséntate en una frase.',
          },
        ],
        (token) => setTestOutput((current) => current + token),
      );
      const metrics = {
        promptTokens: reply.promptTokens,
        completionTokens: reply.completionTokens,
        latencyMs: reply.latencyMs,
        model: deepSeekConfig.model.trim(),
      };
      setTestMetrics(metrics);
      const record: TestRecord = {
        at: Date.now(),
        ...metrics,
        preview: reply.content.slice(0, 120),
      };
      const history = [record, ...testHistory].slice(0, 5);
      setTestHistory(history);
      saveTests(history);
    } catch (error) {
      setTestError(error instanceof Error ? error.message : String(error));
    } finally {
      setTestBusy(false);
    }
  };

  const forceConsolidation = async () => {
    setConsolidationBusy(true);
    setConsolidationError('');
    try {
      const facts = await l1StoreFor(agentId).all();
      const topFacts = [...facts]
        .sort((a, b) => b.certainty - a.certainty)
        .slice(0, 5);
      const result = await consolidateProfile({
        agentId,
        store,
        config: deepSeekConfig,
        activeL2Node: l2StoreFor(agentId).active(),
        topFacts,
      });
      setLastDiff(result.changed);
      setConsolidation(consolidationState(agentId));
      setDraft(result.after);
      setSavedFlash(
        `Consolidación: ${result.changed.length ? `cambios en ${result.changed.join(', ')}` : 'sin cambios'}.`,
      );
    } catch (error) {
      setConsolidationError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setConsolidationBusy(false);
      refresh();
    }
  };

  const doRollback = (snapshotId: string) => {
    const restored = store.rollback(agentId, snapshotId);
    if (restored) {
      setDraft(restored);
      setSavedFlash('Perfil restaurado a la versión anterior.');
      refresh();
    }
  };

  const snapshots = store.snapshots(agentId);
  const charCount = draft.promptBaseText.length;

  return (
    <div className="l1-panel">
      <div className="surface-header">
        <div>
          <span className="section-kicker">L3 · PERSONA COMPILER</span>
          <h3>Perfil de agente y System Prompt</h3>
        </div>
        <span className="surface-badge">
          {draft.personaName} · {draft.vertical} · γ{' '}
          {draft.emotionalInertiaGamma.toFixed(2)}
        </span>
      </div>

      <div className="l3-grid">
        <section className="l2-section">
          <div className="cognitive-section-heading">
            <span className="section-kicker">PERSONA DESIGNER</span>
            <span className="panel-caption">PERFIL L3 DEL AGENTE</span>
          </div>
          <div className="l3-form">
            <label className="l3-field">
              <span>Nombre de la persona</span>
              <input
                value={draft.personaName}
                onChange={(event) =>
                  updateDraft({ personaName: event.target.value })
                }
              />
            </label>
            <label className="l3-field">
              <span>Vertical</span>
              <select
                value={draft.vertical}
                onChange={(event) =>
                  updateDraft({ vertical: event.target.value as Vertical })
                }
              >
                {VERTICALS.map((vertical) => (
                  <option key={vertical} value={vertical}>
                    {vertical}
                  </option>
                ))}
              </select>
            </label>
            <label className="l3-field">
              <span>Alineamiento moral</span>
              <input
                value={draft.moralAlignment}
                onChange={(event) =>
                  updateDraft({ moralAlignment: event.target.value })
                }
                placeholder="neutral / lawful-good / …"
              />
            </label>
            <label className="l3-field">
              <span>Descripción</span>
              <textarea
                rows={2}
                value={draft.description}
                onChange={(event) =>
                  updateDraft({ description: event.target.value })
                }
              />
            </label>

            <div className="l3-subheading">VAD BASELINE (−1.0 a +1.0)</div>
            <VadSlider
              label="Valencia"
              value={draft.baselineVad.valence}
              onChange={(value) =>
                updateDraft({
                  baselineVad: { ...draft.baselineVad, valence: value },
                })
              }
            />
            <VadSlider
              label="Arousal"
              value={draft.baselineVad.arousal}
              onChange={(value) =>
                updateDraft({
                  baselineVad: { ...draft.baselineVad, arousal: value },
                })
              }
            />
            <VadSlider
              label="Dominancia"
              value={draft.baselineVad.dominance}
              onChange={(value) =>
                updateDraft({
                  baselineVad: { ...draft.baselineVad, dominance: value },
                })
              }
            />

            <label className="l3-field">
              <span>
                Inercia emocional (γ) · 0.01–0.99 — a mayor γ, más rápido vuelve
                el estado emocional al baseline
              </span>
              <input
                type="range"
                min={0.01}
                max={0.99}
                step={0.01}
                value={draft.emotionalInertiaGamma}
                onChange={(event) =>
                  updateDraft({
                    emotionalInertiaGamma: Number(event.target.value),
                  })
                }
              />
              <code>{draft.emotionalInertiaGamma.toFixed(2)}</code>
            </label>

            <div className="l3-subheading">REGLAS ÉTICAS</div>
            <form className="l2-manual-form" onSubmit={addRule}>
              <input
                value={ruleDraft}
                onChange={(event) => setRuleDraft(event.target.value)}
                placeholder="Ej: No mentirás sobre precios"
                aria-label="Nueva regla ética"
              />
              <button
                className="memory-action"
                type="submit"
                disabled={!ruleDraft.trim()}
              >
                Añadir
              </button>
            </form>
            {draft.ethicsRules.length ? (
              <ul className="l3-rules">
                {draft.ethicsRules.map((rule, index) => (
                  <li key={index}>
                    <span>{rule}</span>
                    <button
                      type="button"
                      className="memory-action memory-action-danger"
                      onClick={() =>
                        updateDraft({
                          ethicsRules: draft.ethicsRules.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <label className="l3-field">
              <span>Texto base del prompt · {charCount} caracteres</span>
              <textarea
                rows={4}
                value={draft.promptBaseText}
                onChange={(event) =>
                  updateDraft({ promptBaseText: event.target.value })
                }
                placeholder="Describe la identidad, el tono y las prioridades de Neura…"
              />
            </label>

            <div className="l1-actions">
              <button
                className="button-primary"
                type="button"
                onClick={saveProfile}
              >
                Guardar perfil
              </button>
              <button
                className="memory-action"
                type="button"
                onClick={duplicateProfile}
              >
                Duplicar perfil
              </button>
              <button
                className="memory-action memory-action-danger"
                type="button"
                onClick={deleteProfile}
              >
                Eliminar
              </button>
              {savedFlash ? (
                <span className="l1-note">{savedFlash}</span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="l3-column">
          <section className="l2-section">
            <div className="cognitive-section-heading">
              <span className="section-kicker">COMPILAR PROMPT</span>
              <span className="panel-caption">
                BUDGET ≤ {PROMPT_BUDGET} TOKENS
              </span>
            </div>
            <div className="l1-actions">
              <button
                className="button-primary"
                type="button"
                onClick={() => void compile()}
              >
                Compilar System Prompt
              </button>
            </div>
            {compileNote ? <p className="l1-note">{compileNote}</p> : null}
            {compiled ? (
              <>
                <div
                  className="l3-color-swatch"
                  style={{ background: compiled.colorHex }}
                />
                <PromptPreview compiled={compiled} />
              </>
            ) : (
              <p className="memory-search-empty">
                Compila para ver el prompt con [PERFIL BASE L3], [VAD ACTUAL +
                COLOR HEX], [ESCENARIO L2 ACTIVO] y [TOP-3 HECHOS L1]. Los
                hechos L1 se recortan automáticamente si el total supera{' '}
                {PROMPT_BUDGET} tokens.
              </p>
            )}
          </section>

          <section className="l2-section">
            <div className="cognitive-section-heading">
              <span className="section-kicker">TEST CON LLM REAL</span>
              <span className="panel-caption">
                STREAMING · MÉTRICAS · HISTORIAL
              </span>
            </div>
            <textarea
              rows={2}
              value={testMessage}
              onChange={(event) => setTestMessage(event.target.value)}
              placeholder='User message (ej: "¿Cuánto cuesta la poción?")'
            />
            <div className="l1-actions">
              <button
                className="button-primary"
                type="button"
                onClick={() => void runTest()}
                disabled={testBusy || !compiled}
              >
                {testBusy ? 'Enviando…' : 'Enviar al LLM'}
              </button>
            </div>
            {testError ? <p className="l1-error">{testError}</p> : null}
            {testOutput ? (
              <div className="l3-test-output">
                <p>{testOutput}</p>
                {testMetrics ? (
                  <small>
                    prompt {testMetrics.promptTokens} tok · completion{' '}
                    {testMetrics.completionTokens} tok · {testMetrics.latencyMs}{' '}
                    ms · {testMetrics.model}
                  </small>
                ) : null}
              </div>
            ) : null}
            {testHistory.length ? (
              <div className="l3-test-history">
                <span className="panel-caption">ÚLTIMAS 5 PRUEBAS</span>
                {testHistory.map((record, index) => (
                  <div className="l3-test-record" key={index}>
                    <small>
                      {new Date(record.at).toLocaleTimeString()} · prompt{' '}
                      {record.promptTokens} · completion{' '}
                      {record.completionTokens} · {record.latencyMs} ms
                    </small>
                    <p>{record.preview}…</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="l2-section">
            <div className="cognitive-section-heading">
              <span className="section-kicker">CONSOLIDACIÓN L3</span>
              <span className="panel-caption">
                CRONJOB CADA 6H · DIFF · ROLLBACK
              </span>
            </div>
            <p className="l1-note">
              Última ejecución:{' '}
              {consolidation.lastRunAt
                ? new Date(consolidation.lastRunAt).toLocaleString()
                : 'nunca'}{' '}
              · Próxima: {new Date(consolidation.nextRunAt).toLocaleString()}
            </p>
            <div className="l1-actions">
              <button
                className="button-primary"
                type="button"
                onClick={() => void forceConsolidation()}
                disabled={consolidationBusy}
              >
                {consolidationBusy
                  ? 'Consolidando…'
                  : 'Forzar consolidación ahora'}
              </button>
            </div>
            {consolidationError ? (
              <p className="l1-error">{consolidationError}</p>
            ) : null}
            {lastDiff.length ? (
              <p className="l1-note" role="status">
                Cambios detectados: {lastDiff.join(', ')}
              </p>
            ) : null}
            {snapshots.length ? (
              <div className="l3-snapshots">
                <span className="panel-caption">SNAPSHOTS (ROLLBACK)</span>
                {snapshots.map((snapshot) => (
                  <div className="l3-test-record" key={snapshot.id}>
                    <small>
                      {new Date(snapshot.capturedAt).toLocaleString()} ·{' '}
                      {snapshot.reason}
                    </small>
                    <button
                      type="button"
                      className="memory-action"
                      onClick={() => doRollback(snapshot.id)}
                    >
                      Revertir
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="memory-search-empty">Sin snapshots todavía.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
