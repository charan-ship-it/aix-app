import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { getDb, getSql } from "../db";
import { user, organization, member } from "../db/schema";
import { eq } from "drizzle-orm";
import { listConversationIndex } from "../lib/server/conversation-index";
import { readConversationAccess } from "../lib/server/conversation-access";
import { openRunEventStream } from "../lib/server/run-event-stream";
import { getRedis } from "../lib/server/redis";
import type { WorkspaceUser } from "../lib/server/http";
try { process.loadEnvFile(); } catch {}
const redis = new URL(process.env.REDIS_URL!); redis.pathname = "/9"; process.env.REDIS_URL = redis.toString();
const stamp = crypto.randomUUID(), org = `history-org-${stamp}`, otherOrg = `history-other-${stamp}`;
const ownerId = `history-owner-${stamp}`, memberId = `history-member-${stamp}`, outsiderId = `history-outsider-${stamp}`;
const actor: WorkspaceUser = { userId: memberId, organizationId: org, displayName: "History fixture", organizationName: "Synthetic history", email: `${memberId}@example.invalid`, role: "member" };
const owner: WorkspaceUser = { ...actor, userId: ownerId, email: `${ownerId}@example.invalid`, role: "owner" }, outsider: WorkspaceUser = { ...actor, userId: outsiderId, email: `${outsiderId}@example.invalid`, organizationId: otherOrg };
const sharedPod = crypto.randomUUID(), privatePod = crypto.randomUUID(), ownPod = crypto.randomUUID(), missingPod = crypto.randomUUID();
const ids: Record<string, string> = {}, runIds: string[] = [];
const sql = getSql(), db = getDb();
async function record(kind: string, id: string, createdBy: string, data: object, organizationId = org) {
  await sql`insert into workspace_record(organization_id,id,created_by,kind,data,updated_at) values(${organizationId},${id},${createdBy},${kind},${JSON.stringify(data)}::jsonb,'2020-01-01T00:00:00Z'::timestamptz)`;
}
async function chat(key: string, createdBy = memberId, podId?: string, title = key, agentId = "research", organizationId = org) {
  const id = crypto.randomUUID(); ids[key] = id;
  await record("chat", id, createdBy, { id, title, agentId, ...(podId ? { podId } : {}), messages: [{ role: "user", content: "PRIVATE_MESSAGE_BODY" }], updatedAt: "2020-01-01T00:00:00Z" }, organizationId);
  return id;
}
async function podAccess(value: string) { await sql`update workspace_record set data=jsonb_set(data,'{access}',${JSON.stringify(value)}::jsonb) where organization_id=${org} and id=${sharedPod}`; }
async function run(chatId: string, status = "running") {
  const id = crypto.randomUUID(); runIds.push(id);
  await sql`insert into agent_run(id,organization_id,created_by,chat_id,agent_id,status,payload) values(${id},${org},${memberId},${chatId},'research',${status},'{}'::jsonb)`;
  return id;
}
async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const result = await Promise.race([reader.read(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Stream did not settle")), 2000).unref())]);
  return { done: result.done, text: result.value ? new TextDecoder().decode(result.value) : "" };
}
before(async () => {
  for (const u of [owner, actor, outsider]) await db.insert(user).values({ id: u.userId, name: u.displayName, email: u.email });
  await db.insert(organization).values([{ id: org, name: "History fixture", slug: org }, { id: otherOrg, name: "Other history", slug: otherOrg }]);
  for (const u of [owner, actor, outsider]) await db.insert(member).values({ id: crypto.randomUUID(), organizationId: u.organizationId, userId: u.userId, role: u.role });
  for (const [id, creator, access] of [[sharedPod, ownerId, "organization"], [privatePod, ownerId, "private"], [ownPod, memberId, "private"]])
    await record("pod", id, creator, { id, name: "Synthetic project", access });
  await chat("global", memberId, undefined, "Roadmap 100% _start", "removed-agent");
  await chat("shared", memberId, sharedPod);
  await chat("own", memberId, ownPod);
  await chat("private", memberId, privatePod);
  await chat("missing", memberId, missingPod);
  await chat("another-member", ownerId);
  await chat("other-tenant", outsiderId, undefined, "Foreign", "research", otherOrg);
});
after(async () => {
  for (const id of runIds) await getRedis().del(`run-events:${id}`);
  await db.delete(organization).where(eq(organization.id, org)); await db.delete(organization).where(eq(organization.id, otherOrg));
  for (const id of [ownerId, memberId, outsiderId]) await db.delete(user).where(eq(user.id, id));
  await getRedis().quit(); await sql.end();
});

test("private history includes accessible Pod conversations and unavailable agents, without raw messages", async () => {
  const page = await listConversationIndex(actor);
  assert.deepEqual(new Set(page.items.map(item => item.id)), new Set([ids.global, ids.shared, ids.own]));
  assert.equal(page.items.find(item => item.id === ids.global)?.agentName, "Unavailable agent");
  assert.equal(page.items.find(item => item.id === ids.shared)?.agentName, "Research analyst");
  assert.equal(page.items[0].messageCount, 1);
  assert.ok(!JSON.stringify(page).includes("PRIVATE_MESSAGE_BODY"));
  assert.equal((await listConversationIndex(actor, { podId: privatePod })).items.length, 0);
  assert.equal((await listConversationIndex(actor, { q: "%" })).items[0].id, ids.global);
  assert.equal((await listConversationIndex(actor, { q: "_start" })).items.length, 1);
  assert.equal((await listConversationIndex(actor, { agentId: "removed-agent" })).items[0].id, ids.global);
  assert.equal((await listConversationIndex(outsider)).items[0].id, ids["other-tenant"]);
});

test("signed keyset cursors preserve timestamp precision and reject tampering or changed scope", async () => {
  const micros: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await chat(`micro-${i}`, memberId, undefined, "Micro fixture"); micros.push(id);
    await sql`update workspace_record set updated_at='2030-01-01T00:00:00.000123Z'::timestamptz where organization_id=${org} and id=${id}`;
  }
  const first = await listConversationIndex(actor, { q: "Micro fixture", limit: 1 });
  assert.ok(first.nextCursor);
  const second = await listConversationIndex(actor, { q: "Micro fixture", limit: 1, cursor: first.nextCursor });
  const third = await listConversationIndex(actor, { q: "Micro fixture", limit: 1, cursor: second.nextCursor });
  assert.deepEqual([first.items[0].id, second.items[0].id, third.items[0].id], micros.sort().reverse());
  assert.equal(third.nextCursor, null);
  for (const value of [{ limit: 0 }, { limit: 51 }, { cursor: "bad" }, { q: "Other", cursor: first.nextCursor }, { q: "Micro fixture", cursor: first.nextCursor.slice(0, -1) + (first.nextCursor.endsWith("A") ? "B" : "A") }])
    await assert.rejects(listConversationIndex(actor, value), { status: 400 });
  await assert.rejects(listConversationIndex(owner, { q: "Micro fixture", cursor: first.nextCursor }), { status: 400 });
  await assert.rejects(listConversationIndex(outsider, { q: "Micro fixture", cursor: first.nextCursor }), { status: 400 });
});

test("SSE denies revoked Pod access at entry and closes an active stream without further events", async () => {
  const id = await run(ids.shared);
  await getRedis().xadd(`run-events:${id}`, "*", "data", JSON.stringify({ type: "text", data: "allowed-before-revocation" }));
  const controller = new AbortController();
  const stream = await openRunEventStream(actor, id, { signal: controller.signal, pollMs: 15 });
  const reader = stream.getReader();
  assert.match((await readChunk(reader)).text, /allowed-before-revocation/);
  await podAccess("private");
  await getRedis().xadd(`run-events:${id}`, "*", "data", JSON.stringify({ type: "text", data: "SECRET_AFTER_REVOCATION" }));
  const after = await readChunk(reader);
  assert.equal(after.done, true); assert.equal(after.text, "");
  await assert.rejects(openRunEventStream(actor, id, { signal: controller.signal }), { status: 404 });
  await assert.rejects(readConversationAccess(actor, ids.shared), { status: 404 });
  assert.ok(!(await listConversationIndex(actor)).items.some(item => item.id === ids.shared));
  await podAccess("organization");
});

test("a Pod revocation during the awaited Redis read prevents publishing the fetched batch", async () => {
  const chatId = await chat("during-read", memberId, sharedPod);
  const id = await run(chatId);
  await getRedis().xadd(`run-events:${id}`, "*", "data", JSON.stringify({ type: "text", data: "FETCHED_BUT_NO_LONGER_AUTHORIZED" }));
  const client = getRedis() as unknown as { xrange: (...args: unknown[]) => Promise<Array<[string, string[]]>> };
  const original = client.xrange;
  let intercepted = false;
  client.xrange = async function (...args: unknown[]) {
    const entries = await original.apply(client, args);
    if (args[0] === `run-events:${id}` && !intercepted) { intercepted = true; await podAccess("private"); }
    return entries;
  };
  try {
    const stream = await openRunEventStream(actor, id, { signal: new AbortController().signal, pollMs: 15 });
    const first = await readChunk(stream.getReader());
    assert.equal(intercepted, true);
    assert.equal(first.done, true);
    assert.equal(first.text, "");
  } finally { client.xrange = original; await podAccess("organization"); }
});

test("terminal fallback requires current source access and member removal stops active streams", async () => {
  const terminal = await run(ids.own, "completed");
  const fallback = await openRunEventStream(actor, terminal, { signal: new AbortController().signal, pollMs: 15 });
  const reader = fallback.getReader();
  assert.match((await readChunk(reader)).text, /PRIVATE_MESSAGE_BODY/);
  assert.equal((await readChunk(reader)).done, true);
  const active = await run(ids.global);
  await getRedis().xadd(`run-events:${active}`, "*", "data", JSON.stringify({ type: "text", data: "initial" }));
  const live = await openRunEventStream(actor, active, { signal: new AbortController().signal, pollMs: 15 });
  const liveReader = live.getReader(); await readChunk(liveReader);
  await sql`delete from organization_member where organization_id=${org} and user_id=${memberId}`;
  await getRedis().xadd(`run-events:${active}`, "*", "data", JSON.stringify({ type: "done", data: { secret: "MEMBERSHIP_REVOKED" } }));
  assert.equal((await readChunk(liveReader)).done, true);
  await assert.rejects(listConversationIndex(actor), { status: 403 });
  await assert.rejects(openRunEventStream(actor, terminal, { signal: new AbortController().signal }), { status: 403 });
  await assert.rejects(openRunEventStream(outsider, terminal, { signal: new AbortController().signal }), { status: 404 });
});
