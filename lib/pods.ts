import { z } from "zod";
export const podSchema = z.object({
  id: z.string().uuid(),
  archived: z.boolean().default(false),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(""),
  instructions: z.string().max(16000).default(""),
  defaultAgentId: z.string().min(1).max(100).default("xcelerate"),
  access: z.enum(["private", "organization"]).default("private"),
});
export type Pod = z.infer<typeof podSchema> & { ownerId?: string };
