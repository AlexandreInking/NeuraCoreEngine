/** Multi-tenant key namespacing (hito 9.3): every storage key is scoped
 * to the tenant so tenants never see each other's memories. */
export function namespacedKey(tenantId: string, key: string): string {
  return `${tenantId}:${key}`;
}

export function namespacedAgentId(tenantId: string, agentId: string): string {
  return `${tenantId}:${agentId}`;
}

/** Human-readable namespace summary for the admin panel. */
export function namespacesOf(tenantId: string): string[] {
  const known = ['l0', 'l1', 'l2', 'l3', 'vad-history', 'chats'];
  return known.map((kind) => namespacedKey(tenantId, kind));
}
