// Local HTTP verification; creates disposable accounts and never invokes a model or tool.
import assert from "node:assert/strict";
import { getSql } from "../db";
try { process.loadEnvFile(); } catch {}
const root = process.env.FLOW_TEST_URL || "http://localhost:4173";
assert.equal(new URL(root).hostname, "localhost", "This check is local-only.");
const stamp = crypto.randomUUID(), sql = getSql(), users: string[] = [], orgs: string[] = [];
class Client {
  cookies = new Map<string, string>();
  async request(path: string, method = "GET", body?: unknown, origin = root) {
    const response = await fetch(root + path, { method,
      headers: { Origin: origin, "Content-Type": "application/json", Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  async ok(path: string, method = "GET", body?: unknown) {
    const result = await this.request(path, method, body);
    assert.ok(result.status < 300, `${path}: ${result.status} ${JSON.stringify(result.data)}`);
    return result;
  }
}
async function account(label: string) {
  const client = new Client();
  const result = await client.ok("/api/auth/sign-up/email", "POST", { name: `Synthetic onboarding ${label}`,
    email: `onboarding-${stamp}-${label}@example.invalid`, password: "Synthetic-onboarding-passphrase-1234" });
  users.push(result.data.user.id); return client;
}
try {
  assert.equal((await new Client().request("/api/getting-started")).status, 401);
  const owner = await account("owner"), member = await account("member"), outsider = await account("outsider");
  for (const [client, label] of [[owner, "main"], [outsider, "other"]] as const) {
    const result = await client.ok("/api/auth/organization/create", "POST", { name: `Synthetic onboarding ${label}`, slug: `onboarding-${label}-${stamp}` });
    orgs.push(result.data.id);
    await client.ok("/api/auth/organization/set-active", "POST", { organizationId: result.data.id });
  }
  await sql`insert into organization_member(id,organization_id,user_id,role) values(${crypto.randomUUID()},${orgs[0]},${users[1]},'member')`;
  await member.ok("/api/auth/organization/set-active", "POST", { organizationId: orgs[0] });
  const initial = await owner.ok("/api/getting-started");
  assert.match(initial.headers.get("cache-control") || "", /no-store/);
  assert.deepEqual(initial.data.preference, { goal: null, dismissed: false });
  assert.equal(initial.data.model.ready, false);
  assert.equal(initial.data.model.canManage, true);
  assert.deepEqual(initial.data.progress, { hasConversation: false, hasCompletedRun: false, lastConversationId: null });
  assert.ok(!/api.?key|token|secret/i.test(JSON.stringify(initial.data)), "Readiness DTO contains no secret fields.");
  const saved = await owner.ok("/api/getting-started", "PATCH", { goal: "transcript" });
  assert.deepEqual(saved.data.preference, { goal: "transcript", dismissed: false });
  await owner.ok("/api/getting-started", "PATCH", { dismissed: true });
  assert.deepEqual((await owner.ok("/api/getting-started")).data.preference, { goal: "transcript", dismissed: true });
  const personal = await member.ok("/api/getting-started");
  assert.equal(personal.data.model.canManage, false);
  assert.deepEqual(personal.data.preference, { goal: null, dismissed: false });
  assert.deepEqual((await outsider.ok("/api/getting-started")).data.preference, { goal: null, dismissed: false });
  for (const body of [{}, { dismissed: "true" }, { goal: "unsupported" }, { goal: "custom", organizationId: orgs[1] }, { goal: "custom", userId: users[1] }, { hasCompletedRun: true }])
    assert.equal((await owner.request("/api/getting-started", "PATCH", body)).status, 400);
  assert.equal((await owner.request("/api/getting-started", "PATCH", { dismissed: false }, "https://foreign.example.invalid")).status, 403);
  assert.deepEqual((await owner.ok("/api/getting-started", "PATCH", { dismissed: false })).data.preference, { goal: "transcript", dismissed: false });
  await sql`delete from organization_member where organization_id=${orgs[0]} and user_id=${users[1]}`;
  assert.equal((await member.request("/api/getting-started")).status, 403);
  assert.equal((await member.request("/api/getting-started", "PATCH", { goal: "custom" })).status, 403);
  console.log("PASS authenticated no-store readiness, role guidance, persistent skip/resume, member/tenant isolation, strict patches, cross-origin denial and revoked membership");
} finally {
  for (const id of orgs) await sql`delete from organization where id=${id}`;
  for (const id of users) await sql`delete from auth_user where id=${id} and email like ${"onboarding-" + stamp + "-%@example.invalid"}`;
  await sql.end();
}
