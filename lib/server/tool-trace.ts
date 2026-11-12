/** Match persisted tool outcomes to their originating trace without copying private output. */
type Trace = { tool: string; status: string; toolCallId?: string; input?: unknown; output?: unknown };
type Part = Record<string, unknown>;
const object = (value: unknown): Part => value && typeof value === "object" && !Array.isArray(value) ? value as Part : {};
export function reconcileToolTrace(trace: Trace[], messages: unknown): Trace[] {
  const copy = trace.map(item => ({...item}));
  const parts = Array.isArray(messages) ? messages.flatMap(message => {
    const content = object(message).content;
    return Array.isArray(content) ? content.map(object) : [];
  }) : [];
  const results = parts.filter(part => part.type === "tool-result" && typeof part.toolName === "string");
  for (const item of copy) {
    if (item.status !== "running") continue;
    const calls = parts.filter(part => part.type === "tool-call" && part.toolName === item.tool && typeof part.toolCallId === "string");
    const callId = item.toolCallId || (calls.length === 1 && copy.filter(entry => entry.tool === item.tool).length === 1 ? calls[0].toolCallId : undefined);
    const approval = parts.find(part => part.type === "tool-approval-request" && part.toolCallId === callId && typeof part.approvalId === "string");
    if (callId && approval && parts.some(part => part.type === "tool-approval-response" && part.approvalId === approval.approvalId && part.approved === false)) {
      item.status = "denied";
      continue;
    }
    const matching = results.filter(result => result.toolName === item.tool && (item.toolCallId ? result.toolCallId === item.toolCallId : true));
    // Old traces have no call ID. Only reconcile when a name identifies a single call and result.
    if (matching.length !== 1 || (!item.toolCallId && (copy.filter(entry => entry.tool === item.tool).length !== 1 || calls.length !== 1 || matching[0].toolCallId !== calls[0].toolCallId))) continue;
    const output = object(matching[0].output);
    const value = object(output.value);
    const data = object(value.data);
    const failed = output.type === "error-text" || output.type === "error-json" || value.successful === false;
    item.status = failed ? "failed" : typeof data.error_count === "number" && data.error_count > 0 ? "partial" : "completed";
  }
  return copy;
}
