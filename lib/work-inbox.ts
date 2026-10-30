export type WorkInboxItem = {
  id: string;
  chatId: string;
  title: string;
  agentName: string;
  agentId: string;
  podId?: string;
  podName?: string;
  status: string;
  updatedAt: string;
  pendingCount: number;
  error?: string;
  reviewed: boolean;
};
export type WorkInboxData = { items: WorkInboxItem[]; limit: number };
export type WorkFilter = "attention" | "working" | "finished" | "all";
export function inWorkFilter(item: WorkInboxItem, filter: WorkFilter) {
  if (filter === "attention")
    return (
      !item.reviewed && ["awaiting_approval", "failed"].includes(item.status)
    );
  if (filter === "working") return ["queued", "running"].includes(item.status);
  if (filter === "finished")
    return ["completed", "cancelled"].includes(item.status);
  return true;
}
export function workStatus(status: string) {
  return (
    (
      {
        awaiting_approval: "Needs approval",
        failed: "Needs attention",
        queued: "Queued",
        running: "Working",
        completed: "Finished",
        cancelled: "Stopped",
      } as Record<string, string>
    )[status] || status
  );
}
