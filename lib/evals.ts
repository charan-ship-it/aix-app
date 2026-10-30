import { z } from "zod";
import { skillContentSchema, skillSchema, type SkillContent } from "./skills";

export const evaluationChecksSchema = z
  .object({
    contains: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
    notContains: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
    maxChars: z.number().int().min(1).max(20000).optional(),
  })
  .refine(
    (c) => c.contains.length + c.notContains.length + (c.maxChars ? 1 : 0) > 0,
    "Add at least one assertion per case.",
  );
export const evaluationCaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  input: z.string().trim().min(1).max(8000),
  checks: evaluationChecksSchema,
});
const casesSchema = z
  .array(evaluationCaseSchema)
  .min(1)
  .max(6)
  .refine(
    (cases) => new Set(cases.map((c) => c.id)).size === cases.length,
    "Give each case a unique ID.",
  );
export const evaluationSuiteSaveSchema = z.object({
  id: z.string().uuid().optional(),
  expectedRevision: z.number().int().min(0),
  skillId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  cases: casesSchema,
});
export const evaluationSuiteSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().min(1),
  skillId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  cases: casesSchema,
  updatedAt: z.string().datetime(),
});
export const evaluationStartSchema = z
  .object({
    suiteId: z.string().uuid(),
    provider: z.enum(["openai", "anthropic"]),
    model: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9._:-]+$/),
    proposalId: z.string().uuid().optional(),
  })
  .strict();
const assertionSchema = z.object({
  kind: z.enum(["contains", "notContains", "maxChars"]),
  expected: z.union([z.string(), z.number()]),
  passed: z.boolean(),
  actual: z.number().optional(),
});
export const evaluationOutputSchema = z.object({
  status: z.enum(["passed", "failed", "errored"]),
  text: z.string().max(60000),
  assertions: z.array(assertionSchema).max(21),
  error: z.string().max(500).optional(),
});
export const evaluationRunSchema = z.object({
  id: z.string().uuid(),
  suiteId: z.string().uuid(),
  suiteRevision: z.number().int().min(1),
  suiteHash: z.string().regex(/^[a-f0-9]{64}$/),
  skillId: z.string().uuid(),
  baselineVersion: z.number().int().min(1),
  baselineHash: z.string().regex(/^[a-f0-9]{64}$/),
  candidateHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  proposalId: z.string().uuid().optional(),
  executionKind: z.literal("model"),
  provider: z.enum(["openai", "anthropic"]),
  model: z.string().min(1).max(100),
  status: z.enum(["queued", "running", "completed", "failed"]),
  outcome: z.enum(["passed", "failed", "errored"]).nullable(),
  candidatePassed: z.boolean(),
  noRegressions: z.boolean(),
  suite: evaluationSuiteSchema,
  baseline: skillSchema,
  candidate: skillContentSchema.optional(),
  results: z
    .array(
      z.object({
        caseId: z.string().uuid(),
        input: z.string(),
        baseline: evaluationOutputSchema,
        candidate: evaluationOutputSchema.optional(),
      }),
    )
    .max(6),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  error: z.string().max(500).optional(),
  dispatchError: z.string().max(500).optional(),
});
export type EvaluationChecks = z.infer<typeof evaluationChecksSchema>;
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;
export type EvaluationSuite = z.infer<typeof evaluationSuiteSchema>;
export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;
export type EvaluationRun = z.infer<typeof evaluationRunSchema>;
export type EvaluationCandidateExpectation = {
  proposalId: string;
  skillId: string;
  baselineVersion: number;
  baselineHash: string;
  candidateHash: string;
  suiteId?: string;
  suiteRevision?: number;
  suiteHash?: string;
};

export function canonicalSkillContent(content: SkillContent): string {
  const s = skillContentSchema.parse(content);
  return JSON.stringify({
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    expectedOutput: s.expectedOutput,
    requiredToolkits: [...s.requiredToolkits].sort(),
  });
}
export function canonicalSuiteContent(suite: EvaluationSuite): string {
  const s = evaluationSuiteSchema.parse(suite);
  return JSON.stringify({
    id: s.id,
    skillId: s.skillId,
    name: s.name,
    revision: s.revision,
    cases: s.cases.map((c) => ({
      id: c.id,
      name: c.name,
      input: c.input,
      checks: {
        contains: c.checks.contains,
        notContains: c.checks.notContains,
        ...(c.checks.maxChars ? { maxChars: c.checks.maxChars } : {}),
      },
    })),
  });
}
// Matching ignores case. maxChars counts JavaScript string code units.
export function evaluateAssertions(text: string, checks: EvaluationChecks) {
  const folded = text.toLowerCase();
  return [
    ...checks.contains.map((expected) => ({
      kind: "contains" as const,
      expected,
      passed: folded.includes(expected.toLowerCase()),
    })),
    ...checks.notContains.map((expected) => ({
      kind: "notContains" as const,
      expected,
      passed: !folded.includes(expected.toLowerCase()),
    })),
    ...(checks.maxChars
      ? [
          {
            kind: "maxChars" as const,
            expected: checks.maxChars,
            actual: text.length,
            passed: text.length <= checks.maxChars,
          },
        ]
      : []),
  ];
}
export function scoreEvaluationOutput(
  text: string,
  checks: EvaluationChecks,
): EvaluationOutput {
  const assertions = evaluateAssertions(text, checks);
  return {
    text,
    assertions,
    status: assertions.every((a) => a.passed) ? "passed" : "failed",
  };
}
export function summarizeEvaluation(
  run: Pick<EvaluationRun, "suite" | "results" | "candidate">,
) {
  const complete = run.results.length === run.suite.cases.length;
  const errors =
    !complete ||
    run.results.some(
      (r) =>
        r.baseline.status === "errored" ||
        (run.candidate && (!r.candidate || r.candidate.status === "errored")),
    );
  const candidatePassed =
    !!run.candidate &&
    !errors &&
    run.results.every((r) => r.candidate?.status === "passed");
  const noRegressions =
    !!run.candidate &&
    !errors &&
    run.results.every((r) =>
      r.baseline.assertions.every(
        (a, i) => !a.passed || r.candidate?.assertions[i]?.passed === true,
      ),
    );
  const passed = run.candidate
    ? candidatePassed
    : !errors && run.results.every((r) => r.baseline.status === "passed");
  return {
    outcome: errors
      ? ("errored" as const)
      : passed
        ? ("passed" as const)
        : ("failed" as const),
    candidatePassed,
    noRegressions,
  };
}
export function candidateEvaluationEligible(
  value: unknown,
  expected: EvaluationCandidateExpectation,
): boolean {
  const parsed = evaluationRunSchema.safeParse(value);
  if (!parsed.success) return false;
  const r = parsed.data;
  if (
    r.status !== "completed" ||
    !r.completedAt ||
    r.executionKind !== "model" ||
    !r.candidate ||
    r.proposalId !== expected.proposalId ||
    r.skillId !== expected.skillId ||
    r.baseline.id !== expected.skillId ||
    r.baselineVersion !== expected.baselineVersion ||
    r.baseline.version !== expected.baselineVersion ||
    r.baselineHash !== expected.baselineHash ||
    r.candidateHash !== expected.candidateHash ||
    (expected.suiteId && r.suiteId !== expected.suiteId) ||
    (expected.suiteRevision && r.suiteRevision !== expected.suiteRevision) ||
    (expected.suiteHash && r.suiteHash !== expected.suiteHash) ||
    r.suite.id !== r.suiteId ||
    r.suite.revision !== r.suiteRevision ||
    r.suite.skillId !== r.skillId ||
    r.results.length !== r.suite.cases.length
  )
    return false;
  for (let i = 0; i < r.suite.cases.length; i++) {
    const c = r.suite.cases[i],
      result = r.results[i];
    if (result.caseId !== c.id || result.input !== c.input || !result.candidate)
      return false;
    for (const output of [result.baseline, result.candidate]) {
      if (output.status === "errored" || output.error || !output.text.trim())
        return false;
      const recomputed = scoreEvaluationOutput(output.text, c.checks);
      if (
        recomputed.status !== output.status ||
        JSON.stringify(
          recomputed.assertions.map((a) => [
            a.kind,
            a.expected,
            a.passed,
            "actual" in a ? a.actual : null,
          ]),
        ) !==
          JSON.stringify(
            output.assertions.map((a) => [
              a.kind,
              a.expected,
              a.passed,
              a.actual ?? null,
            ]),
          )
      )
        return false;
    }
  }
  const score = summarizeEvaluation(r);
  return (
    r.outcome === "passed" &&
    r.candidatePassed &&
    r.noRegressions &&
    score.candidatePassed &&
    score.noRegressions &&
    score.outcome === "passed"
  );
}
