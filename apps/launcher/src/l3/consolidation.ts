import type { DeepSeekConfig } from '../cognition/deepseek';
import { deepSeekChat } from '../cognition/deepseek';
import type { L2Node } from '../l2/types';
import type { L1Fact } from '../l1/types';
import type { AgentProfile } from './types';
import type { L3ProfileStore } from './store';
import { countTokens } from './compiler';

export type ConsolidationResult = {
  changed: string[];
  before: AgentProfile;
  after: AgentProfile;
  nextRunAt: number;
};

const CONSOLIDATION_INTERVAL_MS = 6 * 3_600_000; // every 6h
const CONSOLIDATION_KEY = 'neuracore-l3-consolidation';

export type ConsolidationState = {
  lastRunAt: number | null;
  nextRunAt: number;
  lastChanged: string[];
};

export function consolidationState(agentId: string): ConsolidationState {
  try {
    const raw = globalThis.localStorage.getItem(
      `${CONSOLIDATION_KEY}:${agentId}`,
    );
    if (!raw)
      return { lastRunAt: null, nextRunAt: Date.now(), lastChanged: [] };
    const parsed = JSON.parse(raw) as Partial<ConsolidationState>;
    return {
      lastRunAt: parsed.lastRunAt ?? null,
      nextRunAt: parsed.nextRunAt ?? Date.now(),
      lastChanged: parsed.lastChanged ?? [],
    };
  } catch {
    return { lastRunAt: null, nextRunAt: Date.now(), lastChanged: [] };
  }
}

function saveState(agentId: string, state: ConsolidationState) {
  try {
    globalThis.localStorage.setItem(
      `${CONSOLIDATION_KEY}:${agentId}`,
      JSON.stringify(state),
    );
  } catch {
    // ignore
  }
}

/**
 * Hito 5.5 — consolidation: regenerate the L3 base text from L2/L1 context
 * via the configured LLM (heuristic fallback), snapshotting before the change.
 */
export async function consolidateProfile(input: {
  agentId: string;
  store: L3ProfileStore;
  config: DeepSeekConfig;
  activeL2Node?: L2Node | null;
  topFacts?: L1Fact[];
}): Promise<ConsolidationResult> {
  const { agentId, store, config, activeL2Node, topFacts = [] } = input;
  const before = store.get(agentId);
  if (!before) throw new Error(`No hay perfil L3 para ${agentId}.`);
  store.pushSnapshot(agentId, 'consolidación');

  const context = [
    `Escenario L2 activo: ${activeL2Node ? `${activeL2Node.name} (${activeL2Node.status})` : 'ninguno'}`,
    ...topFacts.map(
      (fact) =>
        `${fact.subject} ${fact.predicate} ${fact.object} (${fact.certainty})`,
    ),
  ].join('\n');

  let newBaseText = '';
  if (config.apiKey.trim()) {
    try {
      newBaseText = (
        await deepSeekChat(config, [
          {
            role: 'system',
            content:
              'Eres el consolidador de persona de Neura. Reescribe el texto base del perfil del agente (identidad, tono, prioridades) incorporando el contexto actual. Responde solo con el texto base, en español, 3-5 frases.',
          },
          {
            role: 'user',
            content: `Perfil actual:\n${before.promptBaseText || '(vacío)'}\n\nContexto reciente:\n${context}`,
          },
        ])
      ).trim();
    } catch {
      newBaseText = '';
    }
  }
  if (!newBaseText) {
    newBaseText = `Neura es ${before.personaName}, un agente en ${before.vertical}. ${
      topFacts.length
        ? `Contexto reciente: ${topFacts
            .slice(0, 3)
            .map((f) => f.object)
            .join('; ')}.`
        : ''
    } Actúa con coherencia, empatía y las reglas éticas de su perfil.`;
  }

  const after: AgentProfile = {
    ...before,
    promptBaseText: newBaseText,
    updatedAt: Date.now(),
  };
  store.upsert(after);

  const changed = diffFields(before, after);
  saveState(agentId, {
    lastRunAt: Date.now(),
    nextRunAt: Date.now() + CONSOLIDATION_INTERVAL_MS,
    lastChanged: changed,
  });

  return {
    changed,
    before,
    after,
    nextRunAt: Date.now() + CONSOLIDATION_INTERVAL_MS,
  };
}

export function diffFields(
  before: AgentProfile,
  after: AgentProfile,
): string[] {
  const changed: string[] = [];
  const keys: Array<keyof AgentProfile> = [
    'personaName',
    'vertical',
    'description',
    'moralAlignment',
    'promptBaseText',
    'ethicsRules',
  ];
  for (const key of keys) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) changed.push(key);
  }
  if (
    JSON.stringify(before.baselineVad) !== JSON.stringify(after.baselineVad)
  ) {
    changed.push('baselineVad');
  }
  if (before.emotionalInertiaGamma !== after.emotionalInertiaGamma) {
    changed.push('emotionalInertiaGamma');
  }
  return changed;
}

export { countTokens };
