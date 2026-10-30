/** Private summaries only; no source messages are returned by the history index. */
export type ConversationIndexItem = {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  podId?: string;
  podName?: string;
  updatedAt: string;
  messageCount: number;
};
export type ConversationIndexPage = {
  items: ConversationIndexItem[];
  nextCursor: string | null;
};
