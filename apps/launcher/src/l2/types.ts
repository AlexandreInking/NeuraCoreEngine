export type L2Status = 'ACTIVE' | 'CLOSED' | 'ESCALATED';

export type L2ToolCall = {
  name: string;
  httpStatus: number;
  result: string;
  l0EntryId?: string;
};

export type L2Node = {
  nodeId: string;
  parentScenario: string; // 'ROOT_GAMING_NPC' or another nodeId
  name: string;
  status: L2Status;
  linkedFactIds: string[];
  createdAt: number;
  updatedAt: number;
  toolCall?: L2ToolCall;
  manual?: boolean;
};

export const ROOT_SCENARIO = 'ROOT_GAMING_NPC';

export const L2_STATUSES: L2Status[] = ['ACTIVE', 'CLOSED', 'ESCALATED'];
