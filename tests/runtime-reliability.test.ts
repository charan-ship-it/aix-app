import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getSql } from "../db";
import {
  user,
  organization,
  member,
  records,
  runs,
  credentials,
  schedules,
} from "../db/schema";
import { normalizeAgent } from "../lib/agent-config";
import {
  authorizeRunContext,
  enqueueRun,
  approveRun,
  runAgent,
  type RunPayload,
} from "../lib/server/runtime";
import { recoverRuns, recoverIndexing } from "../lib/server/recovery";
import {
  redisConnection,
  agentQueue,
  scheduleQueue,
  indexingQueue,
  documentJobId,
} from "../lib/server/queue";
import {
  executeScheduledRun,
  reconcileSchedules,
  scheduleRunIdentity,
} from "../lib/server/scheduler";
import { getRedis, withLock } from "../lib/server/redis";
import { seal } from "../lib/server/secrets";
try {
  process.loadEnvFile();
} catch {}
// Isolated Redis database: these tests never dispatch fixture jobs to the live worker.
const redisUrl = new URL(process.env.REDIS_URL!);
redisUrl.pathname = "/13";
process.env.REDIS_URL = redisUrl.toString();
const id = crypto.randomUUID();
const orgId = "test-reliability-" + id,
  userId = "test-user-" + id,
  otherId = "test-other-" + id;
const agent = normalizeAgent({
  id: "test-agent-" + id,
  name: "Test fixture",
  category: "Testing",
  icon: "sparkles",
  color: "orange",
  description: "Reliability fixture",
  instructions: "Return the test fixture response.",
  provider: "anthropic",
  model: "test-model",
  tools: [],
  toolkits: [],
  knowledgeScope: "none",
});
const db = getDb();
let server: Server;
let requests = 0;
let delegationFixture: { specialistId: string; secondSpecialistId?: string } | undefined;
let parallelActive = 0, parallelPeak = 0;
let onRequest: (() => Promise<void>) | undefined;
const fixture = (chatId: string) => ({
  organizationId: orgId,
  createdBy: userId,
  chatId,
  agentId: agent.id,
});
async function chat(podId?: string) {
  const chatId = crypto.randomUUID();
  await db.insert(records).values({
    organizationId: orgId,
    createdBy: userId,
    id: chatId,
    kind: "chat",
    data: {
      id: chatId,
      agentId: agent.id,
      podId,
      title: "Test",
      messages: [{ role: "user", content: "fixture" }],
      updatedAt: new Date().toISOString(),
    },
  });
  return chatId;
}
async function run(chatId: string, status = "queued", updatedAt = new Date()) {
  const runId = crypto.randomUUID();
  const payload: RunPayload = {
    agent,
    messages: [{ role: "user", content: "fixture" }],
    pending: [],
    trace: [],
    sources: [],
  };
  await db
    .insert(runs)
    .values({ ...fixture(chatId), id: runId, status, payload, updatedAt });
  return runId;
}
before(async () => {
  await db.insert(user).values([
    { id: userId, name: "Test fixture", email: userId + "@example.invalid" },
    { id: otherId, name: "Test owner", email: otherId + "@example.invalid" },
  ]);
  await db
    .insert(organization)
    .values({ id: orgId, name: "Test reliability", slug: orgId });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: "member",
  });
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
    ciphertext: await seal("local-transport-fixture-only", orgId, "anthropic"),
    lastFour: "test",
    models: ["test-model"],
  });
  server = createServer(async (_req, res) => {
    let bodyText = "";
    for await (const chunk of _req) bodyText += chunk;
    const requestBody = bodyText ? JSON.parse(bodyText) : {};
    requests++;
    await onRequest?.();
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const events: Array<[string, Record<string, unknown>]> = [
      [
        "message_start",
        {
          type: "message_start",
          message: {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: "test-model",
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
          delta: { type: "text_delta", text: "Fixture answer" },
        },
      ],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      [
        "message_delta",
        {
          type: "message_delta",
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 2 },
        },
      ],
      ["message_stop", { type: "message_stop" }],
    ];
    if (
      delegationFixture &&
      requestBody.tools?.some(
        (t: { name: string }) => t.name === "delegate_task",
      ) &&
      !JSON.stringify(requestBody.messages).includes('"tool_result"')
    ) {
      const input = delegationFixture.secondSpecialistId ? {tasks: [
        {agentId: delegationFixture.specialistId, task: "Prepare a short draft using only the permitted test context."},
        {agentId: delegationFixture.secondSpecialistId, task: "Independently review the evidence and prepare a short second draft."},
      ]} : {
        agentId: delegationFixture.specialistId,
        task: "Prepare a short draft using only the permitted test context.",
      };
      events.splice(
        1,
        events.length - 1,
        [
          "content_block_start",
          {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "delegation_test_tool",
              name: delegationFixture.secondSpecialistId ? "delegate_tasks" : "delegate_task",
              input: {},
            },
          },
        ],
        [
          "content_block_delta",
          {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "input_json_delta",
              partial_json: JSON.stringify(input),
            },
          },
        ],
        ["content_block_stop", { type: "content_block_stop", index: 0 }],
        [
          "message_delta",
          {
            type: "message_delta",
            delta: { stop_reason: "tool_use", stop_sequence: null },
            usage: { output_tokens: 2 },
          },
        ],
        ["message_stop", { type: "message_stop" }],
      );
    }
    if (delegationFixture?.secondSpecialistId && !requestBody.tools?.some((t: {name: string}) => t.name === "delegate_task")) {
      parallelActive++; parallelPeak = Math.max(parallelPeak, parallelActive);
      // Hold each response briefly so the test can observe overlapping real child model requests.
      await new Promise(resolve => setTimeout(resolve, 120));
      parallelActive--;
    }
    for (const [event, data] of events)
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
});
after(async () => {
  if (server) {
    server.close();
    await once(server, "close");
  }
  // Only fixture rows and fixture jobs are removed; never flush shared databases.
  const definitions = await db
    .select()
    .from(schedules)
    .where(eq(schedules.organizationId, orgId));
  for (const definition of definitions)
    await scheduleQueue().removeJobScheduler(definition.id);
  const scheduleIds = new Set(definitions.map((d) => d.id));
  for (const queue of [agentQueue(), indexingQueue(), scheduleQueue()]) {
    for (const job of await queue.getJobs([
      "wait",
      "active",
      "delayed",
      "completed",
      "failed",
    ])) {
      if (
        job.data.organizationId === orgId ||
        scheduleIds.has(job.data.scheduleId) ||
        (
          await db
            .select({ id: runs.id })
            .from(runs)
            .where(
              and(
                eq(runs.organizationId, orgId),
                eq(runs.id, job.data.runId || ""),
              ),
            )
            .limit(1)
        ).length
      )
        await job.remove();
    }
    await queue.close();
  }
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, userId));
  await db.delete(user).where(eq(user.id, otherId));
  await getRedis().quit();
  await getSql().end();
});
test("a Redis stream outage cannot turn a committed successful run into failure", async () => {
  const chatId = await chat(),
    runId = await run(chatId);
  const redis = getRedis(),
    original = redis.xadd;
  redis.xadd = (async () => {
    throw new Error("Injected publication outage");
  }) as typeof redis.xadd;
  try {
    await runAgent(runId);
  } finally {
    redis.xadd = original;
  }
  const [result] = await db.select().from(runs).where(eq(runs.id, runId));
  assert.equal(result.status, "completed");
  const [record] = await db
    .select()
    .from(records)
    .where(and(eq(records.organizationId, orgId), eq(records.id, chatId)));
  const messages = (
    record.data as { messages: { content: string; error?: boolean }[] }
  ).messages;
  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "Fixture answer");
  assert.equal(messages[1].error, undefined);
});
test("execution rechecks Pod access, archived Pods and archived agents", async () => {
  const podId = crypto.randomUUID();
  await db.insert(records).values({
    organizationId: orgId,
    createdBy: otherId,
    id: podId,
    kind: "pod",
    data: {
      id: podId,
      name: "Fixture Pod",
      access: "organization",
      archived: false,
      defaultAgentId: agent.id,
    },
  });
  const chatId = await chat(podId);
  await authorizeRunContext(fixture(chatId));
  await db
    .update(records)
    .set({ data: { id: podId, access: "private", archived: false } })
    .where(and(eq(records.organizationId, orgId), eq(records.id, podId)));
  await assert.rejects(authorizeRunContext(fixture(chatId)), /Pod not found/);
  await db
    .update(records)
    .set({ data: { id: podId, access: "organization", archived: true } })
    .where(and(eq(records.organizationId, orgId), eq(records.id, podId)));
  await assert.rejects(authorizeRunContext(fixture(chatId)), /Pod is archived/);
  const plainChat = await chat();
  await db
    .update(records)
    .set({ data: { ...agent, archived: true } })
    .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  await assert.rejects(
    authorizeRunContext(fixture(plainChat)),
    /agent is archived/,
  );
  await db
    .update(records)
    .set({ data: agent })
    .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
});
test("stale running work fails safely while queued work is recovered without duplicate dispatch", async () => {
  const stale = new Date(Date.now() - 360000);
  const staleRun = await run(await chat(), "running", stale);
  const queuedRun = await run(await chat(), "queued", stale);
  const currentRun = await run(await chat(), "running");
  const count = requests;
  await recoverRuns(orgId);
  await recoverRuns(orgId);
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.organizationId, orgId));
  assert.equal(rows.find((r) => r.id === staleRun)?.status, "failed");
  assert.equal(rows.find((r) => r.id === currentRun)?.status, "running");
  const jobs = await agentQueue().getJobs(["wait", "delayed"]);
  assert.equal(jobs.filter((j) => j.data.runId === queuedRun).length, 1);
  assert.equal(requests, count, "recovery must not replay external/model work");
});
test("lost indexing dispatch is recovered once and active/waiting jobs are respected", async () => {
  const docId = crypto.randomUUID(),
    updatedAt = new Date(Date.now() - 60000).toISOString();
  const doc = {
    id: docId,
    name: "Fixture.md",
    content: "Current document version",
    updatedAt,
    status: "queued",
  };
  await db.insert(records).values({
    organizationId: orgId,
    createdBy: userId,
    id: docId,
    kind: "document",
    data: doc,
    updatedAt: new Date(updatedAt),
  });
  await recoverIndexing(orgId);
  await recoverIndexing(orgId);
  let jobs = await indexingQueue().getJobs(["wait", "delayed"]);
  assert.equal(jobs.filter((j) => j.data.documentId === docId).length, 1);
  assert.equal(
    jobs.find((j) => j.data.documentId === docId)?.id,
    documentJobId(orgId, docId, doc.content, doc.updatedAt),
  );
  assert.notEqual(
    documentJobId(orgId, docId, "changed", doc.updatedAt),
    documentJobId(orgId, docId, doc.content, doc.updatedAt),
  );
  await db
    .update(records)
    .set({ data: { ...doc, content: "Changed after queue acceptance" } })
    .where(and(eq(records.organizationId, orgId), eq(records.id, docId)));
  await recoverIndexing(orgId);
  jobs = await indexingQueue().getJobs(["wait", "delayed"]);
  assert.equal(
    jobs.filter((j) => j.data.documentId === docId).length,
    1,
    "existing job loads and indexes current DB content",
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const worker = new Worker("knowledge-index", async () => gate, {
    connection: redisConnection(),
    concurrency: 1,
  });
  try {
    await once(worker, "active");
    await recoverIndexing(orgId);
    const active = await indexingQueue().getJobs(["active", "wait", "delayed"]);
    assert.equal(
      active.filter((job) => job.data.documentId === docId).length,
      1,
      "an active index is never duplicated by reconciliation",
    );
    const completed = once(worker, "completed");
    release();
    await completed;
  } finally {
    release();
    await worker.close();
  }
});

test("a late worker cannot overwrite an already terminal run", async () => {
  const chatId = await chat(),
    runId = await run(chatId);
  onRequest = async () => {
    await db.update(runs).set({ status: "failed" }).where(eq(runs.id, runId));
  };
  try {
    await runAgent(runId);
  } finally {
    onRequest = undefined;
  }
  const [result] = await db.select().from(runs).where(eq(runs.id, runId));
  assert.equal(result.status, "failed");
  const [record] = await db
    .select()
    .from(records)
    .where(and(eq(records.organizationId, orgId), eq(records.id, chatId)));
  assert.equal((record.data as { messages: unknown[] }).messages.length, 1);
});
test("archived agents reject new runs and suspended approvals before dispatch", async () => {
  const chatId = await chat(),
    runId = await run(chatId, "awaiting_approval");
  const workspaceUser = {
    organizationId: orgId,
    userId,
    displayName: "Test fixture",
    email: "test@example.invalid",
    organizationName: "Fixture",
    role: "member",
  };
  await db
    .update(records)
    .set({ data: { ...agent, archived: true } })
    .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  try {
    await assert.rejects(
      enqueueRun(workspaceUser, agent.id, "Should not run"),
      /agent is archived/,
    );
    await assert.rejects(
      approveRun(workspaceUser, runId, true),
      /agent is archived/,
    );
    const [result] = await db.select().from(runs).where(eq(runs.id, runId));
    assert.equal(result.status, "awaiting_approval");
  } finally {
    await db
      .update(records)
      .set({ data: agent })
      .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  }
});

async function schedule() {
  const id = crypto.randomUUID();
  await db.insert(schedules).values({
    id,
    organizationId: orgId,
    createdBy: userId,
    agentId: agent.id,
    name: "Reliability schedule fixture",
    prompt: "Fixture only",
    pattern: "17 9 * * *",
    timezone: "Asia/Kolkata",
  });
  return id;
}
test("lock release outages preserve successful results and original failures", async () => {
  const redis = getRedis(),
    original = redis.eval;
  const successKey = "test-lock-success-" + crypto.randomUUID(),
    failureKey = "test-lock-failure-" + crypto.randomUUID();
  redis.eval = (async () => {
    throw Error("Injected release failure");
  }) as typeof redis.eval;
  try {
    assert.equal(
      await withLock(successKey, async () => "committed"),
      "committed",
    );
    await assert.rejects(
      withLock(failureKey, async () => {
        throw Error("Original operation failure");
      }),
      /Original operation failure/,
    );
  } finally {
    redis.eval = original;
    await redis.del("lock:" + successKey, "lock:" + failureKey);
  }
});
test("PostgreSQL independently rejects concurrent active runs for one conversation", async () => {
  const chatId = await chat(),
    first = await run(chatId);
  for (const status of ["queued", "running", "awaiting_approval"]) {
    await db.update(runs).set({ status }).where(eq(runs.id, first));
    await assert.rejects(run(chatId), (error: unknown) => {
      const e = error as { code?: string; cause?: { code?: string } };
      return e.code === "23505" || e.cause?.code === "23505";
    });
  }
  await db.update(runs).set({ status: "completed" }).where(eq(runs.id, first));
  assert.ok(await run(chatId));
});
test("scheduler definitions recover after Redis loss without changing timezone or next occurrence", async () => {
  const id = await schedule();
  await reconcileSchedules(orgId);
  const initial = await scheduleQueue().getJobScheduler(id);
  assert.equal(initial?.pattern, "17 9 * * *");
  assert.equal(initial?.tz, "Asia/Kolkata");
  await reconcileSchedules(orgId);
  assert.equal(
    (await scheduleQueue().getJobScheduler(id))?.next,
    initial?.next,
  );
  await scheduleQueue().removeJobScheduler(id);
  assert.equal(await scheduleQueue().getJobScheduler(id), undefined);
  await reconcileSchedules(orgId);
  assert.equal(
    (await scheduleQueue().getJobScheduler(id))?.pattern,
    initial?.pattern,
  );
  assert.equal((await scheduleQueue().getJobScheduler(id))?.tz, initial?.tz);
  await db
    .update(schedules)
    .set({ enabled: false })
    .where(eq(schedules.id, id));
  await reconcileSchedules(orgId);
  assert.equal(await scheduleQueue().getJobScheduler(id), undefined);
});
test("scheduled occurrence redelivery never creates duplicate work or conversations", async () => {
  const id = await schedule(),
    occurrence = "repeat:" + id + ":1793055600000";
  const expected = scheduleRunIdentity(orgId, id, occurrence);
  assert.deepEqual(await executeScheduledRun(id, occurrence), expected);
  assert.deepEqual(await executeScheduledRun(id, occurrence), expected);
  let rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.organizationId, orgId), eq(runs.id, expected.runId)));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "queued");
  await db
    .update(runs)
    .set({ status: "completed" })
    .where(eq(runs.id, expected.runId));
  await executeScheduledRun(id, occurrence);
  rows = await db.select().from(runs).where(eq(runs.id, expected.runId));
  assert.equal(
    rows[0].status,
    "completed",
    "redelivery must not replay completed external work",
  );
  const chats = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, orgId),
        eq(records.id, expected.chatId),
        eq(records.kind, "chat"),
      ),
    );
  assert.equal(chats.length, 1);
  const next = await executeScheduledRun(id, "repeat:" + id + ":1793142000000");
  assert.notEqual(next?.runId, expected.runId);
  assert.notEqual(next?.chatId, expected.chatId);
  await db
    .update(records)
    .set({ data: { ...agent, archived: true } })
    .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  try {
    const failed = await executeScheduledRun(
      id,
      "repeat:" + id + ":1793228400000",
    );
    await executeScheduledRun(id, "repeat:" + id + ":1793228400000");
    const failures = await db
      .select()
      .from(runs)
      .where(eq(runs.id, failed!.runId));
    assert.equal(failures.length, 1);
    assert.equal(failures[0].status, "failed");
  } finally {
    await db
      .update(records)
      .set({ data: agent })
      .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  }
});

test("approved specialist delegation has its own durable result, restricted scope and parent link", async () => {
  const specialist = normalizeAgent({
    ...agent,
    id: "specialist-" + id,
    name: "Specialist fixture",
    knowledgeScope: "all",
    tools: ["calculator"],
    toolkits: ["gmail"],
    delegateAgentIds: [agent.id],
  });
  const coordinator = normalizeAgent({
    ...agent,
    delegateAgentIds: [specialist.id],
  });
  await db.insert(records).values({
    organizationId: orgId,
    createdBy: userId,
    id: specialist.id,
    kind: "agent",
    data: specialist,
  });
  await db
    .update(records)
    .set({ data: coordinator })
    .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  const chatId = await chat(),
    parentId = await run(chatId);
  const [parent] = await db.select().from(runs).where(eq(runs.id, parentId));
  await db
    .update(runs)
    .set({ payload: { ...parent.payload, agent: coordinator } })
    .where(eq(runs.id, parentId));
  delegationFixture = { specialistId: specialist.id };
  try {
    await runAgent(parentId);
    const [waiting] = await db.select().from(runs).where(eq(runs.id, parentId));
    assert.equal(waiting.status, "awaiting_approval");
    const pending = (waiting.payload as RunPayload).pending;
    assert.equal(pending[0].tool, "delegate_task");
    assert.equal(
      (
        await db
          .select()
          .from(runs)
          .where(sql`${runs.payload}->>'parentRunId'=${parentId}`)
      ).length,
      0,
      "no child can start before the handoff is approved",
    );
    await approveRun(
      { organizationId: orgId, userId, role: "member" } as any,
      parentId,
      true,
      pending.map((p) => p.id),
    );
    await runAgent(parentId);
    const [finished] = await db
      .select()
      .from(runs)
      .where(eq(runs.id, parentId));
    assert.equal(finished.status, "completed");
    const children = await db
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, orgId),
          sql`${runs.payload}->>'parentRunId'=${parentId}`,
        ),
      );
    assert.equal(children.length, 1);
    const child = children[0],
      snapshot = (child.payload as RunPayload).agent;
    assert.equal(child.status, "completed");
    assert.equal(child.createdBy, userId);
    assert.equal(snapshot.knowledgeScope, "none");
    assert.deepEqual(snapshot.toolkits, []);
    assert.deepEqual(snapshot.mcpTools, []);
    assert.deepEqual(snapshot.delegateAgentIds, []);
    const [record] = await db
      .select()
      .from(records)
      .where(
        and(eq(records.organizationId, orgId), eq(records.id, child.chatId)),
      );
    assert.equal((record.data as any).delegatedFrom.chatId, chatId);
    assert.ok(
      JSON.stringify(finished.payload).includes(child.id),
      "the parent receives the durable child result",
    );
    assert.ok(JSON.stringify(finished.payload).includes("Fixture answer"));
  } finally {
    delegationFixture = undefined;
    await db
      .update(records)
      .set({ data: agent })
      .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  }
});

test("delegation rejects unauthorized targets and recursive handoffs and deduplicates a tool call", async () => {
  const { delegateTask } = await import("../lib/server/delegation");
  const specialist = normalizeAgent({
    ...agent,
    id: "bounded-specialist-" + id,
    name: "Bounded specialist",
    delegateAgentIds: [agent.id],
  });
  const coordinator = normalizeAgent({
    ...agent,
    delegateAgentIds: [specialist.id],
  });
  await db.insert(records).values({
    organizationId: orgId,
    createdBy: userId,
    id: specialist.id,
    kind: "agent",
    data: specialist,
  });
  await db
    .update(records)
    .set({ data: coordinator })
    .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
  const parentId = await run(await chat(), "running");
  const [parent] = await db.select().from(runs).where(eq(runs.id, parentId));
  await db
    .update(runs)
    .set({ payload: { ...parent.payload, agent: coordinator } })
    .where(eq(runs.id, parentId));
  try {
    await assert.rejects(
      delegateTask(
        parentId,
        agent.id,
        "A task that must never delegate back to itself.",
        "self",
      ),
      /not permitted/,
    );
    await assert.rejects(
      delegateTask(
        parentId,
        "foreign-agent",
        "A task that must not cross workspace boundaries.",
        "foreign",
      ),
      /not permitted/,
    );
    const task = "Produce a small bounded draft from the permitted context.";
    const first = await delegateTask(
      parentId,
      specialist.id,
      task,
      "repeatable-call",
    );
    const before = requests;
    const repeated = await delegateTask(
      parentId,
      specialist.id,
      task,
      "repeatable-call",
    );
    assert.equal(repeated.runId, first.runId);
    await assert.rejects(
      delegateTask(
        parentId,
        specialist.id,
        task + " Changed task.",
        "repeatable-call",
      ),
      /different task/,
    );
    assert.equal(
      requests,
      before,
      "a repeated tool call must not generate again",
    );
    await db
      .update(runs)
      .set({ status: "running" })
      .where(eq(runs.id, first.runId));
    await assert.rejects(
      delegateTask(first.runId, agent.id, task, "recursive"),
      /cannot delegate further/,
    );
    await db
      .update(runs)
      .set({ status: "completed" })
      .where(eq(runs.id, first.runId));
    await delegateTask(parentId, specialist.id, task, "second-call");
    await assert.rejects(
      delegateTask(parentId, specialist.id, task, "third-call"),
      /limit of two/,
    );
  } finally {
    await db
      .update(records)
      .set({ data: agent })
      .where(and(eq(records.organizationId, orgId), eq(records.id, agent.id)));
    await db
      .update(runs)
      .set({ status: "cancelled" })
      .where(eq(runs.id, parentId));
  }
});

test("a parallel batch waits for approval and runs two bounded specialists concurrently", async () => {
  const children = [0,1].map(i => normalizeAgent({...agent,id:`parallel-${i}-${id}`,name:`Parallel specialist ${i}`,tools:[]}));
  const coordinator = normalizeAgent({...agent, delegateAgentIds: children.map(c=>c.id)});
  for(const child of children)await db.insert(records).values({organizationId:orgId,createdBy:userId,id:child.id,kind:'agent',data:child});
  await db.update(records).set({data:coordinator}).where(and(eq(records.organizationId,orgId),eq(records.id,agent.id)));
  const chatId=await chat(), parentId=await run(chatId);
  const [parent]=await db.select().from(runs).where(eq(runs.id,parentId));
  await db.update(runs).set({payload:{...parent.payload,agent:coordinator}}).where(eq(runs.id,parentId));
  delegationFixture={specialistId:children[0].id,secondSpecialistId:children[1].id};
  parallelPeak=0;
  try {
    await runAgent(parentId);
    const [waiting]=await db.select().from(runs).where(eq(runs.id,parentId));
    assert.equal(waiting.status,'awaiting_approval');
    const pending=(waiting.payload as RunPayload).pending;
    assert.equal(pending[0].tool,'delegate_tasks');
    assert.equal((await db.select().from(runs).where(sql`${runs.payload}->>'parentRunId'=${parentId}`)).length,0);
    await approveRun({organizationId:orgId,userId,role:'member'} as any,parentId,true,pending.map(p=>p.id));
    await runAgent(parentId);
    const [finished]=await db.select().from(runs).where(eq(runs.id,parentId));
    assert.equal(finished.status,'completed');
    const childRuns=await db.select().from(runs).where(and(eq(runs.organizationId,orgId),sql`${runs.payload}->>'parentRunId'=${parentId}`));
    assert.equal(childRuns.length,2);
    assert.ok(childRuns.every(c=>c.status==='completed' && c.createdBy===userId));
    assert.equal(parallelPeak,2,'both child model requests overlap before either result is returned');
    for(const child of childRuns)assert.ok(JSON.stringify(finished.payload).includes(child.id));
  } finally {
    delegationFixture=undefined;
    await db.update(records).set({data:agent}).where(and(eq(records.organizationId,orgId),eq(records.id,agent.id)));
  }
});

test("agent runs pin published skill revisions without changing permitted apps", async () => {
  const {saveSkill}=await import('../lib/server/skills');
  const owner={organizationId:orgId,userId,role:'owner',email:'fixture@example.invalid',displayName:'Fixture',organizationName:'Fixture'} as any;
  const skill=await saveSkill(owner,{expectedVersion:0,name:'Evidence review',description:'Fixture procedure',instructions:'Use the original procedure and cite every available source.',expectedOutput:'Evidence and uncertainty',requiredToolkits:[]});
  const configured=normalizeAgent({...agent,skillIds:[skill.id]});
  await db.update(records).set({data:configured}).where(and(eq(records.organizationId,orgId),eq(records.id,agent.id)));
  try{
    const first=await enqueueRun(owner,agent.id,'Apply the evidence review skill to this fixture.',crypto.randomUUID());
    await saveSkill(owner,{...skill,expectedVersion:1,instructions:'Use the revised procedure and identify unresolved questions.'});
    const [run1]=await db.select().from(runs).where(eq(runs.id,first.runId));
    const snapshot=run1.payload as RunPayload;
    assert.equal(snapshot.skills?.[0].version,1);
    assert.match(snapshot.agent.instructions,/original procedure/);
    assert.doesNotMatch(snapshot.agent.instructions,/revised procedure/);
    assert.deepEqual(snapshot.agent.toolkits,[]);
    const second=await enqueueRun(owner,agent.id,'Apply the newest evidence review skill to another fixture.',crypto.randomUUID());
    const [run2]=await db.select().from(runs).where(eq(runs.id,second.runId));
    assert.equal((run2.payload as RunPayload).skills?.[0].version,2);
    assert.match((run2.payload as RunPayload).agent.instructions,/revised procedure/);
    const gated=await saveSkill(owner,{expectedVersion:0,name:'Inbox review',description:'App requirement fixture',instructions:'Read only the permitted inbox and cite evidence.',expectedOutput:'Evidence',requiredToolkits:['gmail']});
    await db.update(records).set({data:normalizeAgent({...agent,skillIds:[gated.id]})}).where(and(eq(records.organizationId,orgId),eq(records.id,agent.id)));
    await assert.rejects(()=>enqueueRun(owner,agent.id,'This skill cannot grant Gmail access.',crypto.randomUUID()),{status:400});
  }finally{await db.update(records).set({data:agent}).where(and(eq(records.organizationId,orgId),eq(records.id,agent.id)));}
});
