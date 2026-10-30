import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { AppError, type WorkspaceUser } from "./http";
import type { Pod } from "@/lib/pods";
export async function getPod(u: WorkspaceUser, id: string) {
  const [r] = await getDb()
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, u.organizationId),
        eq(records.kind, "pod"),
        eq(records.id, id),
      ),
    )
    .limit(1);
  if (!r) throw new AppError(404, "Pod not found.");
  const pod = r.data as Pod;
  if (pod.access !== "organization" && r.createdBy !== u.userId)
    throw new AppError(404, "Pod not found.");
  return { ...pod, archived: pod.archived === true, ownerId: r.createdBy };
}
export async function listPods(u: WorkspaceUser, includeArchived = false) {
  const rows = await getDb()
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, u.organizationId),
        eq(records.kind, "pod"),
        ...(includeArchived
          ? []
          : [sql`COALESCE(${records.data}->>'archived', 'false') <> 'true'`]),
        sql`(${records.createdBy} = ${u.userId} OR ${records.data}->>'access' = 'organization')`,
      ),
    );
  return rows.map(
    (r) =>
      ({
        ...r.data,
        archived: (r.data as { archived?: boolean }).archived === true,
        ownerId: r.createdBy,
      }) as Pod,
  );
}
