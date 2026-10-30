import type { AgentConfig } from "./agent-config";
import type { Chat, Document } from "./workspace";
import type { Pod } from "./pods";
import type { ProviderStatus } from "@/components/platform/provider-settings";
export type WorkspaceRecord =
  | (AgentConfig & { kind: "agent" })
  | (Chat & { kind: "chat" })
  | (Document & { kind: "document" })
  | {
      id: string;
      kind: "folder";
      name: string;
      podId?: string;
      agentId?: string;
      parentId?: string;
    };
export type ProductData = {
  records: WorkspaceRecord[];
  agents: AgentConfig[];
  providers: ProviderStatus[];
  employee?: AgentConfig | null;
  pod?: Pod | null;
  user: string;
  organization: { id: string; name: string; role: string };
};
export async function request<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    signal,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "The request could not be completed. Try again.",
    );
  return data as T;
}
export const conversationHref = (chat: Pick<Chat, "id">) =>
  "/conversation/" + encodeURIComponent(chat.id);
