import { findAgent } from "./runtime";
import type { WorkspaceUser } from "./http";
import { readConversationAccess } from "./conversation-access";
export async function readConversation(u: WorkspaceUser, chatId: string) {
  const { chat, pod } = await readConversationAccess(u, chatId);
  return { chat, pod, agent: await findAgent(u.organizationId, chat.agentId) };
}
