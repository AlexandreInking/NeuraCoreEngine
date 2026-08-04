import { cosineSimilarity } from '../l1/store';
import { embedTexts } from '../l1/embedder';
import type { L1Fact } from '../l1/types';
import type { DeepSeekConfig } from '../cognition/deepseek';
import { deepSeekChat } from '../cognition/deepseek';
import { createNodeId, ROOT_SCENARIO } from './store';
import type { L2Node } from './types';

export const CLUSTER_COSINE_THRESHOLD = 0.62;
export const MIN_FACTS_PER_SCENARIO = 3;

export type ClusterResult = {
  created: L2Node[];
  skipped: number;
  message: string;
};

/**
 * Hito 4.2 — semantic clustering: facts with certainty >= threshold that
 * share entities or embedding similarity are grouped; groups of 3+ facts
 * become L2 scenario nodes with an LLM-generated name (heuristic fallback).
 */
export async function clusterFactsIntoScenarios(
  facts: L1Fact[],
  config: DeepSeekConfig,
  existingNodes: L2Node[],
  now = Date.now(),
): Promise<ClusterResult> {
  const candidates = facts.filter((fact) => fact.certainty >= 0.75);
  if (candidates.length < MIN_FACTS_PER_SCENARIO) {
    return {
      created: [],
      skipped: 0,
      message: `Se necesitan al menos ${MIN_FACTS_PER_SCENARIO} hechos con certeza ≥ 75%.`,
    };
  }

  const texts = candidates.map((fact) =>
    `${fact.subject} ${fact.predicate} ${fact.object}`.trim(),
  );
  const vectors = await embedTexts(texts);
  if (!vectors) {
    return {
      created: [],
      skipped: 0,
      message: 'No se pudieron generar embeddings para el clustering.',
    };
  }

  const size = candidates.length;
  const parent = Array.from({ length: size }, (_, index) => index);
  const find = (index: number): number =>
    parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < size; i += 1) {
    for (let j = i + 1; j < size; j += 1) {
      const similar =
        cosineSimilarity(Array.from(vectors[i]), Array.from(vectors[j])) >=
        CLUSTER_COSINE_THRESHOLD;
      const sharesEntity = shareEntity(candidates[i], candidates[j]);
      if (similar || sharesEntity) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < size; i += 1) {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  }

  const created: L2Node[] = [];
  let skipped = 0;
  for (const indices of groups.values()) {
    if (indices.length < MIN_FACTS_PER_SCENARIO) {
      skipped += indices.length;
      continue;
    }
    const groupFacts = indices.map((index) => candidates[index]);
    const factIds = groupFacts.map((fact) => fact.id).sort();
    const already = existingNodes.some(
      (node) =>
        node.linkedFactIds.length === factIds.length &&
        factIds.every((id) => node.linkedFactIds.includes(id)),
    );
    if (already) {
      skipped += groupFacts.length;
      continue;
    }
    const name = await scenarioName(groupFacts, config);
    created.push({
      nodeId: createNodeId('SCENARIO'),
      parentScenario: ROOT_SCENARIO,
      name,
      status: 'ACTIVE',
      linkedFactIds: factIds,
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    created,
    skipped,
    message: created.length
      ? `Creados ${created.length} nodos L2 desde ${created.reduce((sum, n) => sum + n.linkedFactIds.length, 0)} hechos L1 (${skipped} hechos sin grupo).`
      : `Sin nodos nuevos: no hay grupos de ${MIN_FACTS_PER_SCENARIO}+ hechos relacionados.`,
  };
}

function shareEntity(a: L1Fact, b: L1Fact) {
  const entitiesA = entityTokens(a.subject).concat(entityTokens(a.object));
  const entitiesB = entityTokens(b.subject).concat(entityTokens(b.object));
  return entitiesA.some((token) => entitiesB.includes(token));
}

function entityTokens(text: string) {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  return cleaned
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 3);
}

async function scenarioName(
  groupFacts: L1Fact[],
  config: DeepSeekConfig,
): Promise<string> {
  if (config.apiKey.trim()) {
    try {
      const raw = await deepSeekChat(config, [
        {
          role: 'system',
          content:
            'Genera un nombre corto de escenario (máx 5 palabras, en mayúsculas, sin puntuación final) para este grupo de hechos. Responde solo con el nombre.',
        },
        {
          role: 'user',
          content: groupFacts
            .map((fact) => `${fact.subject} ${fact.predicate} ${fact.object}`)
            .join('\n'),
        },
      ]);
      const name = raw
        .trim()
        .replace(/["'.!?]+$/g, '')
        .slice(0, 60);
      if (name.length >= 3) return name.toUpperCase();
    } catch {
      // fall through
    }
  }
  const subjects = groupFacts
    .flatMap((fact) =>
      entityTokens(fact.subject).concat(entityTokens(fact.object)),
    )
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const token of subjects) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const topic =
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'CONTEXTO';
  return `ESCENARIO_${topic.toUpperCase().replace(/\s+/g, '_').slice(0, 24)}`;
}
