import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { user, organization, member, records, credentials } from "../db/schema";
import { skillSchema } from "../lib/skills";
import { learningProposalSchema } from "../lib/learning";
import {
  candidateEvaluationEligible,
  canonicalSkillContent,
  evaluationCaseSchema,
  evaluationSuiteSaveSchema,
  scoreEvaluationOutput,
} from "../lib/evals";
import {
  createSuite,
  listSuites,
  startEvaluation,
  readEvaluations,
  executeEvaluation,
  recoverEvaluations,
  skillContentHash,
  evaluationSuiteHash,
  verifyCandidateEvaluation,
} from "../lib/server/evals";
import { evalQueue, evaluationJobId } from "../lib/server/eval-queue";
import { seal } from "../lib/server/secrets";
import { getRedis } from "../lib/server/redis";
import type { WorkspaceUser } from "../lib/server/http";
try {
  process.loadEnvFile();
} catch {}
const redis = new URL(process.env.REDIS_URL!);
redis.pathname = "/11";
process.env.REDIS_URL = redis.toString();
const fixture = crypto.randomUUID(),
  orgId = "eval-org-" + fixture,
  userId = "eval-user-" + fixture;
const db = getDb(),
  now = new Date().toISOString();
const skill = skillSchema.parse({
  id: crypto.randomUUID(),
  name: "Synthetic evaluation skill",
  description: "Fixture-only recipe",
  instructions:
    "BASELINE: Answer the synthetic user in a concise factual sentence.",
  expectedOutput: "A short answer",
  requiredToolkits: [],
  version: 1,
  archived: false,
  updatedAt: now,
});
const candidate = {
  ...skill,
  instructions:
    "CANDIDATE: Answer the synthetic user with a concise ready response.",
};
const proposal = learningProposalSchema.parse({
  id: crypto.randomUUID(),
  skillId: skill.id,
  baselineVersion: 1,
  baselineHash: skillContentHash(skill),
  baseline: skill,
  candidate,
  candidateHash: skillContentHash(candidate),
  sharedRationale: "Improve this synthetic fixture output.",
  submittedBy: "Fixture",
  status: "proposed",
  createdAt: now,
  updatedAt: now,
});
const actor: WorkspaceUser = {
  userId,
  organizationId: orgId,
  role: "admin",
  displayName: "Evaluation fixture",
  organizationName: "Synthetic eval fixture",
  email: "fixture@example.invalid",
};
const cases = ["first", "second"].map((name) => ({
  id: crypto.randomUUID(),
  name,
  input: "Synthetic evaluation input " + name,
  checks: { contains: ["ready"], notContains: ["forbidden"], maxChars: 100 },
}));
let server: Server,
  requests: Array<Record<string, any>> = [],
  rejectProvider = false;
let onRequest: (() => Promise<void>) | undefined;
async function suite() {
  return createSuite(actor, {
    expectedRevision: 0,
    skillId: skill.id,
    name: "Synthetic case suite",
    cases,
  });
}
async function storedRun(id: string) {
  const [run] = await readEvaluations(actor, { id });
  assert.ok(run);
  return run;
}
before(async () => {
  await db.insert(user).values({
    id: userId,
    name: actor.displayName,
    email: userId + "@example.invalid",
  });
  await db
    .insert(organization)
    .values({ id: orgId, name: actor.organizationName, slug: orgId });
  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId: orgId,
    userId,
    role: "admin",
  });
  await db.insert(records).values([
    {
      organizationId: orgId,
      createdBy: userId,
      id: skill.id,
      kind: "skill",
      data: skill,
    },
    {
      organizationId: orgId,
      createdBy: userId,
      id: proposal.id,
      kind: "learning-proposal",
      data: proposal,
    },
  ]);
  await db.insert(credentials).values({
    organizationId: orgId,
    provider: "anthropic",
    ciphertext: await seal("local-evaluation-fixture-only", orgId, "anthropic"),
    lastFour: "test",
    models: ["fixture-model"],
  });
  server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    requests.push(body);
    await onRequest?.();
    if (rejectProvider) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          type: "error",
          error: {
            type: "authentication_error",
            message: "Synthetic key rejection",
          },
        }),
      );
      return;
    }
    const system = JSON.stringify(body.system),
      answer = system.includes("CANDIDATE")
        ? "Ready: synthetic candidate output."
        : "Synthetic baseline output.";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "msg_eval_fixture",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: answer }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 6 },
      }),
    );
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
  const owned = await readEvaluations(actor);
  for (const run of owned) {
    const job = await evalQueue().getJob(evaluationJobId(orgId, run.id));
    if (job) await job.remove();
  }
  await evalQueue().close();
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, userId));
  await getRedis().quit();
  await getSql().end();
});

test("deterministic checks are explicit, case-insensitive and cannot be empty", () => {
  const scored = scoreEvaluationOutput("Ready with facts", {
    contains: ["READY"],
    notContains: ["invented"],
    maxChars: 20,
  });
  assert.equal(scored.status, "passed");
  assert.equal(scored.assertions.length, 3);
  assert.equal(
    scoreEvaluationOutput("forbidden", {
      contains: [],
      notContains: ["forbidden"],
      maxChars: 5,
    }).status,
    "failed",
  );
  assert.equal(
    evaluationCaseSchema.safeParse({ ...cases[0], checks: {} }).success,
    false,
  );
  assert.equal(
    evaluationSuiteSaveSchema.safeParse({
      expectedRevision: 0,
      skillId: skill.id,
      name: "Invalid",
      cases: Array.from({ length: 7 }, () => cases[0]),
    }).success,
    false,
  );
  assert.equal(
    canonicalSkillContent({ ...skill, requiredToolkits: ["slack", "gmail"] }),
    canonicalSkillContent({ ...skill, requiredToolkits: ["gmail", "slack"] }),
  );
});
test("evaluation suites are admin scoped, versioned, and reject stale edits", async () => {
  const first = await suite();
  const updated = await createSuite(actor, {
    ...first,
    expectedRevision: 1,
    name: "Updated fixture suite",
  });
  assert.equal(updated.revision, 2);
  assert.equal((await listSuites(actor, skill.id)).length, 1);
  await assert.rejects(
    createSuite(actor, { ...first, expectedRevision: 1 }),
    /changed/,
  );
  await assert.rejects(
    listSuites({ ...actor, role: "member" }),
    /owner or admin/,
  );
  await assert.rejects(
    createSuite({ ...actor, role: "member" }, { expectedRevision: 0 }),
    /owner or admin/,
  );
  const versions = await db
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, orgId),
        eq(records.kind, "eval-suite-revision"),
      ),
    );
  assert.equal(versions.length, 2);
});
test("missing provider or inline client candidates cannot queue an evaluation", async () => {
  const saved = await suite(),
    beforeRequests = requests.length;
  await assert.rejects(
    startEvaluation(actor, {
      suiteId: saved.id,
      provider: "openai",
      model: "not-configured",
    }),
    /Connect the selected model/,
  );
  await assert.rejects(
    startEvaluation(actor, {
      suiteId: saved.id,
      provider: "anthropic",
      model: "fixture-model",
      candidate: proposal.candidate,
    }),
    /Candidate evaluations/,
  );
  await assert.rejects(
    startEvaluation(
      { ...actor, role: "member" },
      { suiteId: saved.id, provider: "anthropic", model: "fixture-model" },
    ),
    /owner or admin/,
  );
  assert.equal((await readEvaluations(actor)).length, 0);
  assert.equal(requests.length, beforeRequests);
});
test("real provider transport preserves baseline and candidate outputs and exact publish evidence", async () => {
  const saved = await suite(),
    beforeRequests = requests.length;
  const queued = await startEvaluation(actor, {
    suiteId: saved.id,
    provider: "anthropic",
    model: "fixture-model",
    proposalId: proposal.id,
  });
  assert.equal(queued.status, "queued");
  assert.equal(queued.results.length, 0);
  assert.equal(queued.candidatePassed, false);
  const job = await evalQueue().getJob(evaluationJobId(orgId, queued.id));
  assert.equal(job?.data.organizationId, orgId);
  await executeEvaluation(queued.id, orgId);
  const run = await storedRun(queued.id);
  assert.equal(run.status, "completed");
  assert.equal(run.outcome, "passed");
  assert.equal(run.candidatePassed, true);
  assert.equal(run.noRegressions, true);
  assert.equal(run.results.length, 2);
  assert.equal(run.results[0].baseline.status, "failed");
  assert.equal(run.results[0].candidate?.status, "passed");
  assert.match(run.results[0].candidate!.text, /Ready/);
  assert.equal(requests.length - beforeRequests, 4);
  for (const request of requests.slice(beforeRequests)) {
    assert.equal(request.model, "fixture-model");
    assert.equal(request.tools, undefined);
    assert.equal(request.tool_choice, undefined);
  }
  const expected = {
    evaluationId: run.id,
    proposalId: proposal.id,
    skillId: skill.id,
    baselineVersion: 1,
    baselineHash: proposal.baselineHash,
    candidateHash: proposal.candidateHash,
    suiteId: saved.id,
    suiteRevision: saved.revision,
    suiteHash: evaluationSuiteHash(saved),
  };
  assert.equal(candidateEvaluationEligible(run, expected), true);
  await verifyCandidateEvaluation(actor, expected);
  assert.equal(
    candidateEvaluationEligible(run, {
      ...expected,
      candidateHash: "0".repeat(64),
    }),
    false,
  );
  assert.equal(
    candidateEvaluationEligible(
      {
        ...run,
        results: run.results.map((r) => ({
          ...r,
          candidate: { ...r.candidate, text: "forbidden" },
        })),
      },
      expected,
    ),
    false,
  );
  const beforeReplay = requests.length;
  assert.equal(await executeEvaluation(run.id, orgId), undefined);
  assert.equal(requests.length, beforeReplay);
  assert.equal(
    (
      await readEvaluations(
        { ...actor, organizationId: "different-organization" },
        { id: run.id },
      )
    ).length,
    0,
  );
  const newer = await createSuite(actor, {
    ...saved,
    expectedRevision: saved.revision,
    name: "Changed after evaluation",
  });
  assert.equal(
    candidateEvaluationEligible(run, {
      ...expected,
      suiteRevision: newer.revision,
      suiteHash: evaluationSuiteHash(newer),
    }),
    false,
  );
});
test("provider failures stay errored, preserve both outputs, and never grant a passing gate", async () => {
  const saved = await suite();
  const queued = await startEvaluation(actor, {
    suiteId: saved.id,
    provider: "anthropic",
    model: "fixture-model",
    proposalId: proposal.id,
  });
  rejectProvider = true;
  try {
    await executeEvaluation(queued.id, orgId);
  } finally {
    rejectProvider = false;
  }
  const run = await storedRun(queued.id);
  assert.equal(run.status, "failed");
  assert.equal(run.outcome, "errored");
  assert.equal(run.candidatePassed, false);
  assert.equal(run.noRegressions, false);
  assert.equal(run.results[0].baseline.status, "errored");
  assert.equal(run.results[0].candidate?.text, "");
  assert.match(run.results[0].candidate!.error!, /provider rejected/);
  assert.equal(
    candidateEvaluationEligible(
      {
        ...run,
        status: "completed",
        outcome: "passed",
        candidatePassed: true,
        noRegressions: true,
      },
      {
        proposalId: proposal.id,
        skillId: skill.id,
        baselineVersion: 1,
        baselineHash: proposal.baselineHash,
        candidateHash: proposal.candidateHash,
      },
    ),
    false,
  );
});
test("recovery requeues undispatched jobs and fails stale execution without replaying model calls", async () => {
  const saved = await suite(),
    queued = await startEvaluation(actor, {
      suiteId: saved.id,
      provider: "anthropic",
      model: "fixture-model",
    });
  const job = await evalQueue().getJob(evaluationJobId(orgId, queued.id));
  await job?.remove();
  const recovered = await recoverEvaluations(orgId);
  assert.ok(recovered.requeued >= 1);
  assert.ok(await evalQueue().getJob(evaluationJobId(orgId, queued.id)));
  const stale = new Date(Date.now() - 11 * 60 * 1000),
    beforeRequests = requests.length;
  await db
    .update(records)
    .set({
      data: {
        ...queued,
        status: "running",
        startedAt: stale.toISOString(),
        updatedAt: stale.toISOString(),
      },
      updatedAt: stale,
    })
    .where(and(eq(records.organizationId, orgId), eq(records.id, queued.id)));
  assert.ok((await recoverEvaluations(orgId)).interrupted >= 1);
  const run = await storedRun(queued.id);
  assert.equal(run.status, "failed");
  assert.equal(run.outcome, "errored");
  assert.equal(run.candidatePassed, false);
  assert.match(run.error!, /not automatically replayed/);
  await executeEvaluation(run.id, orgId);
  assert.equal(requests.length, beforeRequests);
});

test("removing model access between paired cases stops further provider calls", async () => {
  const saved = await suite(),
    queued = await startEvaluation(actor, {
      suiteId: saved.id,
      provider: "anthropic",
      model: "fixture-model",
      proposalId: proposal.id,
    });
  const beforeRequests = requests.length;
  onRequest = async () => {
    if (requests.length === beforeRequests + 2)
      await db
        .delete(credentials)
        .where(
          and(
            eq(credentials.organizationId, orgId),
            eq(credentials.provider, "anthropic"),
          ),
        );
  };
  try {
    await executeEvaluation(queued.id, orgId);
    const run = await storedRun(queued.id);
    assert.equal(requests.length - beforeRequests, 2);
    assert.equal(run.results.length, 1);
    assert.equal(run.status, "failed");
    assert.match(run.error!, /no longer connected/);
  } finally {
    onRequest = undefined;
    await db
      .insert(credentials)
      .values({
        organizationId: orgId,
        provider: "anthropic",
        ciphertext: await seal(
          "local-evaluation-fixture-only",
          orgId,
          "anthropic",
        ),
        lastFour: "test",
        models: ["fixture-model"],
      })
      .onConflictDoNothing();
  }
});
test("revoking admin access between paired cases stops further provider calls", async () => {
  const saved = await suite(),
    queued = await startEvaluation(actor, {
      suiteId: saved.id,
      provider: "anthropic",
      model: "fixture-model",
      proposalId: proposal.id,
    });
  const beforeRequests = requests.length;
  onRequest = async () => {
    if (requests.length === beforeRequests + 2)
      await db
        .update(member)
        .set({ role: "member" })
        .where(
          and(eq(member.organizationId, orgId), eq(member.userId, userId)),
        );
  };
  try {
    await executeEvaluation(queued.id, orgId);
    const run = await storedRun(queued.id);
    assert.equal(requests.length - beforeRequests, 2);
    assert.equal(run.results.length, 1);
    assert.equal(run.status, "failed");
    assert.match(run.error!, /admin access is no longer active/);
  } finally {
    onRequest = undefined;
    await db
      .update(member)
      .set({ role: "admin" })
      .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)));
  }
});
