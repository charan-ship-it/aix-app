import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { EventType, type BaseEvent, type StateSnapshotEvent, type MessagesSnapshotEvent, type ToolCallStartEvent } from "@ag-ui/core";
import { EventSchema } from "@ag-ui/core/schemas";
import { EventEncoder } from "@ag-ui/encoder";
import { getDb, getSql } from "../db";
import { member, organization, records, runs, user } from "../db/schema";
import { openAGUIRunEventStream, prepareAGUIObserver } from "../lib/server/ag-ui";
import { getRedis } from "../lib/server/redis";
import type { WorkspaceUser } from "../lib/server/http";

try { process.loadEnvFile(); } catch {}
// Test-only Redis database: fixture streams never dispatch to the live worker.
const redisUrl = new URL(process.env.REDIS_URL!); redisUrl.pathname = "/11"; process.env.REDIS_URL = redisUrl.toString();
const db = getDb(), sql = getSql(), stamp = crypto.randomUUID();
const org = `agui-org-${stamp}`, actorId = `agui-user-${stamp}`, ownerId = `agui-owner-${stamp}`;
const actor: WorkspaceUser = { userId: actorId, organizationId: org, organizationName: "AG-UI synthetic", displayName: "AG-UI fixture", email: `${actorId}@example.invalid`, role: "member" };
const podId = crypto.randomUUID(), runIds: string[] = [];
const input = (chatId: string, extra: object = {}) => ({ threadId: chatId, runId: `observation-${crypto.randomUUID()}`, messages: [], state: {}, tools: [], context: [], ...extra });
async function fixture(status = "completed", pod = false) {
  const runId = crypto.randomUUID(), chatId = crypto.randomUUID(); runIds.push(runId);
  const payload = { agent: { id: "research", name: "Synthetic agent", instructions: "PRIVATE_AGENT_INSTRUCTIONS" }, messages: [{ role: "user", content: "Canonical request" }], pending: [], trace: [], sessionId: "PRIVATE_SESSION_ID" };
  await db.insert(records).values({ id: chatId, organizationId: org, createdBy: actorId, kind: "chat", data: { id: chatId, title: "Synthetic AG-UI fixture", agentId: "research", ...(pod ? { podId } : {}), messages: [{ role: "user", content: "Canonical request" }, ...(status === "completed" ? [{ role: "assistant", runId, content: "Canonical saved result", demo: true }] : [])], updatedAt: new Date().toISOString() } });
  await db.insert(runs).values({ id: runId, organizationId: org, createdBy: actorId, chatId, agentId: "research", status, payload });
  return { runId, chatId, payload };
}
async function collect(events: AsyncGenerator<BaseEvent>) {
  const result: BaseEvent[] = [];
  for await (const next of events) { EventSchema.parse(next); result.push(next); }
  return result;
}
async function emit(id: string, value: unknown) { return getRedis().xadd(`run-events:${id}`, "*", "data", JSON.stringify(value)); }
before(async () => {
  for (const id of [actorId, ownerId]) await db.insert(user).values({ id, name: "AG-UI synthetic", email: `${id}@example.invalid` });
  await db.insert(organization).values({ id: org, name: "AG-UI synthetic", slug: org });
  for (const [id, role] of [[actorId, "member"], [ownerId, "owner"]]) await db.insert(member).values({ id: crypto.randomUUID(), organizationId: org, userId: id, role });
  await db.insert(records).values({ id: podId, organizationId: org, createdBy: ownerId, kind: "pod", data: { id: podId, name: "Synthetic project", access: "organization" } });
});
after(async () => {
  for (const id of runIds) await getRedis().del(`run-events:${id}`, `run-cancel:${id}`);
  await db.delete(organization).where(eq(organization.id, org));
  for (const id of [actorId, ownerId]) await db.delete(user).where(eq(user.id, id));
  await getRedis().quit(); await sql.end();
});

test("AG-UI terminal snapshots are schema-valid, read-only, canonical and use separate observation IDs", async () => {
  const f = await fixture();
  const raw = input(f.chatId, { messages: [{ id: "forged", role: "user", content: "CLIENT_MUST_NOT_BECOME_CONTEXT" }], state: { work: { status: "CLIENT_FORGED_STATUS" } } });
  const observer = await prepareAGUIObserver(actor, f.runId, raw, { signal: new AbortController().signal });
  const events = await collect(observer.events), encoded = events.map(e => new EventEncoder().encode(e)).join("");
  assert.equal(events[0].type, EventType.RUN_STARTED);
  assert.equal((events[0] as { runId?: string }).runId, raw.runId);
  assert.equal(events.at(-1)?.type, EventType.RUN_FINISHED);
  assert.ok(encoded.includes("Canonical saved result"));
  assert.ok(!/CLIENT_|PRIVATE_/.test(encoded));
  const state = events.find(e => e.type === EventType.STATE_SNAPSHOT) as StateSnapshotEvent;
  assert.equal(state.snapshot.work.id, f.runId);
  const [row] = await db.select().from(runs).where(eq(runs.id, f.runId));
  assert.deepEqual(row.payload, f.payload);
  await assert.rejects(prepareAGUIObserver(actor, f.runId, input("wrong-thread"), { signal: new AbortController().signal }), { status: 409 });
  for (const forged of [{ tools: [{ name: "send", description: "Send", parameters: {} }] }, { context: [{ description: "Scope", value: "Override" }] }, { forwardedProps: { approved: true } }, { parentRunId: "forged-parent" }, { protocolVersion: "9.0" }])
    await assert.rejects(prepareAGUIObserver(actor, f.runId, input(f.chatId, forged), { signal: new AbortController().signal }), { status: 400 });
  await assert.rejects(prepareAGUIObserver({ ...actor, userId: ownerId }, f.runId, input(f.chatId), { signal: new AbortController().signal }), { status: 404 });
});

test("AG-UI pause, failure and stop outcomes do not report business success", async () => {
  const paused = await fixture("awaiting_approval");
  await db.update(runs).set({ payload: { ...paused.payload, pending: [{ id: "approval-fixture", tool: "send", input: { recipient: "customer@example.invalid", authorization: "PRIVATE_CREDENTIAL" } }] } }).where(eq(runs.id, paused.runId));
  const pauseEvents = await collect((await prepareAGUIObserver(actor, paused.runId, input(paused.chatId), { signal: new AbortController().signal })).events);
  assert.deepEqual((pauseEvents.at(-1) as { outcome?: unknown }).outcome, { type: "interrupt", interrupts: [{ id: "approval-fixture", reason: "aix.tool-approval", message: "Review this action in AIX before deciding." }] });
  assert.ok(!JSON.stringify(pauseEvents).includes("PRIVATE_CREDENTIAL"));
  const failed = await fixture("failed"), stopped = await fixture("cancelled");
  const failure = await collect((await prepareAGUIObserver(actor, failed.runId, input(failed.chatId), { signal: new AbortController().signal })).events);
  const cancellation = await collect((await prepareAGUIObserver(actor, stopped.runId, input(stopped.chatId), { signal: new AbortController().signal })).events);
  assert.equal(failure.at(-1)?.type, EventType.RUN_ERROR);
  assert.deepEqual((cancellation.at(-1) as { outcome?: unknown }).outcome, { type: "cancelled" });
});

test("live Redis text and tools map to standard events without raw credential or whole-chat envelopes", async () => {
  const f = await fixture("running");
  await emit(f.runId, { type: "text", data: "Hello " }); await emit(f.runId, { type: "text", data: "world" });
  await emit(f.runId, { type: "tool", data: { tool: "safe_read", input: { authorization: "PRIVATE_LIVE_CREDENTIAL" } } });
  await emit(f.runId, { type: "tool-result", data: { tool: "safe_read", output: "PRIVATE_RAW_OUTPUT" } });
  await emit(f.runId, { type: "done", data: { chat: { messages: ["PRIVATE_OTHER_RUN"] } } });
  const events: BaseEvent[] = [];
  for await (const next of (await prepareAGUIObserver(actor, f.runId, input(f.chatId), { signal: new AbortController().signal, pollMs: 5, maxMs: 1000 })).events) {
    EventSchema.parse(next); events.push(next);
    if (next.type === EventType.TEXT_MESSAGE_CONTENT) {
      await db.update(runs).set({ status: "completed" }).where(eq(runs.id, f.runId));
      await db.update(records).set({ data: { id: f.chatId, agentId: "research", title: "Synthetic result", messages: [{ role: "user", content: "Canonical request" }, { role: "assistant", runId: f.runId, content: "Saved final", demo: true }], updatedAt: new Date().toISOString() } }).where(and(eq(records.id, f.chatId), eq(records.organizationId, org)));
    }
  }
  assert.equal(events.filter(e => e.type === EventType.TEXT_MESSAGE_CONTENT).length, 1);
  assert.ok(JSON.stringify(events).includes("Hello world"));
  assert.ok(events.some(e => e.type === EventType.TOOL_CALL_START));
  assert.ok(events.some(e => e.type === EventType.TOOL_CALL_RESULT));
  assert.ok(!JSON.stringify(events).includes("PRIVATE_"));
  const end = events.findLast(e => e.type === EventType.MESSAGES_SNAPSHOT) as MessagesSnapshotEvent;
  assert.deepEqual(end.messages.map(m => m.content), ["Canonical request", "Saved final"]);
});

test("same-name overlapping tools keep unique IDs without inventing result correlation", async () => {
  const f = await fixture("running");
  for (let i = 0; i < 2; i++) await emit(f.runId, { type: "tool", data: { tool: "repeated_read", input: { secret: "PRIVATE_INPUT" } } });
  for (let i = 0; i < 2; i++) await emit(f.runId, { type: "tool-result", data: { tool: "repeated_read" } });
  const events: BaseEvent[] = [];
  for await (const next of (await prepareAGUIObserver(actor, f.runId, input(f.chatId), { signal: new AbortController().signal, pollMs: 5, maxMs: 5000 })).events) {
    EventSchema.parse(next); events.push(next);
    // End only after both outcomes were observed, rather than racing the full suite's
    // database/CPU load against a narrow wall-clock window. Timeout has its own test.
    if (next.type === EventType.CUSTOM && events.filter(e => e.type === EventType.CUSTOM).length === 2)
      await db.update(runs).set({ status: "completed" }).where(eq(runs.id, f.runId));
  }
  const starts = events.filter(e => e.type === EventType.TOOL_CALL_START) as ToolCallStartEvent[];
  assert.equal(new Set(starts.map(e => e.toolCallId)).size, 2);
  assert.ok(!events.some(e => e.type === EventType.TOOL_CALL_RESULT));
  assert.equal(events.filter(e => e.type === EventType.CUSTOM).length, 2);
  assert.ok(!JSON.stringify(events).includes("PRIVATE_INPUT"));
  assert.equal((events.at(-1) as { outcome?: { type: string } }).outcome?.type, "success");
});

test("revocation during awaited Redis reads and consumer yield boundaries clears state before further source events", async () => {
  const f = await fixture("running", true);
  await emit(f.runId, { type: "text", data: "PRIVATE_FETCHED_AFTER_REVOCATION" });
  const client = getRedis() as unknown as { xrange: (...args: unknown[]) => Promise<Array<[string, string[]]>> };
  const original = client.xrange;
  let intercepted = false;
  client.xrange = async function (...args: unknown[]) {
    const rows = await original.apply(this, args);
    if (!intercepted && args[0] === `run-events:${f.runId}`) {
      intercepted = true;
      await db.update(records).set({ data: { id: podId, name: "Restricted synthetic project", access: "private" } }).where(eq(records.id, podId));
    }
    return rows;
  };
  try {
    const events = await collect((await prepareAGUIObserver(actor, f.runId, input(f.chatId), { signal: new AbortController().signal, maxMs: 1000 })).events);
    assert.ok(!JSON.stringify(events).includes("PRIVATE_FETCHED_AFTER_REVOCATION"));
    assert.equal((events.at(-1) as { code?: string }).code, "ACCESS_REVOKED");
    assert.deepEqual((events.at(-3) as { snapshot?: unknown }).snapshot, { work: null, unavailable: true });
  } finally { client.xrange = original; }
  await db.update(records).set({ data: { id: podId, name: "Restored synthetic", access: "organization" } }).where(eq(records.id, podId));
  const observer = await prepareAGUIObserver(actor, f.runId, input(f.chatId), { signal: new AbortController().signal });
  assert.equal((await observer.events.next()).value?.type, EventType.RUN_STARTED);
  await db.update(records).set({ data: { id: podId, access: "private" } }).where(eq(records.id, podId));
  const after = await collect(observer.events);
  assert.ok(!JSON.stringify(after).includes("Canonical request"));
  assert.equal((after.at(-1) as { code?: string }).code, "ACCESS_REVOKED");
});

test("observer disconnect and bounded reconnect never cancel or complete backend work", async () => {
  const f = await fixture("running"), controller = new AbortController();
  const observer = await prepareAGUIObserver(actor, f.runId, input(f.chatId), { signal: controller.signal, pollMs: 1000, maxMs: 10000 });
  for (let i = 0; i < 3; i++) await observer.events.next();
  const pending = observer.events.next();
  const returned = observer.events.return(undefined);
  await Promise.race([Promise.all([pending, returned]), new Promise((_, reject) => setTimeout(() => reject(Error("Observer did not cancel promptly")), 500))]);
  const bounded = await collect((await prepareAGUIObserver(actor, f.runId, input(f.chatId), { signal: new AbortController().signal, pollMs: 5, maxMs: 15 })).events);
  const end = bounded.at(-1) as { outcome?: { type: string }; result?: { status: string; reconnect?: boolean } };
  assert.equal(end.outcome?.type, "interrupt"); assert.equal(end.result?.status, "running"); assert.equal(end.result?.reconnect, true);
  const [row] = await db.select().from(runs).where(eq(runs.id, f.runId));
  assert.equal(row.status, "running"); assert.equal(await getRedis().get(`run-cancel:${f.runId}`), null);
  const terminal = await fixture();
  const stream = await openAGUIRunEventStream(actor, terminal.runId, input(terminal.chatId), { signal: new AbortController().signal });
  const bytes = await new Response(stream).text();
  assert.match(bytes, /data:.*RUN_STARTED/); assert.match(bytes, /RUN_FINISHED/);
});
