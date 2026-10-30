import { z } from "zod";
export const providerSchema = z.enum(["anthropic", "openai"]);
export const builtinToolIds = [
  "knowledge_search",
  "calculator",
  "current_time",
  "extract_transcript_actions",
] as const;
export const builtinToolCatalog = [
  { id: "knowledge_search", name: "Knowledge search", description: "Find relevant passages in permitted documents." },
  { id: "calculator", name: "Calculator", description: "Calculate expressions accurately." },
  { id: "current_time", name: "Current time", description: "Use the current date and time." },
  { id: "extract_transcript_actions", name: "Transcript action items", description: "Analyze a provided transcript and return a cited action-item table for review. Does not create external tasks." },
] as const satisfies ReadonlyArray<{ id: (typeof builtinToolIds)[number]; name: string; description: string }>;
export function builtinToolLabel(id: string) {
  return builtinToolCatalog.find((tool) => tool.id === id)?.name || id.replaceAll("_", " ");
}
export const toolkitCatalog = [
  { slug: "outlook", name: "Outlook", description: "Find email and work with your Microsoft account." },
  { slug: "linear", name: "Linear", description: "Find issues and manage project work." },
  { slug: "jira", name: "Jira", description: "Find tickets and manage project work." },
  { slug: "zoho", name: "Zoho", description: "Find and manage CRM records." },
  {
    slug: "gmail",
    name: "Gmail",
    description: "Find email, create drafts, and manage messages.",
  },
  {
    slug: "googledrive",
    name: "Google Drive",
    description: "Find files and read team documents.",
  },
  {
    slug: "googlecalendar",
    name: "Google Calendar",
    description: "Check availability and manage events.",
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Search conversations and work with channels.",
  },
  {
    slug: "notion",
    name: "Notion",
    description: "Find, read, and update workspace pages.",
  },
  {
    slug: "github",
    name: "GitHub",
    description: "Work with repositories, issues, and pull requests.",
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    description: "Find accounts and manage CRM records.",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Work with contacts, deals, and CRM activity.",
  },
] as const;
export const toolkitSlugs = toolkitCatalog.map((t) => t.slug);
export const agentSchema = z.object({
  archived: z.boolean().default(false),
  skillIds: z.array(z.string().uuid()).max(8).default([]),
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  description: z.string().max(160),
  instructions: z.string().min(20).max(16000),
  model: z
    .string()
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .min(1)
    .max(100),
  provider: providerSchema.default("anthropic"),
  category: z.string().max(50),
  icon: z.string().max(30),
  color: z.string().max(30),
  tools: z
    .array(z.enum(builtinToolIds))
    .max(builtinToolIds.length)
    .default(["knowledge_search"]),
  toolkits: z
    .array(
      z
        .string()
        .refine((s) =>
          toolkitSlugs.includes(s as (typeof toolkitSlugs)[number]),
        ),
    )
    .max(12)
    .default([]),
  toolPermissions: z
    .record(
      z.string(),
      z
        .array(z.string().regex(/^[A-Z0-9_]+$/))
        .min(1)
        .max(100),
    )
    .default({}),
  workflow: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(100),
        instructions: z.string().trim().min(1).max(2000),
      }),
    )
    .max(20)
    .default([]),
  mcpTools: z
    .array(
      z.object({
        connectionId: z.string().uuid(),
        tools: z.array(z.string().min(1).max(100)).min(1).max(30),
      }),
    )
    .max(5)
    .default([]),
  delegateAgentIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  knowledgeScope: z.enum(["all", "selected", "none"]).default("all"),
  documentIds: z.array(z.string().max(100)).max(100).default([]),
  externalPolicy: z.enum(["ask", "read-only"]).default("ask"),
  maxSteps: z.number().int().min(1).max(10).default(6),
  starters: z.array(z.string().max(300)).max(4).default([]),
});
export type AgentConfig = z.infer<typeof agentSchema>;
export function normalizeAgent(a: unknown): AgentConfig {
  return agentSchema.parse(a);
}
