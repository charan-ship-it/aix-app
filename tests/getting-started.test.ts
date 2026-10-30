import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { member, organization, records, runs, user } from "../db/schema";
import { readGettingStartedConnections, readGettingStartedPreference, readGettingStartedProgress, saveGettingStartedPreference } from "../lib/server/getting-started";
import { composioUser } from "../lib/server/composio";
import type { WorkspaceUser } from "../lib/server/http";
try { process.loadEnvFile(); } catch {}
const stamp = crypto.randomUUID();
const org = `first-task-org-${stamp}`, otherOrg = `first-task-other-${stamp}`;
const actor: WorkspaceUser = { userId: `first-task-member-${stamp}`, organizationId: org, displayName: "First task fixture", organizationName: "First task fixture", email: `member-${stamp}@example.invalid`, role: "member" };
const owner: WorkspaceUser = { ...actor, userId: `first-task-owner-${stamp}`, email: `owner-${stamp}@example.invalid`, role: "owner" };
const other: WorkspaceUser = { ...actor, organizationId: otherOrg };
const db = getDb(), sql = getSql();
const sharedPod = crypto.randomUUID(), privatePod = crypto.randomUUID(), missingPod = crypto.randomUUID();
async function record(kind: string, createdBy: string, data: Record<string, unknown>, organizationId = org) {
  const id = crypto.randomUUID();
  await db.insert(records).values({ organizationId, id, createdBy, kind, data: { ...data, id } });
  return id;
}
async function chatRun(createdBy = actor.userId, options: { podId?: string; demo?: boolean; error?: boolean; status?: string; result?: boolean; organizationId?: string } = {}) {
  const runId = crypto.randomUUID(), organizationId = options.organizationId || org;
  const chatId = await record("chat", createdBy, { agentId: "research", title: "Synthetic first task", ...(options.podId ? { podId: options.podId } : {}),
    messages: options.result === false ? [] : [{ role: "assistant", content: "Synthetic result", runId, demo: options.demo || false, error: options.error || false }] }, organizationId);
  await db.insert(runs).values({ id: runId, organizationId, createdBy, chatId, agentId: "research", status: options.status || "completed", payload: {} });
  return chatId;
}
before(async () => {
  for (const u of [actor, owner]) await db.insert(user).values({ id: u.userId, name: u.displayName, email: u.email });
  for (const id of [org, otherOrg]) await db.insert(organization).values({ id, name: "Synthetic first task", slug: id });
  for (const u of [actor, owner, other]) await db.insert(member).values({ id: crypto.randomUUID(), organizationId: u.organizationId, userId: u.userId, role: u.role });
  for (const [id, access] of [[sharedPod, "organization"], [privatePod, "private"]]) await db.insert(records).values({ id, organizationId: org, createdBy: owner.userId, kind: "pod", data: { id, access, name: "Synthetic project" } });
});
after(async () => {
  for (const id of [org, otherOrg]) await db.delete(organization).where(eq(organization.id, id));
  for (const u of [actor, owner]) await db.delete(user).where(eq(user.id, u.userId));
  await sql.end();
});

test("first-task preferences are private per organization/member, resumable, merged and strictly validated", async () => {
  assert.deepEqual(await readGettingStartedPreference(actor), { goal: null, dismissed: false });
  await saveGettingStartedPreference(actor, { goal: "follow-ups" });
  assert.deepEqual(await saveGettingStartedPreference(actor, { dismissed: true }), { goal: "follow-ups", dismissed: true });
  assert.deepEqual(await readGettingStartedPreference(owner), { goal: null, dismissed: false });
  assert.deepEqual(await readGettingStartedPreference(other), { goal: null, dismissed: false });
  assert.deepEqual(await saveGettingStartedPreference(actor, { dismissed: false }), { goal: "follow-ups", dismissed: false });
  await saveGettingStartedPreference(other, { goal: "transcript" });
  assert.equal((await readGettingStartedPreference(actor)).goal, "follow-ups");
  for (const value of [{}, { goal: "bad" }, { dismissed: "true" }, { goal: "custom", organizationId: otherOrg }])
    await assert.rejects(saveGettingStartedPreference(actor, value), { status: 400 });
});

test("first-task completion requires own durable successful result and current source access", async () => {
  assert.deepEqual(await readGettingStartedProgress(actor), { hasConversation: false, hasCompletedRun: false, lastConversationId: null });
  await chatRun(owner.userId);
  await chatRun(actor.userId, { organizationId: otherOrg });
  await chatRun(actor.userId, { podId: privatePod });
  await chatRun(actor.userId, { podId: missingPod });
  assert.equal((await readGettingStartedProgress(actor)).hasConversation, false);
  await chatRun(actor.userId, { demo: true });
  await chatRun(actor.userId, { error: true });
  await chatRun(actor.userId, { status: "failed" });
  await chatRun(actor.userId, { result: false });
  assert.equal((await readGettingStartedProgress(actor)).hasCompletedRun, false);
  const completedId = await chatRun(actor.userId, { podId: sharedPod });
  assert.deepEqual(await readGettingStartedProgress(actor), { hasConversation: true, hasCompletedRun: true, lastConversationId: completedId });
  await db.update(records).set({ data: { id: sharedPod, name: "Revoked project", access: "private" } }).where(eq(records.id, sharedPod));
  const revoked = await readGettingStartedProgress(actor);
  assert.equal(revoked.hasCompletedRun, false);
  assert.notEqual(revoked.lastConversationId, completedId);
});

test("connector readiness reads exact member/private active metadata without authorizing apps", async () => {
  const queries: unknown[] = [];
  const readiness = await readGettingStartedConnections(actor, {
    isConfigured: () => true,
    list: async (query, options) => {
      queries.push(query);
      assert.ok(options.signal instanceof AbortSignal);
      const toolkit = query.toolkitSlugs[0];
      return { items: toolkit === "outlook" ? [] : [{ status: "ACTIVE", toolkit: { slug: toolkit } }] };
    },
  });
  assert.deepEqual(readiness, { status: "ready", email: true, calendar: true });
  assert.deepEqual(queries, ["gmail", "outlook", "googlecalendar"].map(toolkit => ({
    userIds: [composioUser(org, actor.userId)], toolkitSlugs: [toolkit], statuses: ["ACTIVE"], accountType: "PRIVATE", limit: 1,
  })));
  let called = false;
  assert.deepEqual(await readGettingStartedConnections(actor, {
    isConfigured: () => false,
    list: async () => { called = true; throw new Error("Must not connect"); },
  }), { status: "unavailable", email: false, calendar: false });
  assert.equal(called, false);
  assert.deepEqual(await readGettingStartedConnections(actor, {
    isConfigured: () => true,
    list: async () => { throw new Error("Synthetic metadata outage"); },
  }), { status: "error", email: false, calendar: false });
  assert.deepEqual(await readGettingStartedConnections(other, {
    isConfigured: () => true,
    list: async query => {
      assert.deepEqual(query.userIds, [composioUser(otherOrg, actor.userId)]);
      return { items: [{ status: "EXPIRED", toolkit: { slug: "gmail" } }, { status: "ACTIVE", toolkit: { slug: "foreign" } }] };
    },
  }), { status: "ready", email: false, calendar: false });
});
