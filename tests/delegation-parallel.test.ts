import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getSql } from "../db";
import {
  user,
  organization,
  member,
  records,
  runs,
  credentials,
} from "../db/schema";
import { normalizeAgent } from "../lib/agent-config";
import {
  delegateTask,
  delegateTasks,
  draftSpecialist,
} from "../lib/server/delegation";
import { type RunPayload } from "../lib/server/runtime";
import { seal } from "../lib/server/secrets";
import { getRedis } from "../lib/server/redis";
import { agentQueue } from "../lib/server/queue";
try {
  process.loadEnvFile();
} catch {}
// Dedicated Redis database keeps test jobs away from the real worker.
const redis = new URL(process.env.REDIS_URL!);
redis.pathname = "/12";
process.env.REDIS_URL = redis.toString();
const fixtureId = crypto.randomUUID();
const orgId = "test-parallel-" + fixtureId,
  userId = "test-parallel-user-" + fixtureId;
const db = getDb();
const base = normalizeAgent({
  id: "coordinator-" + fixtureId,
  name: "Test coordinator",
  description: "Local transport fixture",
  instructions: "Return a concise fixture response.",
  provider: "anthropic",
  model: "fixture-model",
  category: "Testing",
  icon: "sparkles",
  color: "orange",
  tools: [],
  knowledgeScope: "none",
});
const specialist = normalizeAgent({
  ...base,
  id: "specialist-" + fixtureId,
  name: "Test specialist",
  delegateAgentIds: [base.id],
  toolkits: ["gmail"],
  mcpTools: [{ connectionId: crypto.randomUUID(), tools: ["fixture"] }],
});
const second = normalizeAgent({
  ...specialist,
  id: "second-" + fixtureId,
  name: "Second specialist",
});
const failing = normalizeAgent({
  ...second,
  id: "failing-" + fixtureId,
  model: "fixture-failure",
});
const unconfigured = normalizeAgent({
  ...second,
  id: "unconfigured-" + fixtureId,
  provider: "openai",
  model: "fixture-missing",
});
const coordinator = normalizeAgent({
  ...base,
  delegateAgentIds: [specialist.id, second.id, failing.id, unconfigured.id],
});
let server: Server,
  requests = 0,
  active = 0,
  maxActive = 0,
  hold = false;
async function parent() {
  const id = crypto.randomUUID(),
    chatId = crypto.randomUUID();
  await db.insert(records).values({
    organizationId: orgId,
    createdBy: userId,
    id: chatId,
    kind: "chat",
    data: {
      id: chatId,
      agentId: coordinator.id,
      title: "Parallel fixture",
      messages: [{ role: "user", content: "Coordinate fixture tasks" }],
      updatedAt: new Date().toISOString(),
    },
  });
  await db.insert(runs).values({
    id,
    organizationId: orgId,
    createdBy: userId,
    chatId,
    agentId: coordinator.id,
    status: "running",
    payload: {
      agent: coordinator,
      messages: [{ role: "user", content: "Coordinate fixture tasks" }],
      pending: [],
      trace: [],
      sources: [],
    },
  });
  return id;
}
async function children(parentId: string) {
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.organizationId, orgId),
        sql`${runs.payload}->>'parentRunId'=${parentId}`,
      ),
    );
}
before(async () => {
  await db.insert(user).values({
    id: userId,
    name: "Parallel fixture",
    email: userId + "@example.invalid",
  });
  await db
    .insert(organization)
    .values({ id: orgId, name: "Parallel fixture", slug: orgId });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: "member",
  });
  for (const agent of [coordinator, specialist, second, failing, unconfigured])
    await db.insert(records).values({
      organizationId: orgId,
      createdBy: userId,
      id: agent.id,
      kind: "agent",
      data: agent,
    });
  await db.insert(credentials).values({
    organizationId: orgId,
    provider: "anthropic",
    ciphertext: await seal("local-parallel-fixture-only", orgId, "anthropic"),
    lastFour: "test",
    models: ["fixture-model", "fixture-failure"],
  });
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const model = JSON.parse(body).model;
    requests++;
    active++;
    maxActive = Math.max(active, maxActive);
    res.once("close", () => {
      active--;
    });
    if (hold) return;
    await new Promise((resolve) => setTimeout(resolve, 220));
    if (model === "fixture-failure") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Local fixture rejection",
          },
        }),
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const events = [
      [
        "message_start",
        {
          type: "message_start",
          message: {
            id: "msg_fixture",
            type: "message",
            role: "assistant",
            model,
            content: [],
            stop_reason: null,
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
      ],
      [
        "content_block_start",
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
      ],
      [
        "content_block_delta",
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Local specialist result" },
        },
      ],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      [
        "message_delta",
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 3 },
        },
      ],
      ["message_stop", { type: "message_stop" }],
    ];
    for (const [event, data] of events)
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.ALLOW_SHARED_PROVIDER_KEYS = "false";
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    server.close();
  }
  const owned = await db
    .select({ id: runs.id })
    .from(runs)
    .where(eq(runs.organizationId, orgId));
  for (const row of owned) {
    const job = await agentQueue().getJob(row.id);
    if (job) await job.remove();
  }
  await agentQueue().close();
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, userId));
  await getRedis().quit();
  await getSql().end();
});

test("batch validates every target and provider before creating child work", async () => {
  const id = await parent(),
    beforeRequests = requests;
  await assert.rejects(
    delegateTasks(
      id,
      [
        { agentId: specialist.id, task: "First valid task" },
        { agentId: "not-permitted", task: "Invalid second task" },
      ],
      "invalid-target",
    ),
    /not permitted/,
  );
  await assert.rejects(
    delegateTasks(
      id,
      [
        { agentId: specialist.id, task: "First valid task" },
        { agentId: unconfigured.id, task: "No provider configured" },
      ],
      "invalid-model",
    ),
    /Connect the specialist/,
  );
  assert.equal((await children(id)).length, 0);
  assert.equal(requests, beforeRequests);
  await assert.rejects(delegateTasks(id, [], "empty"), /one or two/);
  await assert.rejects(
    delegateTasks(
      id,
      Array.from({ length: 3 }, () => ({
        agentId: specialist.id,
        task: "Too many tasks",
      })),
      "too-many",
    ),
    /one or two/,
  );
});
test("parallel specialists overlap, deduplicate exact batches, preserve scope, and share the two-handoff budget", async () => {
  const id = await parent();
  maxActive = 0;
  const tasks = [
    { agentId: specialist.id, task: "First independent draft" },
    { agentId: second.id, task: "Second independent draft" },
  ];
  const result = await delegateTasks(id, tasks, "parallel-call");
  assert.equal(result.status, "completed");
  assert.equal(maxActive, 2);
  assert.equal(result.results.length, 2);
  for (const item of result.results) {
    assert.equal(item.output, "Local specialist result");
    assert.ok(item.conversationUrl);
    assert.match(item.conversationUrl, /^\/conversation\//);
  }
  const beforeRequests = requests;
  const repeat = await delegateTasks(
    id,
    tasks.map((t) => ({ task: t.task, agentId: t.agentId })),
    "parallel-call",
  );
  assert.deepEqual(
    repeat.results.map((r) => r.runId),
    result.results.map((r) => r.runId),
  );
  assert.equal(requests, beforeRequests);
  await assert.rejects(
    delegateTasks(id, [...tasks].reverse(), "parallel-call"),
    /different task or batch/,
  );
  await assert.rejects(
    delegateTask(id, specialist.id, tasks[0].task, "parallel-call"),
    /different task or batch/,
  );
  await assert.rejects(
    delegateTask(id, specialist.id, "Third handoff", "third"),
    /limit of two/,
  );
  const rows = await children(id);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.createdBy, userId);
    const snapshot = (row.payload as RunPayload).agent;
    assert.deepEqual(snapshot.delegateAgentIds, []);
    assert.deepEqual(snapshot.toolkits, []);
    assert.deepEqual(snapshot.mcpTools, []);
    assert.equal(snapshot.externalPolicy, "read-only");
    assert.equal(snapshot.knowledgeScope, "none");
    await db.update(runs).set({ status: "running" }).where(eq(runs.id, row.id));
    await assert.rejects(
      delegateTasks(
        row.id,
        [{ agentId: coordinator.id, task: "Must not recurse" }],
        "recursive",
      ),
      /cannot delegate further/,
    );
    await db
      .update(runs)
      .set({ status: "completed" })
      .where(eq(runs.id, row.id));
  }
});
test("one specialist failure preserves the other specialist's durable successful result", async () => {
  const id = await parent();
  const result = await delegateTasks(
    id,
    [
      { agentId: specialist.id, task: "A successful bounded draft" },
      { agentId: failing.id, task: "A failing bounded draft" },
    ],
    "partial-call",
  );
  assert.equal(result.status, "partial");
  assert.equal(result.results[0].status, "completed");
  assert.equal(result.results[1].status, "failed");
  assert.equal((await children(id)).length, 2);
});
test("coordinator cancellation reaches both active child runs", async () => {
  const id = await parent(),
    controller = new AbortController();
  hold = true;
  const beforeRequests = requests;
  const pending = delegateTasks(
    id,
    [
      { agentId: specialist.id, task: "Wait for parent cancellation" },
      { agentId: second.id, task: "Also wait for parent cancellation" },
    ],
    "cancel-call",
    controller.signal,
  );
  const deadline = Date.now() + 5000;
  while (requests < beforeRequests + 2 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  const result = await pending;
  hold = false;
  assert.equal(result.status, "cancelled");
  assert.equal((await children(id)).length, 2);
  for (const row of await children(id)) assert.equal(row.status, "cancelled");
});
test("scope intersection cannot expand either agent's selected documents", () => {
  const parent = normalizeAgent({
    ...coordinator,
    knowledgeScope: "selected",
    documentIds: ["a", "b"],
  });
  const child = normalizeAgent({
    ...specialist,
    knowledgeScope: "selected",
    documentIds: ["b", "c"],
  });
  assert.deepEqual(draftSpecialist(parent, child).documentIds, ["b"]);
  assert.equal(
    draftSpecialist({ ...parent, knowledgeScope: "none" }, child)
      .knowledgeScope,
    "none",
  );
});

test("a skill needing external apps blocks the entire batch before launch", async () => {
  const id = await parent(),
    skillId = crypto.randomUUID(),
    beforeRequests = requests;
  await db
    .insert(records)
    .values({
      organizationId: orgId,
      createdBy: userId,
      id: skillId,
      kind: "skill",
      data: {
        id: skillId,
        name: "External fixture recipe",
        description: "Fixture",
        instructions: "Read the selected external email sources.",
        expectedOutput: "Evidence",
        requiredToolkits: ["gmail"],
        version: 1,
        archived: false,
        updatedAt: new Date().toISOString(),
      },
    });
  await db
    .update(records)
    .set({ data: { ...second, skillIds: [skillId] } })
    .where(and(eq(records.organizationId, orgId), eq(records.id, second.id)));
  try {
    await assert.rejects(
      delegateTasks(
        id,
        [
          { agentId: specialist.id, task: "Valid first task" },
          { agentId: second.id, task: "Second task needs external skills" },
        ],
        "skill-access",
      ),
      /skill that requires external apps/,
    );
    assert.equal((await children(id)).length, 0);
    assert.equal(requests, beforeRequests);
  } finally {
    await db
      .update(records)
      .set({ data: second })
      .where(and(eq(records.organizationId, orgId), eq(records.id, second.id)));
  }
});
