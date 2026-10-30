import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { records, runs } from "@/db/schema";
import type { WorkDetail, WorkLink } from "@/lib/work-detail";
import { AppError, type WorkspaceUser } from "./http";
import { readConversationAccess, requireCurrentMembership } from "./conversation-access";

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function text(value: unknown, max = 160000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function snapshotRequest(messages: unknown): string | null {
  for (const entry of array(messages).toReversed()) {
    const message = object(entry);
    if (message.role !== "user") continue;
    if (typeof message.content === "string") return text(message.content);
    const parts = array(message.content).map(object).filter(part => part.type === "text" && typeof part.text === "string");
    return parts.length ? text(parts.map(part => part.text).join("\n")) : null;
  }
  return null;
}

/** Tool evidence is private, but display must not echo connector credentials. */
function evidenceReader() {
  let remaining = 48000, nodes = 600, truncated = false, redacted = false;
  const credentials = /^(?:authorization|proxyauthorization|cookie|setcookie|password|passwd|secret|secretkey|clientsecret|apikey|xapikey|token|accesstoken|refreshtoken|idtoken|sessionid|sessiontoken|credential|credentials|ciphertext)$/i;
  const scrub = (value: unknown, depth = 0): unknown => {
    if (--nodes < 0 || remaining <= 0 || depth > 6) { truncated = true; return "[Additional evidence omitted]"; }
    if (typeof value === "string") {
      if (value.length > 48000 && /^[\s]*[\[{]/.test(value)) {
        truncated = true;
        return "[Structured evidence exceeds the preview limit]";
      }
      if (value.length <= 48000 && /^[\s]*[\[{]/.test(value)) {
        try { return scrub(JSON.parse(value), depth + 1); } catch { /* Ordinary tool text. */ }
      }
      let clean = value.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/gi, "$1 [redacted]")
        .replace(/\b(?:sk-(?:proj-|ant-)?|sk_scribe_|ghp_|github_pat_|ak_)[A-Za-z0-9_-]{16,}/g, "[redacted]");
      if (clean !== value) redacted = true;
      if (clean.length > remaining) { clean = clean.slice(0, remaining) + "\n[Additional evidence omitted]"; truncated = true; }
      remaining -= clean.length;
      return clean;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") return value;
    if (Array.isArray(value)) {
      if (value.length > 50) truncated = true;
      return value.slice(0, 50).map(item => scrub(item, depth + 1));
    }
    if (value && typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length > 50) truncated = true;
      return Object.fromEntries(entries.slice(0, 50).map(([key, item]) => {
        remaining -= key.length;
        if (credentials.test(key.replace(/[-_\s]/g, ""))) { redacted = true; return [key, "[redacted]"]; }
        return [key, scrub(item, depth + 1)];
      }));
    }
    return null;
  };
  return { scrub, isTruncated: () => truncated, isRedacted: () => redacted };
}

async function ownedRun(u: WorkspaceUser, id: string) {
  const [run] = await getDb().select().from(runs).where(and(eq(runs.id, id),
    eq(runs.organizationId, u.organizationId), eq(runs.createdBy, u.userId))).limit(1);
  return run;
}
async function permittedLink(u: WorkspaceUser, run: typeof runs.$inferSelect): Promise<WorkLink | null> {
  try { await readConversationAccess(u, run.chatId); }
  catch (error) {
    if (error instanceof AppError && [403, 404].includes(error.status)) return null;
    throw error;
  }
  return { id: run.id, chatId: run.chatId, agentName: text(object(object(run.payload).agent).name, 200) || "Agent", status: run.status };
}

export async function readWorkDetail(u: WorkspaceUser, id: string): Promise<WorkDetail> {
  if (!id || id.length > 200) throw new AppError(400, "Choose a valid work item.");
  await requireCurrentMembership(u);
  const run = await ownedRun(u, id);
  if (!run) throw new AppError(404, "Work item not found.");
  const { chat, pod } = await readConversationAccess(u, run.chatId);
  const payload = object(run.payload), messages = array(object(chat).messages).map(object);
  const resultIndex = messages.findLastIndex(message => message.role === "assistant" && message.runId === run.id);
  const message = resultIndex >= 0 ? messages[resultIndex] : null;
  const original = snapshotRequest(payload.messages);
  const previous = resultIndex > 0 ? messages[resultIndex - 1] : null;
  const fallback = previous?.role === "user" && typeof previous.content === "string" ? text(previous.content) : null;
  const request: WorkDetail["request"] = original !== null
    ? { content: original, source: "snapshot" }
    : fallback !== null ? { content: fallback, source: "conversation" } : { content: "", source: "unavailable" };
  const evidence = evidenceReader();
  const rawPending = run.status === "awaiting_approval" ? array(payload.pending) : [];
  const pending = rawPending.slice(0, 50).map(object).filter(item => typeof item.id === "string" && item.id.length > 0 && item.id.length <= 200 && typeof item.tool === "string" && item.tool.length > 0 && item.tool.length <= 200)
    .map(item => ({ id: text(item.id, 200), tool: text(item.tool, 200), input: evidence.scrub(item.input) }));
  const approvalPreviewComplete = run.status !== "awaiting_approval" ||
    (pending.length > 0 && pending.length === rawPending.length && !evidence.isTruncated());
  const trace = array(payload.trace ?? message?.trace).slice(0, 100).map(object)
    .filter(item => typeof item.tool === "string" && typeof item.status === "string")
    .map(item => ({ tool: text(item.tool, 200), status: text(item.status, 100),
      ...(item.input === undefined ? {} : { input: evidence.scrub(item.input) }),
      ...(item.output === undefined ? {} : { output: evidence.scrub(item.output) }),
    }));
  const [review] = await getDb().select({ data: records.data }).from(records).where(and(
    eq(records.organizationId, u.organizationId), eq(records.createdBy, u.userId),
    eq(records.kind, "run-review"), eq(records.id, "run-review:" + id),
  )).limit(1);
  const parentId = text(payload.parentRunId, 200);
  const parentRun = parentId ? await ownedRun(u, parentId) : undefined;
  const parent = parentRun ? await permittedLink(u, parentRun) : null;
  const candidates = await getDb().select().from(runs).where(and(
    eq(runs.organizationId, u.organizationId), eq(runs.createdBy, u.userId),
    sql`${runs.payload}->>'parentRunId' = ${run.id}`,
  )).orderBy(asc(runs.createdAt), asc(runs.id)).limit(20);
  const children: WorkLink[] = [];
  for (const child of candidates) {
    const link = await permittedLink(u, child);
    if (link) children.push(link);
  }
  const usage = object(payload.usage ?? message?.usage);
  const safeError = typeof payload.error === "string" ? text(evidence.scrub(payload.error), 4000) : undefined;
  const { findAgent } = await import("./runtime");
  const currentAgent = await findAgent(u.organizationId, run.agentId).catch(() => null);
  const canContinue = !!currentAgent && !currentAgent.archived && !pod?.archived;
  // Revalidate the main source after the related-item reads; a stale owner role grants no content access.
  await readConversationAccess(u, run.chatId);
  return {
    id: run.id, status: run.status,
    agent: { id: run.agentId, name: text(object(payload.agent).name, 200) || text(message?.agentName, 200) || "Agent" },
    conversation: { id: run.chatId, title: text(chat.title, 500) || "Conversation", canContinue, ...(pod ? { pod: { id: pod.id, name: text(pod.name, 200) || "Project" } } : {}) },
    request,
    result: message && typeof message.content === "string" ? {
      content: text(message.content), sources: array(message.sources).filter((source): source is string => typeof source === "string").slice(0, 50).map(source => text(source, 2000)),
      error: message.error === true, demo: message.demo === true,
    } : null,
    pending, trace, evidenceTruncated: evidence.isTruncated() || rawPending.length > 50 || array(payload.trace ?? message?.trace).length > 100,
    evidenceRedacted: evidence.isRedacted(), approvalPreviewComplete,
    ...(typeof usage.input === "number" && Number.isFinite(usage.input) && usage.input >= 0 && typeof usage.output === "number" && Number.isFinite(usage.output) && usage.output >= 0
      ? { usage: { input: usage.input, output: usage.output } } : {}),
    ...(safeError === undefined ? {} : { error: safeError }),
    createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString(),
    reviewed: object(review?.data).runUpdatedAt === run.updatedAt.toISOString(), parent, children,
  };
}
