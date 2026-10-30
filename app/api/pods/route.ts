import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { podSchema } from "@/lib/pods";
import { getPod, listPods } from "@/lib/server/pods";
import { findAgent } from "@/lib/server/runtime";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
export async function GET(req: Request) {
  try {
    return Response.json(
      {
        items: await listPods(
          await requireUser(),
          new URL(req.url).searchParams.get("includeArchived") === "1",
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req),
      body = podSchema.safeParse(await readBody(req, 20000));
    if (!body.success)
      throw new AppError(400, "Add a Pod name and select a default employee.");
    const pod = body.data;
    await findAgent(u.organizationId, pod.defaultAgentId);
    const db = getDb();
    const [row] = await db
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, u.organizationId),
          eq(records.id, pod.id),
        ),
      )
      .limit(1);
    if (row) {
      if (row.kind !== "pod")
        throw new AppError(409, "This ID is already used.");
      await getPod(u, pod.id);
      if (row.createdBy !== u.userId && !["owner", "admin"].includes(u.role))
        throw new AppError(
          403,
          "Only the Pod owner or an organization admin can edit this Pod.",
        );
      await db
        .update(records)
        .set({ data: pod, updatedAt: new Date() })
        .where(
          and(
            eq(records.organizationId, u.organizationId),
            eq(records.id, pod.id),
          ),
        );
    } else
      await db.insert(records).values({
        id: pod.id,
        organizationId: u.organizationId,
        createdBy: u.userId,
        kind: "pod",
        data: pod,
      });
    return Response.json({ item: pod }, { status: row ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
