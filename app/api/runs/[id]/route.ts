import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { runs, records } from "@/db/schema";
import { requireUser, errorResponse, AppError } from "@/lib/server/http";
import type { RunPayload } from "@/lib/server/runtime";
import type { Chat } from "@/lib/workspace";
import { getPod } from "@/lib/server/pods";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await requireUser();
    const { id } = await params;
    const [run] = await getDb()
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.id, id),
          eq(runs.organizationId, u.organizationId),
          eq(runs.createdBy, u.userId),
        ),
      )
      .limit(1);
    if (!run) throw new AppError(404, "Run not found.");
    const payload = run.payload as RunPayload;
    const [chat] = await getDb()
      .select({ data: records.data })
      .from(records)
      .where(
        and(
          eq(records.organizationId, u.organizationId),
          eq(records.id, run.chatId),
          eq(records.kind, "chat"),
          eq(records.createdBy, u.userId),
        ),
      )
      .limit(1);
    if (!chat) throw new AppError(404, "Conversation not found.");
    if ((chat.data as Chat).podId) await getPod(u, (chat.data as Chat).podId!);
    return Response.json(
      {
        id: run.id,
        status: run.status,
        agentId: run.agentId,
        chat: chat?.data,
        pending: payload.pending,
        trace: payload.trace,
        usage: payload.usage,
        error: payload.error,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
