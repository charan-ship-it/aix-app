// Actual local HTTP checks with disposable synthetic records; never invokes a model or external tool.
import assert from "node:assert/strict";
import { getSql } from "../db";
import { agents } from "../lib/workspace";
try { process.loadEnvFile(); } catch {}
const root = process.env.FLOW_TEST_URL || "http://localhost:4173";
assert.equal(new URL(root).hostname, "localhost", "This check is local-only.");
const stamp = crypto.randomUUID(), sql = getSql(), users: string[] = [], orgs: string[] = [];
class Client {
  cookies = new Map<string, string>();
  async request(path: string, body?: unknown) {
    const response = await fetch(root + path, { method: body === undefined ? "GET" : "POST",
      headers: { Origin: root, "Content-Type": "application/json", Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
  }
  async ok(path: string, body?: unknown) {
    const result = await this.request(path, body);
    assert.ok(result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`);
    return result;
  }
}
async function account(label: string) {
  const client = new Client();
  const result = await client.ok("/api/auth/sign-up/email", { name: `Synthetic work detail ${label}`,
    email: `work-detail-${stamp}-${label}@example.invalid`, password: "Synthetic-work-detail-passphrase-1234" });
  users.push(result.data.user.id); return client;
}
async function record(kind: string, createdBy: string, data: Record<string, unknown>, org = orgs[0]) {
  const id = typeof data.id === "string" ? data.id : crypto.randomUUID();
  await sql`insert into workspace_record(organization_id,id,created_by,kind,data) values(${org},${id},${createdBy},${kind},${JSON.stringify({ ...data, id })}::text::jsonb)`;
  return id;
}
async function run(chatId: string, status: string, payload: Record<string, unknown>, options: { id?: string; userId?: string; org?: string; agentId?: string } = {}) {
  const id = options.id || crypto.randomUUID();
  await sql`insert into agent_run(id,organization_id,created_by,chat_id,agent_id,status,payload) values(${id},${options.org || orgs[0]},${options.userId || users[0]},${chatId},${options.agentId || "deleted-fixture-agent"},${status},${JSON.stringify(payload)}::text::jsonb)`;
  return id;
}
try {
  assert.equal((await new Client().request(`/api/work/${crypto.randomUUID()}`)).status, 401);
  const owner = await account("owner"), member = await account("member"), outsider = await account("outsider");
  for (const [client, label] of [[owner, "main"], [outsider, "other"]] as const) {
    const created = await client.ok("/api/auth/organization/create", { name: `Synthetic work detail ${label}`, slug: `work-detail-${label}-${stamp}` });
    orgs.push(created.data.id);
    await client.ok("/api/auth/organization/set-active", { organizationId: created.data.id });
  }
  await sql`insert into organization_member(id,organization_id,user_id,role) values(${crypto.randomUUID()},${orgs[0]},${users[1]},'member')`;
  await member.ok("/api/auth/organization/set-active", { organizationId: orgs[0] });
  const firstId = crypto.randomUUID(), secondId = crypto.randomUUID();
  const chatId = await record("chat", users[0], { title: "Synthetic multi-run work", agentId: "deleted-fixture-agent", updatedAt: new Date().toISOString(), messages: [
    { role: "user", content: "First synthetic request" },
    { role: "assistant", runId: firstId, content: "First synthetic saved result", sources: ["Synthetic source"] },
    { role: "user", content: "Second synthetic request" },
    { role: "assistant", runId: secondId, content: "Second synthetic saved result" },
  ] });
  const payload = { agent: { id: "deleted-fixture-agent", name: "Historical synthetic agent", instructions: "SENSITIVE_SYSTEM_PROMPT" },
    messages: [{ role: "system", content: "SENSITIVE_SYSTEM_PROMPT" }, { role: "user", content: "First synthetic request" }, { role: "assistant", content: "INTERNAL_MODEL_CONTINUATION" }],
    pending: [], trace: [{ tool: "synthetic_read", status: "completed", input: { query: "Synthetic query", authorization: "SENSITIVE_TOOL_HEADER" }, output: JSON.stringify({ count: 1, apiKey: "SENSITIVE_TOOL_KEY" }) }],
    sessionId: "SENSITIVE_COMPOSIO_SESSION", usage: { input: 12, output: 8 }, sources: [],
  };
  await run(chatId, "completed", payload, { id: firstId });
  await run(chatId, "completed", { ...payload, messages: [{ role: "user", content: "Second synthetic request" }] }, { id: secondId });
  const first = await owner.ok(`/api/work/${firstId}`);
  assert.match(first.headers.get("cache-control") || "", /no-store/);
  assert.equal(first.data.agent.name, "Historical synthetic agent");
  assert.equal(first.data.request.content, "First synthetic request");
  assert.equal(first.data.result.content, "First synthetic saved result");
  assert.deepEqual(first.data.result.sources, ["Synthetic source"]);
  assert.equal(first.data.conversation.id, chatId);
  assert.equal(first.data.conversation.canContinue, false, "Deleted-agent work stays readable without offering a broken continuation.");
  const serialized = JSON.stringify(first.data);
  for (const hidden of ["SENSITIVE_SYSTEM_PROMPT", "SENSITIVE_COMPOSIO_SESSION", "INTERNAL_MODEL_CONTINUATION", "SENSITIVE_TOOL_HEADER", "SENSITIVE_TOOL_KEY", "Second synthetic request", "Second synthetic saved result"])
    assert.ok(!serialized.includes(hidden), `Unexpected full-payload or other-run disclosure: ${hidden}`);
  assert.equal(first.data.reviewed, false);
  assert.equal((await member.request(`/api/work/${firstId}`)).status, 404);
  assert.equal((await outsider.request(`/api/work/${firstId}`)).status, 404);
  console.log("PASS private run detail, deleted-agent snapshot, exact multi-run request/result association, no raw model/session leakage and no-store");

  const childChat = await record("chat", users[0], { title: "Synthetic allowed specialist", agentId: "research", updatedAt: new Date().toISOString(), messages: [] });
  const childId = await run(childChat, "completed", { ...payload, parentRunId: firstId, agent: { id: "research", name: "Allowed specialist" } }, { agentId: "research" });
  const otherMemberChat = await record("chat", users[1], { title: "PRIVATE_OTHER_MEMBER_CHILD", agentId: "research", updatedAt: new Date().toISOString(), messages: [] });
  const hiddenChildId = await run(otherMemberChat, "completed", { ...payload, parentRunId: firstId, agent: { id: "research", name: "PRIVATE_OTHER_MEMBER_CHILD" } }, { userId: users[1], agentId: "research" });
  const missingPodChat = await record("chat", users[0], { title: "PRIVATE_MISSING_POD_CHILD", agentId: "research", podId: crypto.randomUUID(), updatedAt: new Date().toISOString(), messages: [] });
  await run(missingPodChat, "completed", { ...payload, parentRunId: firstId, agent: { id: "research", name: "PRIVATE_MISSING_POD_CHILD" } }, { agentId: "research" });
  await sql`update agent_run set payload=jsonb_set(payload,'{parentRunId}',${JSON.stringify(hiddenChildId)}::text::jsonb) where id=${firstId}`;
  const links = (await owner.ok(`/api/work/${firstId}`)).data;
  assert.deepEqual(links.children.map((item: { id: string }) => item.id), [childId]);
  assert.equal(links.parent, null);
  assert.ok(!JSON.stringify(links).includes("PRIVATE_OTHER_MEMBER_CHILD"));
  assert.ok(!JSON.stringify(links).includes("PRIVATE_MISSING_POD_CHILD"));
  const child = (await owner.ok(`/api/work/${childId}`)).data;
  assert.equal(child.parent.id, firstId);
  console.log("PASS specialist links include only currently accessible owned work and hide foreign parent references");

  assert.equal((await owner.request("/api/inbox", { id: firstId, updatedAt: "2020-01-01T00:00:00.000Z" })).status, 409);
  await owner.ok("/api/inbox", { id: firstId, updatedAt: first.data.updatedAt });
  assert.equal((await owner.ok(`/api/work/${firstId}`)).data.reviewed, true);
  const pendingChat = await record("chat", users[0], { title: "Synthetic approval", agentId: "research", updatedAt: new Date().toISOString(), messages: [{ role: "user", content: "Synthetic approval request" }] });
  const pendingId = await run(pendingChat, "awaiting_approval", { ...payload, agent: { id: "research", name: "Synthetic research" }, messages: [{ role: "user", content: "Synthetic approval request" }], pending: [{ id: "synthetic-approval", tool: "synthetic_write", input: { title: "Synthetic draft" } }] }, { agentId: "research" });
  const pending = await owner.ok(`/api/work/${pendingId}`);
  assert.equal(pending.data.status, "awaiting_approval");
  assert.equal(pending.data.conversation.canContinue, true);
  assert.deepEqual(pending.data.pending.map((item: { id: string }) => item.id), ["synthetic-approval"]);
  assert.equal(pending.data.result, null);
  assert.equal((await owner.request(`/api/runs/${pendingId}/approve`, { approved: false, expectedApprovalIds: ["stale-approval"] })).status, 409);
  assert.equal((await owner.ok(`/api/work/${pendingId}`)).data.status, "awaiting_approval");
  assert.equal((await owner.request("/api/inbox", { id: pendingId, updatedAt: pending.data.updatedAt })).status, 409);
  console.log("PASS durable review timestamp guard, pending approval presentation and stale approval rejection without executing a tool");

  const podId = await record("pod", users[1], { name: "Synthetic shared project", access: "organization", archived: false });
  const podChat = await record("chat", users[0], { title: "Synthetic project task", agentId: "research", podId, updatedAt: new Date().toISOString(), messages: [{ role: "user", content: "Synthetic project request" }] });
  const podRun = await run(podChat, "awaiting_approval", { ...payload, agent: { id: "research", name: "Synthetic research" } }, { agentId: "research" });
  await owner.ok(`/api/work/${podRun}`);
  await sql`update workspace_record set data=jsonb_set(data,'{access}','"private"'::jsonb) where organization_id=${orgs[0]} and id=${podId}`;
  assert.equal((await owner.request(`/api/work/${podRun}`)).status, 404);
  assert.equal((await owner.request(`/api/runs/${podRun}/cancel`, {})).status, 404);
  const [stillPending] = await sql`select status from agent_run where id=${podRun}`;
  assert.equal(stillPending.status, "awaiting_approval");
  await sql`delete from workspace_record where organization_id=${orgs[0]} and id=${podId}`;
  assert.equal((await owner.request(`/api/work/${podRun}`)).status, 404);
  const deletedChat = await record("chat", users[0], { title: "Synthetic retired agent task", agentId: "deleted-fixture-agent", updatedAt: new Date().toISOString(), messages: [{ role: "user", content: "Synthetic retired agent request" }] });
  const cancelledId = await run(deletedChat, "awaiting_approval", payload);
  await owner.ok(`/api/runs/${cancelledId}/cancel`, {});
  assert.equal((await owner.ok(`/api/work/${cancelledId}`)).data.status, "cancelled");
  assert.equal((await owner.request(`/api/runs/${cancelledId}/cancel`, {})).status, 409);
  const archivedAgentId = await record("agent", users[0], { ...agents[1], id: crypto.randomUUID(), name: "Archived synthetic researcher", archived: true });
  const archivedChat = await record("chat", users[0], { title: "Synthetic archived-agent task", agentId: archivedAgentId, updatedAt: new Date().toISOString(), messages: [] });
  const archivedRun = await run(archivedChat, "completed", payload, { agentId: archivedAgentId });
  assert.equal((await owner.ok(`/api/work/${archivedRun}`)).data.conversation.canContinue, false);
  console.log("PASS revoked/missing project access denies detail and cancellation, while retired-agent work stays readable and stoppable");

  const memberChat = await record("chat", users[1], { title: "Synthetic member task", agentId: "research", updatedAt: new Date().toISOString(), messages: [] });
  const memberRun = await run(memberChat, "failed", payload, { userId: users[1], agentId: "research" });
  await member.ok(`/api/work/${memberRun}`);
  await sql`delete from organization_member where organization_id=${orgs[0]} and user_id=${users[1]}`;
  assert.equal((await member.request(`/api/work/${memberRun}`)).status, 403);
  console.log("PASS revoked organization membership denies previously readable work");
} finally {
  for (const id of orgs) await sql`delete from organization where id=${id}`;
  for (const id of users) await sql`delete from auth_user where id=${id} and email like ${"work-detail-" + stamp + "-%@example.invalid"}`;
  await sql.end();
}
