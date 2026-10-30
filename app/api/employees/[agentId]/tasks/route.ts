import { getPod } from "@/lib/server/pods";
import { z } from "zod";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { records, runs, auditEvents } from "@/db/schema";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { findAgent, enqueueRun } from "@/lib/server/runtime";
import { withLock, rateLimit } from "@/lib/server/redis";
import type { EmployeeTask } from "@/lib/employee-tasks";
const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    title: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(20000),
  }),
  z.object({
    action: z.literal("run"),
    id: z.string().uuid(),
    agentId: z.string().max(100).optional(),
    instructions: z.string().max(10000).optional(),
  }),
  z.object({
    action: z.enum(["complete", "reopen", "delete"]),
    id: z.string().uuid(),
  }),
]);
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ agentId?: string; podId?: string }> },
) {
  try {
    const user = await requireUser();
    const scope = await params;
    const pod = scope.podId ? await getPod(user, scope.podId) : null;
    const agentId = scope.agentId || pod!.defaultAgentId;
    if (!pod) await findAgent(user.organizationId, agentId);
    const scopeFilter = pod
      ? sql`${records.data}->>'podId' = ${pod.id}`
      : and(
          sql`${records.data}->>'agentId' = ${agentId}`,
          sql`${records.data}->>'podId' IS NULL`,
        );
    const rows = await getDb()
      .select()
      .from(records)
      .where(
        and(
          eq(records.organizationId, user.organizationId),
          eq(records.createdBy, user.userId),
          eq(records.kind, "task"),
          scopeFilter,
        ),
      )
      .orderBy(desc(records.createdAt));
    const tasks = rows.map((row) => row.data as EmployeeTask);
    const ids = tasks.flatMap((t) => (t.runId ? [t.runId] : []));
    const activeRuns = ids.length
      ? await getDb()
          .select({ id: runs.id, status: runs.status })
          .from(runs)
          .where(
            and(
              eq(runs.organizationId, user.organizationId),
              eq(runs.createdBy, user.userId),

              inArray(runs.id, ids),
            ),
          )
      : [];
    return Response.json(
      {
        items: tasks.map((t) => ({
          ...t,
          runStatus: activeRuns.find((r) => r.id === t.runId)?.status,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ agentId?: string; podId?: string }> },
) {
  try {
    const user = await requireUser(req);
    const scope = await params;
    const pod = scope.podId ? await getPod(user, scope.podId) : null;
    const agentId = scope.agentId || pod!.defaultAgentId;
    if (!pod) await findAgent(user.organizationId, agentId);
    const scopeFilter = pod
      ? sql`${records.data}->>'podId' = ${pod.id}`
      : and(
          sql`${records.data}->>'agentId' = ${agentId}`,
          sql`${records.data}->>'podId' IS NULL`,
        );
    const parsed = requestSchema.safeParse(await readBody(req, 32000));
    if (!parsed.success)
      throw new AppError(400, "Add a task title and clear instructions.");
    const body = parsed.data;
    const db = getDb();
    if (body.action === "create") {
      const id = crypto.randomUUID(),
        now = new Date().toISOString();
      const task: EmployeeTask = {
        id,
        agentId,
        ...(pod ? { podId: pod.id } : {}),
        title: body.title,
        prompt: body.prompt,
        status: "todo",
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(records).values({
        id,
        organizationId: user.organizationId,
        createdBy: user.userId,
        kind: "task",
        data: task,
      });
      return Response.json({ item: task }, { status: 201 });
    }
    return await withLock(
      "employee-task:" + user.organizationId + ":" + body.id,
      async () => {
        const where = and(
          eq(records.organizationId, user.organizationId),
          eq(records.createdBy, user.userId),
          eq(records.id, body.id),
          eq(records.kind, "task"),
          scopeFilter,
        );
        const [row] = await db.select().from(records).where(where).limit(1);
        if (!row)
          throw new AppError(404, "Task not found in this employee workspace.");
        const task = row.data as EmployeeTask;
        if (task.runId) {
          const [run] = await db
            .select()
            .from(runs)
            .where(
              and(
                eq(runs.id, task.runId),
                eq(runs.organizationId, user.organizationId),
                eq(runs.createdBy, user.userId),
              ),
            )
            .limit(1);
          if (
            run &&
            ["queued", "running", "awaiting_approval"].includes(run.status)
          )
            throw new AppError(
              409,
              "Finish or stop the linked run before changing this task.",
            );
        }
        if (body.action === "delete") {
          await db.delete(records).where(where);
          return Response.json({ ok: true });
        }
        if (body.action === "run") {
          if (
            !(await rateLimit(
              user.organizationId + ":" + user.userId + ":runs",
              20,
              60,
            ))
          )
            throw new AppError(
              429,
              "Too many runs. Wait a minute and try again.",
            );
          const selectedAgent = body.agentId || task.agentId;
          if (!pod && selectedAgent !== agentId)
            throw new AppError(400, "Use this employee for its own tasks.");
          if (task.chatId && selectedAgent !== task.agentId)
            throw new AppError(
              409,
              "Continue the existing task conversation with its original employee.",
            );
          const queued = await enqueueRun(
            user,
            selectedAgent,
            task.prompt +
              (body.instructions?.trim()
                ? "\n\nAdditional instructions:\n" + body.instructions.trim()
                : ""),
            task.chatId || crypto.randomUUID(),
            pod?.id,
          );
          const updated = {
            ...task,
            agentId: selectedAgent,
            chatId: queued.chat.id,
            runId: queued.runId,
            status: "todo" as const,
            updatedAt: new Date().toISOString(),
          };
          await db
            .update(records)
            .set({ data: updated, updatedAt: new Date() })
            .where(where);
          return Response.json({
            item: updated,
            runId: queued.runId,
            chatId: queued.chat.id,
          });
        }
        const updated = {
          ...task,
          status:
            body.action === "complete" ? ("done" as const) : ("todo" as const),
          ...(body.action === "reopen" ? { runId: undefined } : {}),
          updatedAt: new Date().toISOString(),
        };
        await db
          .update(records)
          .set({ data: updated, updatedAt: new Date() })
          .where(where);
        await db.insert(auditEvents).values({
          id: crypto.randomUUID(),
          organizationId: user.organizationId,
          actorId: user.userId,
          action: "task." + body.action,
          resourceId: task.id,
        });
        return Response.json({ item: updated });
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
