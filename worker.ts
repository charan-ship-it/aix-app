try {
  process.loadEnvFile();
} catch {}
import { Worker } from "bullmq";
import { EVALUATION_QUEUE } from "./lib/server/eval-queue";
import { executeEvaluation, recoverEvaluations } from "./lib/server/evals";
import { redisConnection, documentJobId } from "./lib/server/queue";
import { indexDocument } from "./lib/server/rag";
import type { Document } from "./lib/workspace";
import { runAgent } from "./lib/server/runtime";
import {
  executeScheduledRun,
  reconcileSchedules,
} from "./lib/server/scheduler";
import { getDb } from "./db";
import { records } from "./db/schema";
import { and, eq } from "drizzle-orm";
import { getRedis, withLock } from "./lib/server/redis";
import { recoverRuns, recoverIndexing } from "./lib/server/recovery";
const recover = async () => {
  const results = await Promise.allSettled([
    recoverRuns(),
    recoverIndexing(),
    reconcileSchedules(),
    recoverEvaluations(),
  ]);
  results.forEach((result, index) => {
    if (result.status === "rejected")
      console.error(
        [
          "Run recovery check failed",
          "Index recovery check failed",
          "Schedule reconciliation failed",
          "Evaluation recovery check failed",
        ][index],
      );
  });
};
const recovery = setInterval(() => void recover(), 30000);
void recover();
const heartbeat = setInterval(() => {
  getRedis()
    .set("workers:heartbeat", String(process.pid), "EX", 45)
    .catch(() => {});
}, 10000);
getRedis()
  .set("workers:heartbeat", String(process.pid), "EX", 45)
  .catch(() => {});
const connection = redisConnection();
const indexing = new Worker(
  "knowledge-index",
  async (job) => {
    const { organizationId, documentId } = job.data;
    try {
      await withLock("index:" + organizationId + ":" + documentId, async () => {
        const [row] = await getDb()
          .select()
          .from(records)
          .where(
            and(
              eq(records.organizationId, organizationId),
              eq(records.id, documentId),
              eq(records.kind, "document"),
            ),
          )
          .limit(1);
        if (!row) return;
        await job.updateData({
          ...job.data,
          sourceVersion: documentJobId(
            organizationId,
            documentId,
            (row.data as Document).content,
            (row.data as Document).updatedAt,
          ),
        });
        await indexDocument(organizationId, documentId);
      });
    } catch (error) {
      // Another indexing job owns this document. Its current-content transaction is authoritative.
      if (
        error instanceof Error &&
        error.message === "This conversation already has an active run."
      )
        return;
      throw error;
    }
  },
  { connection, concurrency: 2 },
);
const agents = new Worker(
  "agent-run",
  async (job) => runAgent(job.data.runId),
  { connection, concurrency: 3 },
);
const evaluations = new Worker(EVALUATION_QUEUE, async (job) => executeEvaluation(job.data.id, job.data.organizationId), {connection, concurrency: 1});
const scheduler = new Worker(
  "agent-schedule",
  async (job) => {
    if (!job.id)
      throw new Error("Scheduled occurrence has no stable job identity.");
    await executeScheduledRun(job.data.scheduleId, job.id);
  },
  { connection, concurrency: 1 },
);
indexing.on("failed", (job) => {
  if (!job || job.attemptsMade < 3) return;
  const { organizationId, documentId, sourceVersion } = job.data;
  void getDb()
    .transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(records)
        .where(
          and(
            eq(records.organizationId, organizationId),
            eq(records.id, documentId),
            eq(records.kind, "document"),
          ),
        )
        .for("update")
        .limit(1);
      if (!row) return;
      const document = row.data as Document;
      if (
        document.status !== "queued" ||
        sourceVersion !==
          documentJobId(
            organizationId,
            documentId,
            document.content,
            document.updatedAt,
          )
      )
        return;
      await tx
        .update(records)
        .set({
          data: {
            ...document,
            status: "failed",
            indexError:
              "Indexing failed. Check your embedding provider and retry.",
          },
        })
        .where(
          and(
            eq(records.organizationId, organizationId),
            eq(records.id, documentId),
            eq(records.kind, "document"),
          ),
        );
    })
    .catch(() =>
      console.error("Could not persist indexing failure", {
        organizationId,
        documentId,
      }),
    );
});
for (const w of [indexing, agents, scheduler, evaluations]) {
  w.on("ready", () => console.log(w.name + " worker ready"));
  w.on("error", () => console.error(w.name + " worker connection error"));
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    clearInterval(heartbeat);
    clearInterval(recovery);
    await Promise.all([indexing.close(), agents.close(), scheduler.close(), evaluations.close()]);
    process.exit(0);
  });
