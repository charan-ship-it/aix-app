import { and, eq, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import { runs, records } from "@/db/schema";
import type { Chat } from "@/lib/workspace";
import type { WorkInboxData } from "@/lib/work-inbox";
import { type WorkspaceUser, AppError } from "./http";
import { getPod } from "./pods";
export async function readWorkInbox(u: WorkspaceUser): Promise<WorkInboxData> {
  const chats = alias(records, "inbox_chat"),
    reviews = alias(records, "inbox_review"),
    pods = alias(records, "inbox_pod");
  const rows = await getDb()
    .select({
      run: {
        id: runs.id,
        chatId: runs.chatId,
        agentId: runs.agentId,
        status: runs.status,
        updatedAt: runs.updatedAt,
      },
      title: sql<string>`${chats.data}->>'title'`,
      podId: sql<string | null>`${chats.data}->>'podId'`,
      podName: sql<string | null>`${pods.data}->>'name'`,
      agentName: sql<string | null>`${runs.payload}->'agent'->>'name'`,
      error: sql<string | null>`${runs.payload}->>'error'`,
      pendingCount: sql<number>`CASE WHEN jsonb_typeof(${runs.payload}->'pending')='array' THEN jsonb_array_length(${runs.payload}->'pending') ELSE 0 END`,
      review: reviews.data,
    })
    .from(runs)
    .innerJoin(
      chats,
      and(
        eq(chats.organizationId, runs.organizationId),
        eq(chats.id, runs.chatId),
        eq(chats.kind, "chat"),
        eq(chats.createdBy, u.userId),
      ),
    )
    .leftJoin(
      pods,
      and(
        eq(pods.organizationId, runs.organizationId),
        eq(pods.kind, "pod"),
        sql`${pods.id}=${chats.data}->>'podId'`,
      ),
    )
    .leftJoin(
      reviews,
      and(
        eq(reviews.organizationId, runs.organizationId),
        eq(reviews.createdBy, u.userId),
        eq(reviews.kind, "run-review"),
        sql`${reviews.id}='run-review:'||${runs.id}`,
      ),
    )
    .where(
      and(
        eq(runs.organizationId, u.organizationId),
        eq(runs.createdBy, u.userId),
        sql`(${chats.data}->>'podId' IS NULL OR (${pods.id} IS NOT NULL AND (${pods.createdBy}=${u.userId} OR ${pods.data}->>'access'='organization')))`,
      ),
    )
    .orderBy(
      sql`CASE WHEN ${runs.status}='awaiting_approval' THEN 0 WHEN ${runs.status}='failed' THEN 1 WHEN ${runs.status} IN ('running','queued') THEN 2 ELSE 3 END`,
      desc(runs.updatedAt),
    )
    .limit(100);
  return {
    limit: 100,
    items: rows.map(
      ({
        run,
        title,
        podId,
        podName,
        agentName,
        error,
        pendingCount,
        review,
      }) => {
        const r = review as { runUpdatedAt?: string } | null;
        return {
          id: run.id,
          chatId: run.chatId,
          title,
          agentId: run.agentId,
          agentName: agentName || "Agent",
          ...(podId ? { podId, podName: podName || "Project" } : {}),
          status: run.status,
          updatedAt: run.updatedAt.toISOString(),
          pendingCount,
          ...(error ? { error } : {}),
          reviewed: r?.runUpdatedAt === run.updatedAt.toISOString(),
        };
      },
    ),
  };
}
export async function reviewWork(
  u: WorkspaceUser,
  id: string,
  updatedAt: string,
) {
  await getDb().transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, u.organizationId),
          eq(runs.createdBy, u.userId),
          eq(runs.id, id),
        ),
      )
      .for("update");
    if (!run) throw new AppError(404, "Work item not found.");
    if (
      !["completed", "failed", "cancelled"].includes(run.status) ||
      run.updatedAt.toISOString() !== updatedAt
    )
      throw new AppError(
        409,
        "This work item changed. Refresh before marking it reviewed.",
      );
    const [row] = await tx
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, u.organizationId),
          eq(records.createdBy, u.userId),
          eq(records.kind, "chat"),
          eq(records.id, run.chatId),
        ),
      );
    if (!row) throw new AppError(404, "Conversation not found.");
    const chat = row.data as Chat;
    if (chat.podId) await getPod(u, chat.podId);
    await tx
      .insert(records)
      .values({
        id: "run-review:" + id,
        organizationId: u.organizationId,
        createdBy: u.userId,
        kind: "run-review",
        data: {
          runId: id,
          runUpdatedAt: updatedAt,
          reviewedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [records.organizationId, records.id],
        set: {
          data: {
            runId: id,
            runUpdatedAt: updatedAt,
            reviewedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      });
  });
}
