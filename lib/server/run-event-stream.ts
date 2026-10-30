import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runs } from "@/db/schema";
import { AppError, type WorkspaceUser } from "./http";
import { getRedis } from "./redis";
import { readConversationAccess } from "./conversation-access";

/** Same access boundary for event batches and terminal fallback, including revocation. */
export async function openRunEventStream(
  u: WorkspaceUser,
  id: string,
  options: { signal: AbortSignal; after?: string; pollMs?: number },
): Promise<ReadableStream<Uint8Array>> {
  const db = getDb();
  const where = and(eq(runs.id, id), eq(runs.organizationId, u.organizationId), eq(runs.createdBy, u.userId));
  const [run] = await db.select({ chatId: runs.chatId }).from(runs).where(where).limit(1);
  if (!run) throw new AppError(404, "Run not found.");
  await readConversationAccess(u, run.chatId);
  const encoder = new TextEncoder();
  let closed = false;
  return new ReadableStream({
    async start(controller) {
      let last = options.after && /^\d+-\d+$/.test(options.after) ? options.after : "0-0";
      const send = (data: unknown) => {
        if (!closed && !options.signal.aborted) controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
      };
      try {
        const end = Date.now() + 170000;
        while (!closed && !options.signal.aborted && Date.now() < end) {
          const entries = await getRedis().xrange("run-events:" + id, "(" + last, "+", "COUNT", 100);
          // Read access AFTER fetching a batch, immediately before any source event is published.
          await readConversationAccess(u, run.chatId);
          for (const [eventId, fields] of entries) {
            last = eventId;
            const field = fields.indexOf("data");
            if (field < 0) continue;
            const event = JSON.parse(fields[field + 1]);
            send({ ...event, eventId });
            if (event.type === "done" || event.type === "error") { closed = true; break; }
          }
          if (closed || options.signal.aborted) break;
          const [fresh] = await db.select({ status: runs.status }).from(runs).where(where).limit(1);
          if (!fresh) break;
          if (!["queued", "running"].includes(fresh.status)) {
            const { chat } = await readConversationAccess(u, run.chatId);
            send({ type: "done", data: { chat, status: fresh.status } });
            closed = true;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, options.pollMs ?? 500));
        }
        if (!closed && !options.signal.aborted) {
          await readConversationAccess(u, run.chatId);
          send({ type: "reconnect", data: { runId: id } });
        }
      } catch (error) {
        // Revocation closes the stream without returning any additional source data.
        if (!(error instanceof AppError && [403, 404].includes(error.status)) && !closed && !options.signal.aborted) {
          try {
            await readConversationAccess(u, run.chatId);
            send({ type: "error", data: "Connection interrupted. Your run continues in the background." });
          } catch { /* Access or storage unavailable: close without source data. */ }
        }
      } finally {
        closed = true;
        try { controller.close(); } catch { /* Reader already cancelled. */ }
      }
    },
    cancel() { closed = true; },
  });
}
