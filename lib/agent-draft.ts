import { z } from "zod";
import { agentSchema } from "./agent-config";

// OpenAI structured outputs require every field to be explicitly required.
// Defaults belong to persisted agent configuration, not the generated schema.
export const generatedAgentDraftSchema = z.object({
  name: agentSchema.shape.name,
  description: agentSchema.shape.description,
  instructions: agentSchema.shape.instructions,
  starters: agentSchema.shape.starters.unwrap(),
  tools: agentSchema.shape.tools.unwrap(),
  toolkits: agentSchema.shape.toolkits.unwrap(),
  knowledgeScope: agentSchema.shape.knowledgeScope.unwrap(),
}).strict();
