export const APPROVAL_PLACEHOLDER = "Review the proposed tool calls below to continue.";

/** Join streamed phases while removing the temporary approval-only notice. */
export function combineRunMessage(previous: string, next: string, wasAwaitingApproval: boolean): string {
  const prior = wasAwaitingApproval && previous === APPROVAL_PLACEHOLDER ? "" : previous;
  return [prior, next].filter(Boolean).join("\n\n");
}
