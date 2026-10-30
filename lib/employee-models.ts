import { agents as builtins } from "./workspace";
import { normalizeAgent } from "./agent-config";
export type ModelConnection = {
  provider: string;
  configured: boolean;
  models: string[];
};
export function connectedDefault(connections: ModelConnection[]) {
  const connection =
    connections.find((c) => c.provider === "anthropic" && c.configured) ||
    connections.find((c) => c.provider === "openai" && c.configured);
  if (!connection) return null;
  const preferred =
    connection.provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-5.2";
  const model = connection.models.includes(preferred)
    ? preferred
    : connection.models.find((m) =>
        connection.provider === "anthropic"
          ? m.startsWith("claude-sonnet")
          : m.startsWith("gpt-"),
      ) ||
      connection.models[0] ||
      preferred;
  return { provider: connection.provider as "anthropic" | "openai", model };
}
// Only built-in employees inherit a connected model. Saved employee choices remain explicit.
export function builtinEmployees(connections: ModelConnection[]) {
  const selection = connectedDefault(connections);
  return builtins.map((a) => normalizeAgent({ ...a,knowledgeScope:"selected",documentIds:[], ...(selection || {}) }));
}
