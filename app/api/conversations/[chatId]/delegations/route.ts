import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { runs } from "@/db/schema";
import { requireUser, errorResponse } from "@/lib/server/http";
import { readConversation } from "@/lib/server/conversations";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const u = await requireUser();
    const { chatId } = await params;
    await readConversation(u, chatId);
    const items = await getDb()
      .select({
        id: runs.id,
        chatId: runs.chatId,
        status: runs.status,
        agentName: sql<string>`${runs.payload}->'agent'->>'name'`,
      })
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, u.organizationId),
          eq(runs.createdBy, u.userId),
          sql`${runs.payload}->>'parentRunId' IN (SELECT id FROM agent_run WHERE organization_id=${u.organizationId} AND created_by=${u.userId} AND chat_id=${chatId})`,
        ),
      )
      .limit(20);
    return Response.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
