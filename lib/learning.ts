import { z } from "zod";
import { skillContentSchema, skillSchema } from "./skills";

export const runFeedbackInputSchema = z.object({
  runId: z.string().uuid(),
  rating: z.enum(["useful", "needs-work"]),
  correction: z.string().trim().max(3000).default(""),
});
export const runFeedbackSchema = runFeedbackInputSchema.extend({
  id: z.string().uuid(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type RunFeedback = z.infer<typeof runFeedbackSchema>;
export const learningProposalInputSchema = z.object({
  feedbackId: z.string().uuid(), skillId: z.string().uuid(), confirmShare: z.literal(true),
  instructions: z.string().trim().min(20).max(6000),
  expectedOutput: z.string().trim().max(2000).default(""),
  sharedRationale: z.string().trim().min(10).max(2000),
});
export const learningProposalSchema = z.object({
  id: z.string().uuid(), skillId: z.string().uuid(), baselineVersion: z.number().int().min(1),
  baselineHash: z.string().regex(/^[a-f0-9]{64}$/), baseline: skillSchema,
  candidate: skillContentSchema, candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  sharedRationale: z.string().min(10).max(2000), submittedBy: z.string().max(200),
  status: z.enum(["proposed", "rejected", "published"]),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  reviewReason: z.string().max(1000).optional(), reviewedBy: z.string().max(200).optional(),
  publishedVersion: z.number().int().min(1).optional(), evaluationId: z.string().uuid().optional(),
});
export type LearningProposal = z.infer<typeof learningProposalSchema>;
export const learningReviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("publish"), evaluationId: z.string().uuid(), expectedCandidateHash: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
