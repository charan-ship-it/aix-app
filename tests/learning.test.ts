// Database-backed authorization and publication-gate fixtures. No model calls or learning claims.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getSql, getDb } from "../db";
import { normalizeAgent } from "../lib/agent-config";
import { skillTemplates, type Skill } from "../lib/skills";
import { canonicalSkillContent, canonicalSuiteContent, scoreEvaluationOutput, type EvaluationRun, type EvaluationSuite } from "../lib/evals";
import { saveSkill, listSkillVersions } from "../lib/server/skills";
import { listLearningProposals, listRunFeedback, proposeLearningImprovement, readRunFeedback, reviewLearningProposal, saveRunFeedback } from "../lib/server/learning";
import type { WorkspaceUser } from "../lib/server/http";
try { process.loadEnvFile(); } catch {}
getDb();
const sql = getSql(), stamp = crypto.randomUUID(), org = `learn-org-${stamp}`, otherOrg = `learn-other-${stamp}`;
const ownerId = `learn-owner-${stamp}`, memberId = `learn-member-${stamp}`, outsiderId = `learn-outsider-${stamp}`;
const owner: WorkspaceUser = { userId: ownerId, organizationId: org, displayName: "Learning owner fixture", organizationName: "Learning fixtures", email: `${ownerId}@example.invalid`, role: "owner" };
const learner: WorkspaceUser = { ...owner, userId: memberId, displayName: "Learning member fixture", email: `${memberId}@example.invalid`, role: "member" };
const outsider: WorkspaceUser = { ...owner, userId: outsiderId, organizationId: otherOrg, email: `${outsiderId}@example.invalid` };
const agent = normalizeAgent({ id: crypto.randomUUID(), name: "Learning fixture agent", description: "Private learning fixture", category: "Testing", icon: "sparkles", color: "orange", instructions: "Return fixture evidence with source references.", model: "fixture-model", provider: "anthropic", tools: [], toolkits: [], knowledgeScope: "none" });
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
before(async () => {
  for (const u of [owner, learner, outsider]) await sql`insert into auth_user(id,name,email) values(${u.userId},${u.displayName},${u.email})`;
  await sql`insert into organization(id,name,slug) values(${org},'Learning test',${org}),(${otherOrg},'Learning other',${otherOrg})`;
  for (const u of [owner, learner, outsider]) await sql`insert into organization_member(id,organization_id,user_id,role) values(${crypto.randomUUID()},${u.organizationId},${u.userId},${u.role})`;
  await sql`insert into workspace_record(organization_id,id,created_by,kind,data) values(${org},${agent.id},${ownerId},'agent',${JSON.stringify(agent)}::jsonb)`;
});
after(async () => {
  await sql`delete from organization where id in (${org},${otherOrg})`;
  await sql`delete from auth_user where id in (${ownerId},${memberId},${outsiderId})`;
  await sql.end();
});
async function fixtureRun(status = "completed", podId?: string) {
  const id = crypto.randomUUID(), chatId = crypto.randomUUID();
  const chat = { id: chatId, agentId: agent.id, podId, title: "Private fixture chat", messages: [{ role: "assistant", content: "PRIVATE_OUTPUT_DO_NOT_SHARE" }], updatedAt: new Date().toISOString() };
  await sql`insert into workspace_record(organization_id,id,created_by,kind,data) values(${org},${chatId},${memberId},'chat',${JSON.stringify(chat)}::jsonb)`;
  await sql`insert into agent_run(id,organization_id,created_by,chat_id,agent_id,status,payload) values(${id},${org},${memberId},${chatId},${agent.id},${status},${JSON.stringify({ agent, parentRunId: crypto.randomUUID() })}::jsonb)`;
  return id;
}
async function feedbackAndProposal() {
  const runId = await fixtureRun(), feedback = await saveRunFeedback(learner, { runId, rating: "needs-work", correction: "PRIVATE_CORRECTION_DO_NOT_SHARE" });
  const baseline = await saveSkill(owner, { ...skillTemplates[1], expectedVersion: 0 });
  const proposal = await proposeLearningImprovement(learner, { feedbackId: feedback.id, skillId: baseline.id, confirmShare: true, instructions: "Return concise evidence and source references before proposing any follow-up.", expectedOutput: "Evidence and an explicitly marked draft.", sharedRationale: "Make source evidence easier to review.", requiredToolkits: ["gmail"] });
  return { runId, feedback, baseline, proposal };
}
function evalFixture(baseline: Skill, proposal: Awaited<ReturnType<typeof proposeLearningImprovement>>) {
  const now = new Date().toISOString(), caseId = crypto.randomUUID();
  const suite: EvaluationSuite = { id: crypto.randomUUID(), revision: 1, skillId: baseline.id, name: "Structural publication fixture", cases: [{ id: caseId, name: "Evidence is preserved", input: "Summarize this fixture with evidence.", checks: { contains: ["evidence"], notContains: ["invented"] } }], updatedAt: now };
  const evaluation: EvaluationRun = { id: crypto.randomUUID(), suiteId: suite.id, suiteRevision: 1, suiteHash: hash(canonicalSuiteContent(suite)), skillId: baseline.id, baselineVersion: baseline.version, baselineHash: hash(canonicalSkillContent(baseline)), candidateHash: proposal.candidateHash, proposalId: proposal.id, executionKind: "model", provider: "anthropic", model: "structural-gate-fixture", status: "completed", outcome: "passed", candidatePassed: true, noRegressions: true, suite, baseline, candidate: proposal.candidate, results: [{ caseId, input: suite.cases[0].input, baseline: scoreEvaluationOutput("evidence baseline", suite.cases[0].checks), candidate: scoreEvaluationOutput("evidence candidate", suite.cases[0].checks) }], createdAt: now, updatedAt: now, completedAt: now };
  return { suite, evaluation };
}
async function put(kind: string, id: string, data: object) { await sql`insert into workspace_record(organization_id,id,created_by,kind,data) values(${org},${id},${ownerId},${kind},${JSON.stringify(data)}::jsonb) on conflict(organization_id,id) do update set data=excluded.data`; }

test("run feedback is private, terminal-only, and rechecks revoked project access", async () => {
  const running = await fixtureRun("running");
  await assert.rejects(() => saveRunFeedback(learner, { runId: running, rating: "useful" }), { status: 409 });
  const runId = await fixtureRun(), feedback = await saveRunFeedback(learner, { runId, rating: "needs-work", correction: "Private correction" });
  assert.equal((await readRunFeedback(learner, runId))?.id, feedback.id);
  await assert.rejects(() => readRunFeedback(owner, runId), { status: 404 });
  await assert.rejects(() => saveRunFeedback(outsider, { runId, rating: "useful" }), { status: 404 });
  assert.equal((await listRunFeedback(owner)).length, 0);
  const podId = crypto.randomUUID();
  const pod = { id: podId, name: "Access revocation fixture", access: "organization", defaultAgentId: agent.id };
  await put("pod", podId, pod);
  const podRunId = await fixtureRun("completed", podId), podFeedback = await saveRunFeedback(learner, { runId: podRunId, rating: "needs-work" });
  await put("pod", podId, { ...pod, access: "private" });
  await assert.rejects(() => readRunFeedback(learner, podRunId), { status: 404 });
  assert.equal((await listRunFeedback(learner)).some((f) => f.id === podFeedback.id), false);
  const skill = await saveSkill(owner, { ...skillTemplates[1], expectedVersion: 0 });
  await assert.rejects(() => proposeLearningImprovement(learner, { feedbackId: podFeedback.id, skillId: skill.id, confirmShare: true, instructions: "Return concise evidence with source references.", sharedRationale: "Review clearer evidence in the output." }), { status: 404 });
});

test("only explicitly shared candidate content reaches reviewers and tools cannot widen", async () => {
  const { feedback, baseline, proposal } = await feedbackAndProposal();
  assert.deepEqual(proposal.candidate.requiredToolkits, baseline.requiredToolkits);
  await assert.rejects(() => proposeLearningImprovement(learner, { feedbackId: feedback.id, skillId: baseline.id, confirmShare: false, instructions: "Return concise evidence with source references.", sharedRationale: "Clarify evidence review in output." }), { status: 400 });
  const adminView = JSON.stringify((await listLearningProposals(owner)).find((p) => p.id === proposal.id));
  assert.equal(adminView.includes("PRIVATE_CORRECTION_DO_NOT_SHARE"), false);
  assert.equal(adminView.includes("PRIVATE_OUTPUT_DO_NOT_SHARE"), false);
  assert.equal(adminView.includes(feedback.id), false);
  assert.equal((await listLearningProposals(outsider)).some((p) => p.id === proposal.id), false);
  await assert.rejects(() => reviewLearningProposal(learner, proposal.id, { action: "reject", reason: "Fixture rejection" }), { status: 403 });
  const rejected = await reviewLearningProposal(owner, proposal.id, { action: "reject", reason: "Keep the current wording for this fixture." });
  assert.equal(rejected.status, "rejected");
  await assert.rejects(() => reviewLearningProposal(owner, proposal.id, { action: "reject", reason: "Another review" }), { status: 409 });
});

test("skill publication binds exact model evaluation, current suite and baseline with immutable version and duplicate protection", async () => {
  const { baseline, proposal } = await feedbackAndProposal(), { suite, evaluation } = evalFixture(baseline, proposal);
  await put("eval-suite", suite.id, suite); await put("eval-run", evaluation.id, evaluation);
  await assert.rejects(() => saveSkill(owner, { ...baseline, instructions: "A manual update cannot bypass the established evaluation gate.", expectedVersion: baseline.version }), { status: 409 });
  const publish = () => reviewLearningProposal(owner, proposal.id, { action: "publish", evaluationId: evaluation.id, expectedCandidateHash: proposal.candidateHash });
  await assert.rejects(() => reviewLearningProposal(owner, proposal.id, { action: "publish", evaluationId: evaluation.id, expectedCandidateHash: "0".repeat(64) }), { status: 409 });
  await assert.rejects(() => reviewLearningProposal(outsider, proposal.id, { action: "publish", evaluationId: evaluation.id, expectedCandidateHash: proposal.candidateHash }), { status: 404 });
  await put("eval-run", evaluation.id, { ...evaluation, proposalId: crypto.randomUUID() });
  await assert.rejects(publish, { status: 409 });
  await put("eval-run", evaluation.id, { ...evaluation, baseline: { ...baseline, instructions: "Tampered baseline with an unchanged recorded hash." } });
  await assert.rejects(publish, { status: 409 });
  await put("eval-run", evaluation.id, { ...evaluation, results: [{ ...evaluation.results[0], candidate: scoreEvaluationOutput("invented result without proof", suite.cases[0].checks) }] });
  await assert.rejects(publish, { status: 409 });
  await put("eval-run", evaluation.id, { ...evaluation, executionKind: "fixture" });
  await assert.rejects(publish, { status: 409 });
  await put("eval-run", evaluation.id, evaluation);
  await put("eval-suite", suite.id, { ...suite, revision: 2 });
  await assert.rejects(publish, { status: 409 });
  await put("eval-suite", suite.id, suite);
  await put("skill", baseline.id, { ...baseline, version: 2 });
  await assert.rejects(publish, { status: 409 });
  await put("skill", baseline.id, baseline);
  const published = await publish();
  assert.equal(published.status, "published"); assert.equal(published.publishedVersion, 2);
  const history = await listSkillVersions(org, baseline.id);
  assert.deepEqual(history.map((s) => s.version), [2, 1]);
  assert.equal(history[0].instructions, proposal.candidate.instructions);
  assert.equal(history[1].instructions, baseline.instructions);
  await assert.rejects(publish, { status: 409 });
});
