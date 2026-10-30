import { secret } from "@/lib/server/secrets";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { schedules } from "@/db/schema";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { scheduleQueue } from "@/lib/server/queue";
import { findAgent } from "@/lib/server/runtime";
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    return Response.json(
      {
        items: await getDb()
          .select()
          .from(schedules)
          .where(
            and(
              eq(schedules.organizationId, u.organizationId),
              eq(schedules.createdBy, u.userId),
              new URL(req.url).searchParams.get("agentId")
                ? eq(
                    schedules.agentId,
                    new URL(req.url).searchParams.get("agentId")!,
                  )
                : undefined,
            ),
          )
          .orderBy(desc(schedules.createdAt)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser(req);
    const b = z
      .object({
        agentId: z.string().max(100),
        name: z.string().min(1).max(100),
        prompt: z.string().min(1).max(10000),
        frequency: z.enum(["hourly", "daily", "weekly"]),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .default("09:00"),
        timezone: z.string().max(60).default("UTC"),
      })
      .safeParse(await readBody(req, 13000));
    if (!b.success) throw new AppError(400, "Check the schedule fields.");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: b.data.timezone }).format();
    } catch {
      throw new AppError(400, "Use a valid IANA timezone.");
    }
    const agent = await findAgent(u.organizationId, b.data.agentId);
    if (!(await secret(u.organizationId, agent.provider)))
      throw new AppError(
        428,
        "Connect the employee’s model provider in Settings before scheduling work.",
      );
    if (agent.toolkits.length && !(await secret(u.organizationId, "composio")))
      throw new AppError(
        428,
        "App connections are temporarily unavailable. Contact AIX support.",
      );
    const [h, m] = b.data.time.split(":").map(Number);
    const pattern =
      b.data.frequency === "hourly"
        ? `${m} * * * *`
        : b.data.frequency === "daily"
          ? `${m} ${h} * * *`
          : `${m} ${h} * * 1`;
    const id = crypto.randomUUID();
    await getDb().insert(schedules).values({
      id,
      organizationId: u.organizationId,
      createdBy: u.userId,
      agentId: b.data.agentId,
      name: b.data.name,
      prompt: b.data.prompt,
      pattern,
      timezone: b.data.timezone,
    });
    try {
      await scheduleQueue().upsertJobScheduler(
        id,
        { pattern, tz: b.data.timezone },
        {
          name: "scheduled-agent",
          data: { scheduleId: id },
          opts: {
            attempts: 3,
            backoff: { type: "exponential", delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        },
      );
    } catch {
      await getDb().delete(schedules).where(eq(schedules.id, id));
      throw new AppError(503, "Could not register the schedule. Check Redis.");
    }
    return Response.json({ ok: true, id });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: Request) {
  try {
    const u = await requireUser(req);
    const b = z
      .object({ id: z.string().uuid() })
      .safeParse(await readBody(req, 1000));
    if (!b.success) throw new AppError(400, "Choose a schedule.");
    const where = and(
      eq(schedules.id, b.data.id),
      eq(schedules.organizationId, u.organizationId),
      eq(schedules.createdBy, u.userId),
    );
    const [row] = await getDb().select().from(schedules).where(where).limit(1);
    if (!row) throw new AppError(404, "Schedule not found.");
    // PostgreSQL is authoritative. A queued delivery rechecks the definition before doing work.
    await getDb().delete(schedules).where(where);
    await scheduleQueue()
      .removeJobScheduler(row.id)
      .catch(() =>
        console.error(
          "Schedule removed; Redis registration cleanup will be reconciled",
          { scheduleId: row.id },
        ),
      );
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
