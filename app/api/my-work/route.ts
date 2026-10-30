import { z } from "zod";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import {
  personalTaskFields,
  ownerEmailSchema,
  type PersonalTask,
} from "@/lib/my-work";
import {
  listPersonalTasks,
  workSettings,
  scribeSources,
  personalWhere,
  settingsId,
} from "@/lib/server/my-work";
export async function GET() {
  try {
    const user = await requireUser();
    const [tasks, settings, sources] = await Promise.all([
      listPersonalTasks(user),
      workSettings(user),
      scribeSources(user),
    ]);
    return Response.json(
      { tasks, settings: settings || null, sources, accountEmail: user.email },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
const bodySchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("create"), ...personalTaskFields.shape })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      id: z.string().uuid(),
      title: personalTaskFields.shape.title.optional(),
      notes: z.string().max(5000).optional(),
      dueDate: personalTaskFields.shape.dueDate,
      status: z.enum(["open", "completed"]).optional(),
    })
    .strict(),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }).strict(),
  z
    .object({
      action: z.literal("settings"),
      connectionId: z.string().uuid(),
      ownerEmail: ownerEmailSchema,
      confirmed: z.literal(true),
    })
    .strict(),
]);
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const parsed = bodySchema.safeParse(await readBody(req, 12000));
    if (!parsed.success)
      throw new AppError(
        400,
        "Check the task details, or confirm your own Scribe owner email.",
      );
    const body = parsed.data,
      db = getDb(),
      now = new Date().toISOString();
    if (body.action === "settings") {
      if (
        !(await scribeSources(user)).some(
          (source) => source.id === body.connectionId,
        )
      )
        throw new AppError(400, "Choose an enabled Scribe connection.");
      const id = settingsId(user);
      await db
        .insert(records)
        .values({
          organizationId: user.organizationId,
          createdBy: user.userId,
          id,
          kind: "personal-work-settings",
          data: {
            id,
            connectionId: body.connectionId,
            ownerEmail: body.ownerEmail,
            ownerConfirmedAt: now,
          },
        })
        .onConflictDoUpdate({
          target: [records.organizationId, records.id],
          set: {
            data: {
              id,
              connectionId: body.connectionId,
              ownerEmail: body.ownerEmail,
              ownerConfirmedAt: now,
            },
            updatedAt: new Date(),
          },
        });
      return Response.json({ ok: true });
    }
    if (body.action === "create") {
      const id = crypto.randomUUID();
      const task: PersonalTask = {
        id,
        title: body.title,
        notes: body.notes,
        dueDate: body.dueDate,
        status: "open",
        createdAt: now,
        updatedAt: now,
        source: { kind: "manual", url: body.sourceUrl, meeting: body.meeting },
      };
      await db.insert(records).values({
        organizationId: user.organizationId,
        createdBy: user.userId,
        id,
        kind: "personal-task",
        data: task,
      });
      return Response.json({ ok: true, task });
    }
    const task = await db.transaction(async (tx) => {
      const where = personalWhere(user, "personal-task", body.id);
      const [row] = await tx
        .select()
        .from(records)
        .where(where)
        .for("update")
        .limit(1);
      if (!row) throw new AppError(404, "Personal task not found.");
      if (body.action === "delete") {
        await tx.delete(records).where(where);
        return undefined;
      }
      const previous = row.data as PersonalTask;
      const status = body.status || previous.status;
      const updated: PersonalTask = {
        ...previous,
        title: body.title ?? previous.title,
        notes: body.notes ?? previous.notes,
        dueDate: body.dueDate === undefined ? previous.dueDate : body.dueDate,
        status,
        localStatusOverride:
          body.status !== undefined ? true : previous.localStatusOverride,
        completedAt:
          status === "completed" ? previous.completedAt || now : null,
        updatedAt: now,
      };
      await tx
        .update(records)
        .set({ data: updated, updatedAt: new Date() })
        .where(where);
      return updated;
    });
    return Response.json({ ok: true, task });
  } catch (error) {
    return errorResponse(error);
  }
}
