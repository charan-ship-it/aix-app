import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { member, records } from "@/db/schema";
import type { Chat } from "@/lib/workspace";
import { AppError, type WorkspaceUser } from "./http";
import { getPod } from "./pods";

/** Recheck membership for long-lived reads, not only when the HTTP request starts. */
export async function requireCurrentMembership(u: Pick<WorkspaceUser, "organizationId" | "userId">) {
  const [membership] = await getDb().select({ id: member.id }).from(member)
    .where(and(eq(member.organizationId, u.organizationId), eq(member.userId, u.userId))).limit(1);
  if (!membership) throw new AppError(403, "Your organization membership is no longer active.");
}

/** Read current ownership and Pod access without requiring a still-existing agent. */
export async function readConversationAccess(u: WorkspaceUser, chatId: string) {
  await requireCurrentMembership(u);
  const [row] = await getDb().select({ data: records.data }).from(records)
    .where(and(eq(records.organizationId, u.organizationId), eq(records.id, chatId),
      eq(records.kind, "chat"), eq(records.createdBy, u.userId))).limit(1);
  if (!row) throw new AppError(404, "Conversation not found in this organization.");
  const chat = row.data as Chat;
  const pod = chat.podId ? await getPod(u, chat.podId) : null;
  // Membership could have changed while the source Pod was being checked.
  await requireCurrentMembership(u);
  return { chat, pod };
}
