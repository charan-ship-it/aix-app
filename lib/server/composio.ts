import { Composio } from "@composio/core";
import { VercelProvider } from "@composio/vercel";
import { composioPlatformConfig, composioAuthConfigsFor } from "./composio-config";
import { AppError } from "./http";
import { toolkitSlugs, type AgentConfig } from "@/lib/agent-config";
export async function composioFor(_organizationId: string) {
  const { apiKey } = composioPlatformConfig();
  if (!apiKey)
    throw new AppError(
      428,
      "App connections are temporarily unavailable. Contact AIX support.",
    );
  return new Composio({ apiKey, provider: new VercelProvider() });
}
export function composioUser(organizationId: string, userId: string) {
  return "aix_" + organizationId + "_" + userId;
}
export async function agentSession(
  organizationId: string,
  userId: string,
  agent: AgentConfig,
  sessionId?: string,
) {
  const c = await composioFor(organizationId);
  if (sessionId) return c.use(sessionId);
  return c.create(composioUser(organizationId, userId), {
    toolkits: agent.toolkits,
    authConfigs: composioAuthConfigsFor(agent.toolkits),
    tools: Object.fromEntries(
      agent.toolkits
        .filter((t) => agent.toolPermissions[t]?.length)
        .map((t) => [t, { enable: agent.toolPermissions[t] }]),
    ),
    manageConnections: false,
    sandbox: { enable: false },
    proxyExecute: { enable: false },
    instant: false,
    ...(agent.externalPolicy === "read-only"
      ? { tags: ["readOnlyHint" as const] }
      : {}),
  });
}
export async function connectionSession(
  organizationId: string,
  userId: string,
) {
  const c = await composioFor(organizationId);
  return c.create(composioUser(organizationId, userId), {
    toolkits: [...toolkitSlugs],
    authConfigs: composioAuthConfigsFor(toolkitSlugs),
    manageConnections: true,
    sandbox: { enable: false },
    proxyExecute: { enable: false },
    instant: false,
  });
}
