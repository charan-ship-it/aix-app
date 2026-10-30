import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import {
  authorizeFileScope,
  requireFolder,
  sameFileScope,
  type FileFolder,
} from "@/lib/folders";
import {
  requireUser,
  requireAdmin,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
const scopeSchema = z.object({
  podId: z.string().uuid().optional(),
  agentId: z.string().min(1).max(100).optional(),
});
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const query = new URL(req.url).searchParams;
    const parsed = scopeSchema.safeParse({
      podId: query.get("podId") || undefined,
      agentId: query.get("agentId") || undefined,
    });
    if (!parsed.success) throw new AppError(400, "Invalid file library.");
    const scope = parsed.data;
    await authorizeFileScope(user, scope);
    const rows = await getDb()
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, user.organizationId),
          eq(records.kind, "folder"),
        ),
      );
    return Response.json(
      {
        folders: rows
          .map((r) => r.data as FileFolder)
          .filter((f) => sameFileScope(f, scope)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const parsed = scopeSchema
      .extend({
        action: z.enum(["create", "rename", "delete"]),
        id: z.string().uuid().optional(),
        parentId: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120).optional(),
      })
      .safeParse(await readBody(req, 4000));
    if (!parsed.success) throw new AppError(400, "Check the folder details.");
    const body = parsed.data;
    const scope = { podId: body.podId, agentId: body.agentId };
    await authorizeFileScope(user, scope);
    if (body.parentId) await requireFolder(user, body.parentId, scope);
    const db = getDb();
    if (body.action === "create") {
      if (!body.name) throw new AppError(400, "Give the folder a name.");
      const folder: FileFolder = {
        ...scope,
        id: crypto.randomUUID(),
        name: body.name,
        parentId: body.parentId,
        updatedAt: new Date().toISOString(),
      };
      await db.insert(records).values({
        organizationId: user.organizationId,
        createdBy: user.userId,
        id: folder.id,
        kind: "folder",
        data: folder,
      });
      return Response.json({ folder });
    }
    if (!body.id) throw new AppError(400, "Choose a folder.");
    const folder = await requireFolder(user, body.id, scope);
    const where = and(
      eq(records.organizationId, user.organizationId),
      eq(records.kind, "folder"),
      eq(records.id, body.id),
    );
    const [owner] = await db
      .select({ createdBy: records.createdBy })
      .from(records)
      .where(where)
      .limit(1);
    if (owner.createdBy !== user.userId) requireAdmin(user);
    if (body.action === "rename") {
      if (!body.name) throw new AppError(400, "Give the folder a name.");
      await db
        .update(records)
        .set({
          data: {
            ...folder,
            name: body.name,
            updatedAt: new Date().toISOString(),
          },
        })
        .where(where);
    } else {
      const children = await db
        .select({ id: records.id })
        .from(records)
        .where(
          and(
            eq(records.organizationId, user.organizationId),
            sql`((${records.kind} = 'folder' AND ${records.data}->>'parentId' = ${body.id}) OR (${records.kind} = 'document' AND ${records.data}->>'folderId' = ${body.id}))`,
          ),
        )
        .limit(1);
      if (children.length)
        throw new AppError(
          409,
          "This folder contains files or folders. Remove them before deleting it.",
        );
      await db.delete(records).where(where);
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
