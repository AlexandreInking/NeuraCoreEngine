import { ROOT_SCENARIO, type L2Node, type L2Status } from './types';

/**
 * Seam for the L2 scenario graph (Neo4j semantics, local-first).
 * A future Neo4j adapter can implement the same interface via its HTTP
 * transaction API; the UI only depends on this contract.
 */
export interface L2Store {
  readonly agentId: string;
  upsert(node: L2Node): void;
  remove(nodeId: string): void;
  get(nodeId: string): L2Node | null;
  all(): L2Node[];
  count(): number;
  setStatus(nodeId: string, status: L2Status): void;
  /** Most recently updated ACTIVE node (the current scenario). */
  active(): L2Node | null;
}

type PersistedL2 = {
  agentId: string;
  nodes: L2Node[];
};

const STORAGE_PREFIX = 'neuracore-l2:';

function createNodeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 10_000).toString(36)}`.toUpperCase();
}

export class LocalL2Store implements L2Store {
  readonly agentId: string;
  private nodes: L2Node[];

  constructor(agentId: string) {
    this.agentId = agentId;
    const persisted = this.readPersisted();
    this.nodes = persisted?.nodes ?? [];
  }

  private readPersisted(): PersistedL2 | null {
    try {
      const raw = globalThis.localStorage.getItem(
        STORAGE_PREFIX + this.agentId,
      );
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedL2;
      if (parsed && parsed.agentId === this.agentId) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  private save() {
    try {
      globalThis.localStorage.setItem(
        STORAGE_PREFIX + this.agentId,
        JSON.stringify({
          agentId: this.agentId,
          nodes: this.nodes,
        } satisfies PersistedL2),
      );
    } catch {
      // storage unavailable; graph stays in-memory
    }
  }

  upsert(node: L2Node) {
    const index = this.nodes.findIndex((item) => item.nodeId === node.nodeId);
    if (index >= 0) {
      this.nodes[index] = node;
    } else {
      this.nodes.push(node);
    }
    this.save();
  }

  remove(nodeId: string) {
    this.nodes = this.nodes.filter((node) => node.nodeId !== nodeId);
    this.save();
  }

  get(nodeId: string) {
    return this.nodes.find((node) => node.nodeId === nodeId) ?? null;
  }

  all() {
    return [...this.nodes];
  }

  count() {
    return this.nodes.length;
  }

  setStatus(nodeId: string, status: L2Status) {
    this.nodes = this.nodes.map((node) =>
      node.nodeId === nodeId
        ? { ...node, status, updatedAt: Date.now() }
        : node,
    );
    this.save();
  }

  active() {
    const actives = this.nodes
      .filter((node) => node.status === 'ACTIVE')
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return actives[0] ?? null;
  }
}

const instances = new Map<string, L2Store>();

export function l2StoreFor(agentId: string): L2Store {
  let store = instances.get(agentId);
  if (!store) {
    store = new LocalL2Store(agentId);
    instances.set(agentId, store);
  }
  return store;
}

export { createNodeId, ROOT_SCENARIO };
