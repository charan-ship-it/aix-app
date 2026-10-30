import type { AgentConfig } from "./agent-config";
export type Agent = Pick<
  AgentConfig,
  | "id"
  | "name"
  | "description"
  | "category"
  | "icon"
  | "color"
  | "instructions"
  | "model"
> &
  Partial<
    Omit<
      AgentConfig,
      | "id"
      | "name"
      | "description"
      | "category"
      | "icon"
      | "color"
      | "instructions"
      | "model"
    >
  >;
export type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  demo?: boolean;
  runId?: string;
  agentName?: string;
  trace?: { tool: string; status: string; input?: unknown; output?: unknown }[];
  pending?: { id: string; tool: string; input: unknown }[];
  usage?: { input: number; output: number };
  error?: boolean;
};
export type Chat = {
  delegatedFrom?: { runId: string; chatId: string; agentName: string };
  podId?: string;
  id: string;
  title: string;
  agentId: string;
  messages: Message[];
  updatedAt: string;
};
export type Document = {
  folderId?: string;
  podId?: string;
  agentId?: string;
  id: string;
  name: string;
  content: string;
  updatedAt: string;
  status?: string;
  indexMode?: string;
  chunkCount?: number;
  indexError?: string;
};
export const agents: Agent[] = [
  {
    id: "xcelerate",
    name: "Xcelerate",
    description: "Your thinking partner, with your company in context.",
    category: "General",
    icon: "sparkles",
    color: "orange",
    instructions:
      "You are Xcelerate, a thoughtful enterprise AI assistant from AI Xccelerate. Help people turn ideas into practical outcomes. Be clear, specific, and concise. Never invent company facts or claim actions you did not take.",
    model: "claude-sonnet-4-5",
  },
  {
    id: "research",
    name: "Research analyst",
    description: "Turn complex questions into clear, actionable insights.",
    category: "Research",
    icon: "search",
    color: "blue",
    instructions:
      "You are a research analyst. Separate evidence from assumptions. Compare options and give actionable recommendations. You cannot browse the internet; be explicit about that when relevant.",
    model: "claude-sonnet-4-5",
  },
  {
    id: "content",
    name: "Content studio",
    description: "First drafts that sound like you. Not everyone else.",
    category: "Marketing",
    icon: "pen",
    color: "purple",
    instructions:
      "You are a content strategist for AI Xccelerate. Write direct, useful content with a confident human voice. Avoid hype. Ask about the audience if needed.",
    model: "claude-sonnet-4-5",
  },
  {
    id: "sales",
    name: "Sales copilot",
    description: "Go from a promising conversation to a stronger proposal.",
    category: "Sales",
    icon: "chart",
    color: "green",
    instructions:
      "You are a sales copilot. Help qualify opportunities, prepare meetings, and draft proposals. Do not invent customer data, pricing, or commitments.",
    model: "claude-sonnet-4-5",
  },
  {
    id: "operations",
    name: "Operations expert",
    description: "Less busywork. Better processes. More room to move.",
    category: "Operations",
    icon: "workflow",
    color: "pink",
    instructions:
      "You help improve enterprise operations. Identify bottlenecks, propose practical workflows, and clarify owners and metrics. Do not claim to execute external actions.",
    model: "claude-sonnet-4-5",
  },
  {
    id: "engineering",
    name: "Engineering partner",
    description: "Work through technical decisions, code, and architecture.",
    category: "Engineering",
    icon: "code",
    color: "slate",
    instructions:
      "You are an engineering partner. Explain technical tradeoffs, help debug, and write maintainable code. Be honest about uncertainty and do not claim code was tested.",
    model: "claude-sonnet-4-5",
  },
];
export const prompts = [
  {
    title: "Get up to speed",
    text: "Summarize a document or untangle a complex topic.",
    icon: "book",
    prompt:
      "Help me get up to speed on a topic. Ask me what I’m working on and what context I can share.",
  },
  {
    title: "Make something great",
    text: "Find the right words for your next big idea.",
    icon: "pen",
    prompt:
      "Help me turn an idea into a compelling piece of content. Ask me about my audience and the idea.",
  },
  {
    title: "Think it through",
    text: "A second perspective on a tricky decision.",
    icon: "bulb",
    prompt:
      "Help me think through a decision. Ask me about the options, constraints, and what success looks like.",
  },
];
