import { encode } from 'gpt-tokenizer';
import type { AgentProfile, Vad } from './types';
import type { L2Node } from '../l2/types';
import type { L1Fact } from '../l1/types';

export const PROMPT_BUDGET = 800;
export const PROMPT_GREEN = 600;
export const PROMPT_YELLOW = 750;

export type PromptSection = {
  id: string;
  label: string;
  content: string;
  tokens: number;
  color: string;
};

export type CompiledPrompt = {
  prompt: string;
  sections: PromptSection[];
  totalTokens: number;
  budgetStatus: 'green' | 'yellow' | 'red';
  trimmedFacts: number;
  colorHex: string;
};

/** Map VAD → hex color (hue: valence high=green, low=red; arousal modulates). */
export function vadColor(vad: Vad): string {
  const hue = Math.max(
    0,
    Math.min(360, 145 - vad.valence * 110 - vad.arousal * 25),
  );
  return `hsl(${Math.round(hue)}, 65%, 45%)`;
}

export function countTokens(text: string) {
  return encode(text).length;
}

const SECTION_COLORS = {
  profile: '#5c6bc0',
  vad: '#8e24aa',
  scenario: '#2e7d32',
  facts: '#b58900',
};

/**
 * Hito 5.3 — compile the L3 system prompt with a hard ≤800-token budget:
 * [PERFIL BASE L3] [VAD ACTUAL + COLOR HEX] [ESCENARIO L2 ACTIVO] [TOP-3 HECHOS L1].
 * If the budget is exceeded, L1 facts are trimmed from lowest score first.
 */
export function compileSystemPrompt(input: {
  profile: AgentProfile;
  vad?: Vad | null;
  activeL2Node?: L2Node | null;
  topL1Facts?: L1Fact[];
}): CompiledPrompt {
  const { profile, vad, activeL2Node, topL1Facts = [] } = input;
  const colorHex = vad ? vadColor(vad) : '#5c6bc0';

  const profileContent = [
    `PERFIL BASE L3 — ${profile.personaName}`,
    `Tenant: ${profile.tenantId} · Vertical: ${profile.vertical}`,
    profile.description ? `Descripción: ${profile.description}` : null,
    `Alineamiento moral: ${profile.moralAlignment}`,
    `Inercia emocional (γ): ${profile.emotionalInertiaGamma}`,
    ...profile.ethicsRules.map((rule) => `Regla ética: ${rule}`),
    profile.promptBaseText ? `Texto base: ${profile.promptBaseText}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const vadContent = vad
    ? `VAD ACTUAL: Valencia ${vad.valence.toFixed(2)} · Arousal ${vad.arousal.toFixed(2)} · Dominancia ${vad.dominance.toFixed(2)}\nColor emocional: ${colorHex}`
    : `VAD ACTUAL: baseline ${profile.baselineVad.valence.toFixed(2)}, ${profile.baselineVad.arousal.toFixed(2)}, ${profile.baselineVad.dominance.toFixed(2)}\nColor emocional: ${colorHex}`;

  const scenarioContent = activeL2Node
    ? `ESCENARIO L2 ACTIVO: ${activeL2Node.name} (${activeL2Node.status})\nHechos vinculados: ${activeL2Node.linkedFactIds.length}`
    : 'ESCENARIO L2 ACTIVO: (ninguno)';

  const factsContent = topL1Facts.length
    ? topL1Facts
        .map(
          (fact) =>
            `- [${fact.certainty.toFixed(2)}] ${fact.subject} ${fact.predicate} ${fact.object}`,
        )
        .join('\n')
    : '- (sin hechos L1 relevantes)';

  const sections: PromptSection[] = [
    {
      id: 'profile',
      label: 'PERFIL BASE L3',
      content: profileContent,
      tokens: 0,
      color: SECTION_COLORS.profile,
    },
    {
      id: 'vad',
      label: 'VAD ACTUAL',
      content: vadContent,
      tokens: 0,
      color: SECTION_COLORS.vad,
    },
    {
      id: 'scenario',
      label: 'ESCENARIO L2 ACTIVO',
      content: scenarioContent,
      tokens: 0,
      color: SECTION_COLORS.scenario,
    },
    {
      id: 'facts',
      label: 'TOP-3 HECHOS L1',
      content: factsContent,
      tokens: 0,
      color: SECTION_COLORS.facts,
    },
  ];

  let trimmedFacts = 0;
  let factsSlice = topL1Facts;

  // Trim L1 facts from lowest score until the total fits the budget.
  for (let attempts = 0; attempts < 8; attempts += 1) {
    sections[3].content = factsSlice.length
      ? factsSlice
          .map(
            (fact) =>
              `- [${fact.certainty.toFixed(2)}] ${fact.subject} ${fact.predicate} ${fact.object}`,
          )
          .join('\n')
      : '- (sin hechos L1 relevantes)';
    sections.forEach((section) => {
      section.tokens = countTokens(section.content);
    });
    const total = sections.reduce((sum, section) => sum + section.tokens, 0);
    if (total <= PROMPT_BUDGET || factsSlice.length === 0) {
      trimmedFacts = topL1Facts.length - factsSlice.length;
      const prompt = sections.map((section) => section.content).join('\n\n');
      return {
        prompt,
        sections,
        totalTokens: total,
        budgetStatus:
          total < PROMPT_GREEN
            ? 'green'
            : total <= PROMPT_YELLOW
              ? 'yellow'
              : 'red',
        trimmedFacts,
        colorHex,
      };
    }
    factsSlice = factsSlice.slice(0, Math.max(0, factsSlice.length - 1));
  }

  // Absolute fallback: truncate profile text base.
  sections[0].content = profileContent.slice(0, 1200);
  sections.forEach((section) => {
    section.tokens = countTokens(section.content);
  });
  const total = sections.reduce((sum, section) => sum + section.tokens, 0);
  return {
    prompt: sections.map((section) => section.content).join('\n\n'),
    sections,
    totalTokens: total,
    budgetStatus: total <= PROMPT_YELLOW ? 'yellow' : 'red',
    trimmedFacts,
    colorHex,
  };
}
