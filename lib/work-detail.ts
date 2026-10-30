export type WorkLink = {
  id: string;
  chatId: string;
  agentName: string;
  status: string;
};

/** A read-only view of one durable run, not another independently mutable task. */
export type WorkDetail = {
  id: string;
  status: string;
  agent: { id: string; name: string };
  conversation: { id: string; title: string; canContinue: boolean; pod?: { id: string; name: string } };
  request: { content: string; source: "snapshot" | "conversation" | "unavailable" };
  result: { content: string; sources: string[]; error: boolean; demo: boolean } | null;
  pending: { id: string; tool: string; input: unknown }[];
  trace: { tool: string; status: string; input?: unknown; output?: unknown }[];
  evidenceTruncated: boolean;
  evidenceRedacted: boolean;
  approvalPreviewComplete: boolean;
  usage?: { input: number; output: number };
  error?: string;
  createdAt: string;
  updatedAt: string;
  reviewed: boolean;
  parent: WorkLink | null;
  children: WorkLink[];
};
