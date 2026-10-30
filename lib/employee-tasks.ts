export type EmployeeTask = {
  podId?:string;
  id: string;
  agentId: string;
  title: string;
  prompt: string;
  status: "todo" | "done";
  createdAt: string;
  updatedAt: string;
  chatId?: string;
  runId?: string;
  runStatus?: string;
};
export function taskStatus(task: EmployeeTask) {
  if (task.status === "done") return "completed";
  if (task.runStatus === "awaiting_approval") return "needs_approval";
  if (["queued", "running", "failed"].includes(task.runStatus || ""))
    return task.runStatus!;
  if (task.runStatus === "completed") return "completed";
  return "todo";
}
