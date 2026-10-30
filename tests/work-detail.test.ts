import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { user, organization, member, records, runs } from "../db/schema";
import { readWorkDetail } from "../lib/server/work-detail";
import type { WorkspaceUser } from "../lib/server/http";

try { process.loadEnvFile(); } catch {}
const suffix = crypto.randomUUID(), org = `work-detail-${suffix}`, otherOrg = `work-detail-other-${suffix}`;
const actor: WorkspaceUser = { userId: `work-detail-member-${suffix}`, organizationId: org, displayName: "Synthetic work detail", organizationName: "Synthetic workspace", email: `work-detail-${suffix}@example.invalid`, role: "member" };
const owner: WorkspaceUser = { ...actor, userId: `work-detail-owner-${suffix}`, email: `work-detail-owner-${suffix}@example.invalid`, role: "owner" };
const foreign: WorkspaceUser = { ...actor, organizationId: otherOrg };
const db = getDb(), sql = getSql();
const podId = crypto.randomUUID();
async function chat(messages: unknown[] = [], pod?: string, creator = actor, agentId = "research") {
  const id = crypto.randomUUID();
  await db.insert(records).values({ organizationId: creator.organizationId, id, createdBy: creator.userId, kind: "chat", data: {
    id, title: "Synthetic work detail", agentId, messages, ...(pod ? { podId: pod } : {}), updatedAt: new Date().toISOString(),
  } });
  return id;
}
async function run(chatId: string, payload: Record<string, unknown>, status = "completed", creator = actor, agentId = "research", id = crypto.randomUUID()) {
  await db.insert(runs).values({ id, organizationId: creator.organizationId, createdBy: creator.userId, chatId, agentId, status, payload });
  return id;
}
before(async () => {
  for (const person of [actor, owner]) await db.insert(user).values({ id: person.userId, name: person.displayName, email: person.email });
  for (const id of [org, otherOrg]) await db.insert(organization).values({ id, name: "Synthetic work detail", slug: id });
  for (const person of [actor, owner, foreign]) await db.insert(member).values({ id: crypto.randomUUID(), organizationId: person.organizationId, userId: person.userId, role: person.role });
  await db.insert(records).values({ id: podId, organizationId: org, createdBy: owner.userId, kind: "pod", data: { id: podId, name: "Shared synthetic Pod", access: "organization" } });
});
after(async () => {
  for (const id of [org, otherOrg]) await db.delete(organization).where(eq(organization.id, id));
  for (const person of [actor, owner]) await db.delete(user).where(eq(user.id, person.userId));
  await sql.end();
});

test("work detail associates original request and durable result with one run without returning private payload history", async () => {
  const first = crypto.randomUUID(), second = crypto.randomUUID();
  const chatId = await chat([
    { role: "user", content: "First request" }, { role: "assistant", runId: first, content: "First result", sources: ["Notes"], agentName: "Snapshot agent" },
    { role: "user", content: "SECOND_REQUEST_NOT_FOR_FIRST_RUN" }, { role: "assistant", runId: second, content: "SECOND_RESULT_NOT_FOR_FIRST_RUN" },
  ]);
  await run(chatId, { agent: { name: "Original snapshot name", instructions: "PRIVATE_AGENT_INSTRUCTIONS" },
    sessionId: "PRIVATE_SESSION", messages: [{ role: "system", content: "PRIVATE_SYSTEM" }, { role: "user", content: "First request" }], trace: [] }, "completed", actor, "deleted-agent", first);
  await run(chatId, { agent: { name: "Second" }, messages: [{ role: "user", content: "SECOND_REQUEST_NOT_FOR_FIRST_RUN" }] }, "completed", actor, "research", second);
  const detail = await readWorkDetail(actor, first);
  assert.deepEqual(detail.request, { content: "First request", source: "snapshot" });
  assert.equal(detail.result?.content, "First result");
  assert.deepEqual(detail.result?.sources, ["Notes"]);
  assert.equal(detail.agent.name, "Original snapshot name");
  assert.equal(detail.conversation.canContinue, false);
  assert.ok(!/PRIVATE_|SECOND_/.test(JSON.stringify(detail)));
  await assert.rejects(readWorkDetail(owner, first), { status: 404 });
  await assert.rejects(readWorkDetail(foreign, first), { status: 404 });
});

test("queued work uses its own snapshot and legacy work never borrows the newest conversation request", async () => {
  const queuedChat = await chat([{ role: "user", content: "UNRELATED_LATEST_REQUEST" }]);
  const queued = await run(queuedChat, { messages: [{ role: "user", content: [{ type: "text", text: "Queued original" }] }] }, "queued");
  const queuedDetail = await readWorkDetail(actor, queued);
  assert.deepEqual(queuedDetail.request, { content: "Queued original", source: "snapshot" });
  assert.equal(queuedDetail.result, null);
  const legacy = await run(queuedChat, {}, "completed");
  assert.deepEqual((await readWorkDetail(actor, legacy)).request, { content: "", source: "unavailable" });
  const legacyId = crypto.randomUUID();
  const legacyChat = await chat([{ role: "user", content: "Legacy original" }, { role: "assistant", runId: legacyId, content: "Legacy result" }, { role: "user", content: "UNRELATED_LATEST_REQUEST" }]);
  await run(legacyChat, {}, "completed", actor, "research", legacyId);
  assert.deepEqual((await readWorkDetail(actor, legacyId)).request, { content: "Legacy original", source: "conversation" });
});

test("tool evidence redacts credentials, retains business parameters, and marks incomplete approvals", async () => {
  const chatId = await chat();
  const id = await run(chatId, { pending: [{ id: "pending-1", tool: "send_draft", input: { recipient: "client@example.invalid", body: "Review this proposal", authorization: "AUTH_SECRET", "Proxy-Authorization": "PROXY_SECRET", headers: { "Set-Cookie": "COOKIE_SECRET" }, api_key: "KEY_SECRET", sessionToken: "SESSION_SECRET" } }],
    trace: [{ tool: "read_mail", status: "completed", output: JSON.stringify({ token: "TOKEN_SECRET", subject: "Project agenda" }) }], usage: { input: 30, output: 20 } }, "awaiting_approval");
  const detail = await readWorkDetail(actor, id);
  assert.equal(detail.evidenceRedacted, true);
  assert.equal(detail.approvalPreviewComplete, true);
  assert.ok(!JSON.stringify(detail).includes("_SECRET"));
  assert.equal((detail.pending[0].input as Record<string, unknown>).recipient, "client@example.invalid");
  assert.equal((detail.pending[0].input as Record<string, unknown>).body, "Review this proposal");
  assert.deepEqual(detail.usage, { input: 30, output: 20 });
  await db.update(runs).set({ payload: { pending: [{ id: "large", tool: "send", input: { body: "x".repeat(60000) } }] } }).where(eq(runs.id, id));
  const large = await readWorkDetail(actor, id);
  assert.equal(large.approvalPreviewComplete, false);
  assert.equal(large.evidenceTruncated, true);
  await db.update(runs).set({ payload: { trace: [{ tool: "tool", status: "completed", output: JSON.stringify({ token: "LARGE_JSON_SECRET", body: "x".repeat(60000) }) }] } }).where(eq(runs.id, id));
  const largeJson = await readWorkDetail(actor, id);
  assert.equal(largeJson.evidenceTruncated, true);
  assert.ok(!JSON.stringify(largeJson).includes("LARGE_JSON_SECRET"));
  await db.update(runs).set({ payload: { pending: [null, { tool: "missing_id" }], trace: [null, 5], usage: { input: -1, output: "bad" } } }).where(eq(runs.id, id));
  const malformed = await readWorkDetail(actor, id);
  assert.deepEqual(malformed.pending, []);
  assert.deepEqual(malformed.trace, []);
  assert.equal(malformed.approvalPreviewComplete, false);
  assert.equal(malformed.usage, undefined);
});

test("related work obeys source access and reviewed state refers to the current run revision", async () => {
  const chatId = await chat(), parentChat = await chat([], undefined, owner);
  const parent = await run(parentChat, { agent: { name: "PRIVATE_PARENT" } }, "completed", owner);
  const id = await run(chatId, { parentRunId: parent });
  const childChat = await chat(), blockedChat = await chat([], crypto.randomUUID());
  const childId = await run(childChat, { parentRunId: id, agent: { name: "Visible specialist" } });
  await run(blockedChat, { parentRunId: id, agent: { name: "PRIVATE_CHILD" } });
  const detail = await readWorkDetail(actor, id);
  assert.equal(detail.parent, null);
  assert.deepEqual(detail.children.map(child => child.id), [childId]);
  assert.ok(!JSON.stringify(detail).includes("PRIVATE_"));
  await db.insert(records).values({ organizationId: org, createdBy: actor.userId, kind: "run-review", id: "run-review:" + id, data: { runUpdatedAt: detail.updatedAt } });
  assert.equal((await readWorkDetail(actor, id)).reviewed, true);
  await db.update(runs).set({ updatedAt: new Date(Date.now() + 5000) }).where(eq(runs.id, id));
  assert.equal((await readWorkDetail(actor, id)).reviewed, false);
});

test("work detail requires current Pod access and membership, including after ownership role changes", async () => {
  const chatId = await chat([], podId), id = await run(chatId, {});
  assert.equal((await readWorkDetail(actor, id)).conversation.pod?.id, podId);
  await db.update(records).set({ data: { id: podId, name: "Restricted", access: "private" } }).where(eq(records.id, podId));
  await assert.rejects(readWorkDetail(actor, id), { status: 404 });
  const ownChat = await chat(), ownRun = await run(ownChat, {});
  await db.delete(member).where(eq(member.userId, actor.userId));
  await assert.rejects(readWorkDetail(actor, ownRun), { status: 403 });
});
