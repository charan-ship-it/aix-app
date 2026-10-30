import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  schedules,
  member,
  user,
  organization,
  runs,
  records,
} from "@/db/schema";
import { enqueueRun } from "./runtime";
import { scheduleQueue } from "./queue";
import { AppError } from "./http";

// The Bull job ID includes the planned occurrence timestamp. Redelivery keeps it unchanged.
export function scheduleRunIdentity(
  organizationId: string,
  scheduleId: string,
  occurrenceId: string,
) {
  const uuid = (kind: string) => {
    const hex = createHash("sha256")
      .update(JSON.stringify([kind, organizationId, scheduleId, occurrenceId]))
      .digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  return { runId: uuid("run"), chatId: uuid("chat") };
}
export async function executeScheduledRun(
  scheduleId: string,
  occurrenceId: string,
) {
  const db = getDb();
  const [schedule] = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.id, scheduleId), eq(schedules.enabled, true)))
    .limit(1);
  if (!schedule) return;
  const identity = scheduleRunIdentity(
    schedule.organizationId,
    schedule.id,
    occurrenceId,
  );
  const [existing] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.id, identity.runId),
        eq(runs.organizationId, schedule.organizationId),
      ),
    )
    .limit(1);
  if (existing) return identity;
  const [membership] = await db
    .select({
      name: user.name,
      email: user.email,
      role: member.role,
      organizationName: organization.name,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(
      and(
        eq(member.organizationId, schedule.organizationId),
        eq(member.userId, schedule.createdBy),
      ),
    )
    .limit(1);
  if (!membership) return;
  try {
    await enqueueRun(
      {
        organizationId: schedule.organizationId,
        organizationName: membership.organizationName,
        userId: schedule.createdBy,
        displayName: membership.name,
        email: membership.email,
        role: membership.role,
      },
      schedule.agentId,
      schedule.prompt,
      identity.chatId,
      undefined,
      { runId: identity.runId, scheduleId, occurrenceId },
    );
  } catch (error) {
    // Another delivery may have committed before its queue acknowledgement was lost.
    const [persisted] = await db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.id, identity.runId))
      .limit(1);
    if (persisted) return identity;
    // Infrastructure failures remain retryable; do not durably classify an unaccepted occurrence as a model failure.
    if (!(error instanceof AppError)) throw error;
    const message =
      "Scheduled run could not start. Check the agent, model key, and app connections.";
    await db.transaction(async (tx) => {
      // PK is the durable occurrence key, including failures before enqueue.
      const inserted = await tx
        .insert(runs)
        .values({
          id: identity.runId,
          organizationId: schedule.organizationId,
          createdBy: schedule.createdBy,
          chatId: identity.chatId,
          agentId: schedule.agentId,
          status: "failed",
          payload: { error: message, scheduleId, occurrenceId },
        })
        .onConflictDoNothing()
        .returning({ id: runs.id });
      if (!inserted.length) return;
      await tx.insert(records).values({
        organizationId: schedule.organizationId,
        createdBy: schedule.createdBy,
        id: identity.chatId,
        kind: "chat",
        data: {
          id: identity.chatId,
          agentId: schedule.agentId,
          title: schedule.name,
          messages: [
            { role: "user", content: schedule.prompt },
            {
              role: "assistant",
              content: message,
              error: true,
              runId: identity.runId,
            },
          ],
          updatedAt: new Date().toISOString(),
        },
      });
    });
  }
  return identity;
}

export async function reconcileSchedules(organizationId?: string) {
  const definitions = await getDb()
    .select()
    .from(schedules)
    .where(
      organizationId ? eq(schedules.organizationId, organizationId) : undefined,
    );
  const queue = scheduleQueue();
  for (const definition of definitions) {
    if (!definition.enabled) {
      await queue.removeJobScheduler(definition.id);
      continue;
    }
    const current = await queue.getJobScheduler(definition.id);
    if (
      current &&
      current.pattern === definition.pattern &&
      (current.tz || "UTC") === definition.timezone
    )
      continue;
    await queue.upsertJobScheduler(
      definition.id,
      { pattern: definition.pattern, tz: definition.timezone },
      {
        name: "scheduled-agent",
        data: { scheduleId: definition.id },
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      },
    );
  }
  if (!organizationId) {
    const known = new Set(definitions.map((definition) => definition.id));
    for (const registered of await queue.getJobSchedulers(0, -1))
      if (!known.has(registered.key))
        await queue.removeJobScheduler(registered.key);
  }
}
