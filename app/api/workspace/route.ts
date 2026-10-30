import { resolveSkillInstructions } from "@/lib/server/skills";
import { readWorkspace } from "@/lib/server/workspace-query";
import { requireFolder, sameFileScope } from "@/lib/folders";
import { getPod } from "@/lib/server/pods";
import { findAgent } from "@/lib/server/runtime";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { records, chunks, auditEvents } from "@/db/schema";
import { agentSchema } from "@/lib/agent-config";
import {
  requireUser,
  requireAdmin,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { storeSource, deleteSource } from "@/lib/server/storage";
import { indexingQueue } from "@/lib/server/queue";
const documentSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  content: z.string().min(1).max(500000),
  updatedAt: z.string().datetime(),
  agentId: z.string().min(1).max(100).optional(),
  podId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
});
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const q = new URL(req.url).searchParams;
    return Response.json(
      await readWorkspace(u, {
        podId: q.get("podId") || undefined,
        agentId: q.get("agentId") || undefined,
        includeArchived: q.get("includeArchived") === "1",
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const body = z
      .object({
        kind: z.enum(["chat", "agent", "document"]),
        action: z.enum(["save", "delete", "reindex"]).default("save"),
        data: z.object({ id: z.string().min(1).max(100) }).passthrough(),
      })
      .safeParse(await readBody(req, 550000));
    if (!body.success) throw new AppError(400, "Invalid workspace item.");
    const { kind, action, data } = body.data;
    if (kind === "document" && typeof data.agentId === "string")
      await findAgent(u.organizationId, data.agentId);
    if (kind === "document" && typeof data.podId === "string")
      await getPod(u, data.podId);
    const db = getDb();
    const where = and(
      eq(records.organizationId, u.organizationId),
      eq(records.id, data.id),
      eq(records.kind, kind),
    );
    const [existing] = await db
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, u.organizationId),
          eq(records.id, data.id),
        ),
      )
      .limit(1);
    if (existing && (existing.data as { podId?: string }).podId)
      await getPod(u, (existing.data as { podId: string }).podId);
    if (kind === "document" && action === "save") {
      const scope = {
        podId: typeof data.podId === "string" ? data.podId : undefined,
        agentId: typeof data.agentId === "string" ? data.agentId : undefined,
      };
      if (scope.podId && scope.agentId)
        throw new AppError(400, "Choose one file library.");
      if (
        existing &&
        !sameFileScope(
          existing.data as { podId?: string; agentId?: string },
          scope,
        )
      )
        throw new AppError(
          409,
          "Copy this file to another library instead of moving its access scope.",
        );
      if (typeof data.folderId === "string")
        await requireFolder(u, data.folderId, scope);
    }
    if (existing && existing.kind !== kind)
      throw new AppError(409, "This item ID is already in use.");
    if (kind === "chat") {
      if (!existing || existing.createdBy !== u.userId)
        throw new AppError(404, "Conversation not found.");
      if (action !== "delete")
        throw new AppError(
          400,
          "Conversations are managed by the agent runtime.",
        );
    }
    if (kind === "agent" && existing && existing.createdBy !== u.userId)
      requireAdmin(u);
    if (kind === "document" && existing && existing.createdBy !== u.userId)
      requireAdmin(u);
    if (action === "delete") {
      if (kind === "document") await deleteSource(u.organizationId, data.id);
      await db.transaction(async (tx) => {
        if (kind === "document")
          await tx
            .delete(chunks)
            .where(
              and(
                eq(chunks.organizationId, u.organizationId),
                eq(chunks.documentId, data.id),
              ),
            );
        await tx.delete(records).where(where);
      });
    } else if (action === "reindex") {
      if (kind !== "document" || !existing)
        throw new AppError(404, "Document not found.");
      await db
        .update(records)
        .set({ data: { ...existing.data, status: "queued", indexError: null } })
        .where(where);
      await indexingQueue().add("index", {
        organizationId: u.organizationId,
        documentId: data.id,
      });
    } else {
      const parsed =
        kind === "agent"
          ? agentSchema.safeParse(data)
          : documentSchema.safeParse(data);
      if (!parsed.success)
        throw new AppError(400, "Check the required fields.");
      if (kind === "agent") {
        const config = agentSchema.parse(parsed.data);
        const selectedSkills = await resolveSkillInstructions(u.organizationId, config.skillIds);
        if (selectedSkills.skills.some(s => s.requiredToolkits.some(t => !config.toolkits.includes(t))))
          throw new AppError(400, "Enable the apps required by the selected skills in Tools & apps before saving.");
      }
      const value =
        kind === "document"
          ? {
              ...parsed.data,
              status: "queued",
              storageKey: await storeSource(
                u.organizationId,
                data.id,
                (parsed.data as { content: string }).content,
              ),
            }
          : parsed.data;
      await db
        .insert(records)
        .values({
          organizationId: u.organizationId,
          createdBy: u.userId,
          id: data.id,
          kind,
          data: value,
        })
        .onConflictDoUpdate({
          target: [records.organizationId, records.id],
          set: { data: value, updatedAt: new Date() },
        });
      if (kind === "document")
        await indexingQueue().add("index", {
          organizationId: u.organizationId,
          documentId: data.id,
        });
    }
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      organizationId: u.organizationId,
      actorId: u.userId,
      action: kind + "." + action,
      resourceId: data.id,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
