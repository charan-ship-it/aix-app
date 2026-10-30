import { z } from "zod";
export const mcpConnectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  url: z.string().url().max(1000),
  enabled: z.boolean().default(true),
});
export type MCPConnection = z.infer<typeof mcpConnectionSchema>;
export type MCPConnectionSummary = MCPConnection & { hasToken: boolean };
