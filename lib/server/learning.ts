import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, records, runs } from "@/db/schema";
import { AppError, requireAdmin, type WorkspaceUser } from "./http";
import { readConversation } from "./conversations";
import { skillSchema, type Skill } from "@/lib/skills";
import { learningProposalInputSchema, learningProposalSchema, learningReviewSchema, runFeedbackInputSchema, runFeedbackSchema, type LearningProposal, type RunFeedback } from "@/lib/learning";
import { canonicalSkillContent, canonicalSuiteContent, candidateEvaluationEligible, evaluationRunSchema, evaluationSuiteSchema } from "@/lib/evals";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const skillHash = (skill: unknown) => sha256(canonicalSkillContent(skill as Skill));
function where(organizationId: string, kind: string, id?: string) {
  return and(eq(records.organizationId, organizationId), eq(records.kind, kind), ...(id ? [eq(records.id, id)] : []));
}
async function authorizedTerminalRun(u: WorkspaceUser, runId: string) {
  const [run] = await getDb().select().from(runs).where(and(eq(runs.organizationId, u.organizationId), eq(runs.createdBy, u.userId), eq(runs.id, runId))).limit(1);
  if (!run) throw new AppError(404, "Run not found.");
  await readConversation(u, run.chatId);
  if (!["completed", "failed", "cancelled"].includes(run.status)) throw new AppError(409, "Feedback is available after this run finishes.");
  return run;
}
function feedbackId(u: WorkspaceUser, runId: string) {
  const hash = sha256(`${u.organizationId}:${u.userId}:${runId}`);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export async function readRunFeedback(u: WorkspaceUser, runId: string): Promise<RunFeedback | null> {
  await authorizedTerminalRun(u, runId);
  const [row] = await getDb().select({ data: records.data }).from(records).where(and(where(u.organizationId, "run-feedback", feedbackId(u, runId)), eq(records.createdBy, u.userId))).limit(1);
  return row ? runFeedbackSchema.parse(row.data) : null;
}
export async function listRunFeedback(u: WorkspaceUser): Promise<RunFeedback[]> {
  const rows = await getDb().select({ data: records.data }).from(records).where(and(where(u.organizationId, "run-feedback"), eq(records.createdBy, u.userId))).orderBy(desc(records.updatedAt)).limit(50);
  const visible: RunFeedback[] = [];
  for (const row of rows) {
    const feedback = runFeedbackSchema.parse(row.data);
    try { await authorizedTerminalRun(u, feedback.runId); visible.push(feedback); }
    catch (e) { if (!(e instanceof AppError && [403, 404, 409].includes(e.status))) throw e; }
  }
  return visible;
}
export async function saveRunFeedback(u: WorkspaceUser, value: unknown): Promise<RunFeedback> {
  const parsed = runFeedbackInputSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Choose a finished run, a rating, and a correction of up to 3,000 characters.");
  await authorizedTerminalRun(u, parsed.data.runId);
  const id = feedbackId(u, parsed.data.runId), now = new Date();
  const [row] = await getDb().select({ data: records.data }).from(records).where(and(where(u.organizationId, "run-feedback", id), eq(records.createdBy, u.userId))).limit(1);
  const feedback = runFeedbackSchema.parse({ ...parsed.data, id, createdAt: row ? runFeedbackSchema.parse(row.data).createdAt : now.toISOString(), updatedAt: now.toISOString() });
  const saved = await getDb().insert(records).values({ organizationId: u.organizationId, createdBy: u.userId, id, kind: "run-feedback", data: feedback }).onConflictDoUpdate({ target: [records.organizationId, records.id], set: { data: feedback, updatedAt: now }, setWhere: and(eq(records.kind, "run-feedback"), eq(records.createdBy, u.userId)) }).returning({ id: records.id });
  if (!saved.length) throw new AppError(409, "Feedback could not be saved for this run. Reopen the conversation and try again.");
  return feedback;
}
export async function listLearningProposals(u: WorkspaceUser): Promise<LearningProposal[]> {
  const admin = ["owner", "admin"].includes(u.role);
  const rows = await getDb().select({ data: records.data }).from(records).where(and(where(u.organizationId, "learning-proposal"), ...(admin ? [] : [eq(records.createdBy, u.userId)]))).orderBy(desc(records.updatedAt)).limit(100);
  // Parsing intentionally strips the private feedback reference stored alongside the public proposal.
  return rows.map((row) => learningProposalSchema.parse(row.data));
}
export async function getEvaluationProposal(u: WorkspaceUser, proposalId: string): Promise<LearningProposal> {
  requireAdmin(u);
  const [row] = await getDb().select({ data: records.data }).from(records).where(where(u.organizationId, "learning-proposal", proposalId)).limit(1);
  if (!row) throw new AppError(404, "Improvement proposal not found.");
  return learningProposalSchema.parse(row.data);
}
export async function proposeLearningImprovement(u: WorkspaceUser, value: unknown): Promise<LearningProposal> {
  const parsed = learningProposalInputSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Review the candidate and explicitly confirm sharing only its instructions and rationale with workspace reviewers.");
  const input = parsed.data;
  const [feedbackRow] = await getDb().select({ data: records.data }).from(records).where(and(where(u.organizationId, "run-feedback", input.feedbackId), eq(records.createdBy, u.userId))).limit(1);
  if (!feedbackRow) throw new AppError(404, "Private feedback not found.");
  const feedback = runFeedbackSchema.parse(feedbackRow.data);
  await authorizedTerminalRun(u, feedback.runId);
  const [skillRow] = await getDb().select({ data: records.data }).from(records).where(where(u.organizationId, "skill", input.skillId)).limit(1);
  if (!skillRow) throw new AppError(404, "Skill not found.");
  const baseline = skillSchema.parse(skillRow.data);
  if (baseline.archived) throw new AppError(409, "Restore this skill before proposing an improvement.");
  const candidate = { name: baseline.name, description: baseline.description, requiredToolkits: [...baseline.requiredToolkits], instructions: input.instructions, expectedOutput: input.expectedOutput };
  const now = new Date(), id = crypto.randomUUID();
  const proposal = learningProposalSchema.parse({ id, skillId: baseline.id, baselineVersion: baseline.version, baselineHash: skillHash(baseline), baseline, candidate, candidateHash: skillHash(candidate), sharedRationale: input.sharedRationale, submittedBy: u.displayName.slice(0, 200), status: "proposed", createdAt: now.toISOString(), updatedAt: now.toISOString() });
  await getDb().transaction(async (tx) => {
    await tx.insert(records).values({ organizationId: u.organizationId, createdBy: u.userId, id, kind: "learning-proposal", data: { ...proposal, feedbackId: feedback.id } });
    await tx.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: u.organizationId, actorId: u.userId, action: "learning.proposal.shared", resourceId: id, details: { skillId: baseline.id, baselineVersion: baseline.version, candidateHash: proposal.candidateHash } });
  });
  return proposal;
}
export async function reviewLearningProposal(u: WorkspaceUser, proposalId: string, value: unknown): Promise<LearningProposal> {
  requireAdmin(u);
  const parsed = learningReviewSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Choose a review action and the exact evaluated candidate.");
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(records).where(where(u.organizationId, "learning-proposal", proposalId)).for("update").limit(1);
    if (!row) throw new AppError(404, "Improvement proposal not found.");
    const proposal = learningProposalSchema.parse(row.data);
    if (proposal.status !== "proposed") throw new AppError(409, "This proposal has already been reviewed.");
    const now = new Date();
    let next: LearningProposal;
    if (parsed.data.action === "reject") {
      next = { ...proposal, status: "rejected", reviewReason: parsed.data.reason, reviewedBy: u.displayName.slice(0, 200), updatedAt: now.toISOString() };
    } else {
      const review = parsed.data;
      if (review.expectedCandidateHash !== proposal.candidateHash || skillHash(proposal.candidate) !== proposal.candidateHash || skillHash(proposal.baseline) !== proposal.baselineHash) throw new AppError(409, "This candidate changed. Review and evaluate the current proposal.");
      const [skillRow] = await tx.select().from(records).where(where(u.organizationId, "skill", proposal.skillId)).for("update").limit(1);
      if (!skillRow) throw new AppError(404, "Skill not found.");
      const current = skillSchema.parse(skillRow.data);
      if (current.archived || current.version !== proposal.baselineVersion || skillHash(current) !== proposal.baselineHash) throw new AppError(409, "The skill changed after this proposal. Create and evaluate a new proposal against its current version.");
      if (JSON.stringify([...current.requiredToolkits].sort()) !== JSON.stringify([...proposal.candidate.requiredToolkits].sort())) throw new AppError(403, "An improvement cannot change app requirements.");
      const [evalRow] = await tx.select().from(records).where(where(u.organizationId, "eval-run", review.evaluationId)).for("update").limit(1);
      if (!evalRow) throw new AppError(404, "Evaluation not found.");
      const checkedEvaluation = evaluationRunSchema.safeParse(evalRow.data);
      if (!checkedEvaluation.success) throw new AppError(409, "This evaluation cannot authorize publishing. Run a new model evaluation.");
      const evaluation = checkedEvaluation.data;
      const [suiteRow] = await tx.select().from(records).where(where(u.organizationId, "eval-suite", evaluation.suiteId)).for("update").limit(1);
      if (!suiteRow) throw new AppError(409, "The evaluation suite is no longer available.");
      const suite = evaluationSuiteSchema.parse(suiteRow.data), suiteHash = sha256(canonicalSuiteContent(suite));
      if (skillHash(evaluation.baseline) !== evaluation.baselineHash || !evaluation.candidate || skillHash(evaluation.candidate) !== evaluation.candidateHash || sha256(canonicalSuiteContent(evaluation.suite)) !== evaluation.suiteHash) throw new AppError(409, "The evaluation snapshots do not match their recorded content. Run a new evaluation.");
      if (!candidateEvaluationEligible(evaluation, { proposalId: proposal.id, skillId: current.id, baselineVersion: current.version, baselineHash: proposal.baselineHash, candidateHash: proposal.candidateHash, suiteId: suite.id, suiteRevision: suite.revision, suiteHash })) throw new AppError(409, "Publishing requires a completed model evaluation of this exact candidate and current suite, with a passing candidate and no regressions.");
      const published: Skill = { ...proposal.candidate, id: current.id, version: current.version + 1, archived: false, updatedAt: now.toISOString() };
      await tx.update(records).set({ data: published, updatedAt: now }).where(where(u.organizationId, "skill", current.id));
      await tx.insert(records).values({ organizationId: u.organizationId, createdBy: u.userId, id: `skill-version:${current.id}:${published.version}`, kind: "skill-version", data: { ...published, publishedBy: u.displayName } });
      next = { ...proposal, status: "published", publishedVersion: published.version, evaluationId: evaluation.id, reviewedBy: u.displayName.slice(0, 200), updatedAt: now.toISOString() };
    }
    await tx.update(records).set({ data: { ...next, feedbackId: (row.data as { feedbackId?: string }).feedbackId }, updatedAt: now }).where(where(u.organizationId, "learning-proposal", proposal.id));
    await tx.insert(auditEvents).values({ id: crypto.randomUUID(), organizationId: u.organizationId, actorId: u.userId, action: `learning.proposal.${next.status}`, resourceId: proposal.id, details: { skillId: proposal.skillId, candidateHash: proposal.candidateHash, ...(next.publishedVersion ? { publishedVersion: next.publishedVersion, evaluationId: next.evaluationId } : {}) } });
    return next;
  });
}
