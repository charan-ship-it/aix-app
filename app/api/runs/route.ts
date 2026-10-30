import { getPod } from "@/lib/server/pods";
import { and, eq, desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { runs } from "@/db/schema";
import { requireUser, errorResponse } from "@/lib/server/http";
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const podId = new URL(req.url).searchParams.get("podId");
    if (podId) await getPod(u, podId);
    const items = await getDb()
      .select({
        id: runs.id,
        chatId: runs.chatId,
        agentId: runs.agentId,
        status: runs.status,
        createdAt: runs.createdAt,
        updatedAt: runs.updatedAt,
      })
      .from(runs)
      .where(
        and(
          eq(runs.organizationId, u.organizationId),
          eq(runs.createdBy, u.userId),
          podId
            ? sql`${runs.chatId} IN (SELECT id FROM workspace_record WHERE organization_id = ${u.organizationId} AND kind = 'chat' AND data->>'podId' = ${podId})`
            : new URL(req.url).searchParams.has("agentId")
              ? sql`${runs.chatId} IN (SELECT id FROM workspace_record WHERE organization_id = ${u.organizationId} AND kind = 'chat' AND data->>'podId' IS NULL)`
              : undefined,
          new URL(req.url).searchParams.get("agentId")
            ? eq(runs.agentId, new URL(req.url).searchParams.get("agentId")!)
            : undefined,
        ),
      )
      .orderBy(desc(runs.createdAt))
      .limit(50);
    return Response.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
