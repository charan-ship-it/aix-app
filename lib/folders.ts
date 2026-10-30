import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import { AppError, type WorkspaceUser } from "@/lib/server/http";
import { getPod } from "@/lib/server/pods";
import { findAgent } from "@/lib/server/runtime";

export type FileScope = { podId?: string; agentId?: string };
export type FileFolder = FileScope & {
  id: string;
  name: string;
  parentId?: string;
  updatedAt: string;
};
export function sameFileScope(a: FileScope, b: FileScope) {
  return (
    (a.podId || "") === (b.podId || "") &&
    (a.agentId || "") === (b.agentId || "")
  );
}
export async function authorizeFileScope(
  user: WorkspaceUser,
  scope: FileScope,
) {
  if (scope.podId && scope.agentId)
    throw new AppError(400, "Choose a Pod or employee file library.");
  if (scope.podId) await getPod(user, scope.podId);
  if (scope.agentId) await findAgent(user.organizationId, scope.agentId);
}
export async function requireFolder(
  user: WorkspaceUser,
  id: string,
  scope: FileScope,
) {
  const [row] = await getDb()
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, user.organizationId),
        eq(records.kind, "folder"),
        eq(records.id, id),
      ),
    )
    .limit(1);
  if (!row || !sameFileScope(row.data as FileFolder, scope))
    throw new AppError(404, "Folder not found in this file library.");
  return row.data as FileFolder;
}
