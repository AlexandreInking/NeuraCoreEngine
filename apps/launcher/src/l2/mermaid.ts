import { encode } from 'gpt-tokenizer';
import { ROOT_SCENARIO, type L2Node, type L2ToolCall } from './types';

/** Color semantics for Mermaid + SVG: HTTP 2xx green, 4xx yellow, 5xx red; status colors otherwise. */
export function nodeColor(node: L2Node): string {
  const http = node.toolCall?.httpStatus;
  if (http !== undefined) {
    if (http >= 200 && http < 300) return '#2e7d32';
    if (http >= 400 && http < 500) return '#b58900';
    if (http >= 500) return '#c62828';
  }
  switch (node.status) {
    case 'ACTIVE':
      return '#2e7d32';
    case 'CLOSED':
      return '#757575';
    case 'ESCALATED':
      return '#e65100';
    default:
      return '#5c6bc0';
  }
}

export function nodeLabel(node: L2Node): string {
  const status = node.toolCall
    ? `HTTP ${node.toolCall.httpStatus}`
    : node.status;
  return `${node.name}: ${status}`;
}

function quote(label: string) {
  return `"${label.replace(/"/g, "'")}"`;
}

/** Hito 4.3 — generate the Mermaid `graph TD` string from L2 nodes. */
export function mermaidForNodes(nodes: L2Node[], rootId = 'ROOT') {
  const lines = ['graph TD'];
  lines.push(`  ${rootId}[${quote(`${ROOT_SCENARIO}`)}]`);
  const classified: string[] = [];
  for (const node of nodes) {
    const id = `S${node.nodeId.replace(/[^A-Za-z0-9]/g, '')}`;
    lines.push(`  ${id}[${quote(nodeLabel(node))}]`);
    if (node.toolCall?.l0EntryId) {
      const fid = `L${node.toolCall.l0EntryId.replace(/[^A-Za-z0-9]/g, '').slice(0, 18)}`;
      lines.push(
        `  ${id} --> ${fid}[${quote('l0:' + node.toolCall.l0EntryId.slice(0, 22))}]`,
      );
    }
    for (const factId of node.linkedFactIds) {
      const fid = `F${factId.replace(/[^A-Za-z0-9]/g, '').slice(0, 18)}`;
      lines.push(`  ${id} --> ${fid}[${quote('fact:' + factId.slice(0, 24))}]`);
    }
    lines.push(`  ${rootId} --> ${id}`);
    classified.push(id);
  }
  if (classified.length) {
    lines.push('  classDef ok fill:#2e7d32,color:#fff');
    lines.push('  classDef warn fill:#b58900,color:#fff');
    lines.push('  classDef err fill:#c62828,color:#fff');
    lines.push(`  class ${classified.join(',')} ok`);
  }
  return lines.join('\n');
}

/** Hito 4.4 — estimated token reduction of raw JSON tool-call logs vs Mermaid. */
export function estimateTokenReduction(toolCalls: L2ToolCall[]) {
  const rawJson = JSON.stringify(
    toolCalls.map((call) => ({
      name: call.name,
      httpStatus: call.httpStatus,
      result: call.result,
      timestamp: Date.now(),
      l0EntryId: call.l0EntryId ?? null,
    })),
    null,
    2,
  );
  const nodes = toolCalls.map((call, index) => buildToolCallNode(call, index));
  const mermaid = mermaidForNodes(nodes);
  const rawTokens = encode(rawJson).length;
  const mermaidTokens = encode(mermaid).length;
  const saved = rawTokens - mermaidTokens;
  const savedPct =
    rawTokens > 0 ? Math.round((saved / rawTokens) * 1000) / 10 : 0;
  return {
    rawTokens,
    mermaidTokens,
    saved,
    savedPct,
    mermaid,
  };
}

export function buildToolCallNode(
  call: L2ToolCall,
  index: number,
  now = Date.now(),
): L2Node {
  return {
    nodeId: `TOOL_${index + 1}`,
    parentScenario: ROOT_SCENARIO,
    name: call.name,
    status: call.httpStatus >= 500 ? 'ESCALATED' : 'ACTIVE',
    linkedFactIds: [],
    createdAt: now,
    updatedAt: now,
    toolCall: call,
  };
}

export function countTokens(text: string) {
  return encode(text).length;
}
