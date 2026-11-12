import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { isValidTimeZone } from "@/lib/timezone";

type Identity = { organizationId: string; userId: string };
const idFor = (userId: string) => `personal-timezone:${userId}`;
export async function getPersonalTimezone(u: Identity): Promise<string | null> {
  const [row] = await getDb().select({ data: records.data }).from(records).where(and(eq(records.organizationId, u.organizationId), eq(records.createdBy, u.userId), eq(records.kind, "personal-timezone"), eq(records.id, idFor(u.userId)))).limit(1);
  const timezone = (row?.data as { timezone?: unknown } | undefined)?.timezone;
  return typeof timezone === "string" && isValidTimeZone(timezone) ? timezone : null;
}
export async function setPersonalTimezone(u: Identity, timezone: string) {
  await getDb().insert(records).values({organizationId:u.organizationId, createdBy:u.userId, id:idFor(u.userId), kind:"personal-timezone", data:{timezone}}).onConflictDoUpdate({target:[records.organizationId,records.id],set:{data:{timezone},updatedAt:new Date()},setWhere:and(eq(records.createdBy,u.userId),eq(records.kind,"personal-timezone"))});
}
