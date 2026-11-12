import { z } from "zod";

// Preview accepts only pasted text and draft instructions. App credentials, tools,
// files, and knowledge scopes are deliberately not part of this request.
export const builderPreviewSchema = z.object({
  instructions: z.string().trim().min(20).max(16000),
  prompt: z.string().trim().min(1).max(12000),
  provider: z.enum(["anthropic", "openai"]),
  model: z.string().regex(/^[a-zA-Z0-9._:-]+$/).min(1).max(100),
}).strict();
export type BuilderPreviewInput = z.infer<typeof builderPreviewSchema>;
