import { and, eq, lt, or, asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { records, runs } from "@/db/schema";
import { agentQueue, indexingQueue, documentJobId } from "./queue";
import { withLock } from "./redis";
import type { Chat, Document } from "@/lib/workspace";
import type { RunPayload } from "./runtime";

// A running job can already have caused an external action. Never replay it.
export async function recoverRuns(organizationId?: string) {
  return withLock("run-recovery", async () => {
    const db = getDb();
    const stale = await db
      .select()
      .from(runs)
      .where(
        and(
          organizationId ? eq(runs.organizationId, organizationId) : undefined,
          or(
            and(
              eq(runs.status, "queued"),
              lt(runs.updatedAt, new Date(Date.now() - 15000)),
            ),
            and(
              eq(runs.status, "running"),
              lt(runs.updatedAt, new Date(Date.now() - 300000)),
            ),
          ),
        ),
      )
      .orderBy(asc(runs.updatedAt))
      .limit(100);
    for (const run of stale) {
      if (run.status === "queued") {
        // Stable per persisted transition: repeated reconciliations cannot flood the queue.
        await agentQueue().add(
          "recover",
          { runId: run.id },
          { jobId: "recover-" + run.id + "-" + run.updatedAt.getTime() },
        );
        continue;
      }
      const error =
        "The worker stopped before this run finished. Check any external actions before starting a new run.";
      await db.transaction(async (tx) => {
        const changed = await tx
          .update(runs)
          .set({
            status: "failed",
            updatedAt: new Date(),
            payload: { ...run.payload, error },
          })
          .where(
            and(
              eq(runs.id, run.id),
              eq(runs.status, "running"),
              lt(runs.updatedAt, new Date(Date.now() - 300000)),
            ),
          )
          .returning();
        if (!changed.length) return;
        const [record] = await tx
          .select()
          .from(records)
          .where(
            and(
              eq(records.organizationId, run.organizationId),
              eq(records.id, run.chatId),
              eq(records.kind, "chat"),
            ),
          )
          .for("update")
          .limit(1);
        if (record) {
          const chat = record.data as Chat;
          const message = {
            role: "assistant" as const,
            runId: run.id,
            error: true,
            content: error,
            trace: (run.payload as RunPayload).trace,
            pending: [],
          };
          const previous = chat.messages.findIndex((m) => m.runId === run.id);
          if (previous >= 0)
            chat.messages[previous] = {
              ...message,
              content: chat.messages[previous].content + "\n\n" + error,
            };
          else chat.messages.push(message);
          await tx
            .update(records)
            .set({ data: chat, updatedAt: new Date() })
            .where(
              and(
                eq(records.organizationId, run.organizationId),
                eq(records.id, run.chatId),
              ),
            );
        }
      });
    }
  });
}

export async function recoverIndexing(organizationId?: string) {
  return withLock("index-recovery", async () => {
    const db = getDb();
    const pending = await db
      .select()
      .from(records)
      .where(
        and(
          eq(records.kind, "document"),
          organizationId
            ? eq(records.organizationId, organizationId)
            : undefined,
          sql`${records.data}->>'status' = 'queued'`,
          lt(records.updatedAt, new Date(Date.now() - 15000)),
        ),
      )
      .orderBy(asc(records.updatedAt))
      .limit(100);
    const queued = pending
      .filter((r) => (r.data as Document).status === "queued")
      .slice(0, 100);
    if (!queued.length) return;
    const queue = indexingQueue();
    // Includes jobs created by the HTTP handlers, which predate deterministic IDs.
    const active = await queue.getJobs(
      ["active", "wait", "delayed", "prioritized"],
      0,
      -1,
    );
    const present = new Set(
      active.map((job) => job.data.organizationId + "\0" + job.data.documentId),
    );
    for (const row of queued) {
      const key = row.organizationId + "\0" + row.id;
      if (present.has(key)) continue;
      const doc = row.data as Document;
      const jobId = documentJobId(
        row.organizationId,
        row.id,
        doc.content,
        doc.updatedAt,
      );
      const existing = await queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (
          [
            "active",
            "waiting",
            "delayed",
            "waiting-children",
            "prioritized",
          ].includes(state)
        )
          continue;
        await existing.remove();
      }
      // indexDocument reads current content and checks its version inside a locked transaction.
      await queue.add(
        "index-recover",
        { organizationId: row.organizationId, documentId: row.id },
        { jobId },
      );
      present.add(key);
    }
  });
}
