import { createHash } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/db";
import { records, runs } from "@/db/schema";
import { firstTaskGoals, type GettingStartedPreference, type GettingStartedState } from "@/lib/getting-started";
import { AppError, type WorkspaceUser } from "./http";
import { requireCurrentMembership } from "./conversation-access";
import { connectionSettings } from "./secrets";
import { composioFor, composioUser } from "./composio";
import { composioPlatformConfig } from "./composio-config";

const preferenceSchema = z.object({ goal: z.enum(firstTaskGoals).nullable(), dismissed: z.boolean() }).strict();
const patchSchema = preferenceSchema.partial().refine(value => Object.keys(value).length > 0);
function preferenceId(u: WorkspaceUser) {
  return "getting-started:" + createHash("sha256").update(JSON.stringify([u.organizationId, u.userId])).digest("hex");
}
export async function readGettingStartedPreference(u: WorkspaceUser): Promise<GettingStartedPreference> {
  await requireCurrentMembership(u);
  const [row] = await getDb().select({ data: records.data }).from(records).where(and(
    eq(records.organizationId, u.organizationId), eq(records.createdBy, u.userId),
    eq(records.kind, "getting_started"), eq(records.id, preferenceId(u)),
  )).limit(1);
  const parsed = preferenceSchema.safeParse(row?.data);
  return parsed.success ? parsed.data : { goal: null, dismissed: false };
}
export async function saveGettingStartedPreference(u: WorkspaceUser, value: unknown): Promise<GettingStartedPreference> {
  const parsed = patchSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Choose a supported starting task or whether to show the guide.");
  await requireCurrentMembership(u);
  const defaults = { goal: null, dismissed: false, ...parsed.data };
  const [row] = await getDb().insert(records).values({ organizationId: u.organizationId, id: preferenceId(u),
    createdBy: u.userId, kind: "getting_started", data: defaults }).onConflictDoUpdate({
      target: [records.organizationId, records.id],
      // Merge only the supplied fields so concurrent goal/dismiss updates cannot erase each other.
      set: { data: sql`${records.data} || ${JSON.stringify(parsed.data)}::jsonb`, updatedAt: new Date() },
      setWhere: and(eq(records.createdBy, u.userId), eq(records.kind, "getting_started")),
    }).returning({ data: records.data });
  await requireCurrentMembership(u);
  if (!row) throw new AppError(409, "The getting started guide could not be saved.");
  return preferenceSchema.parse(row.data);
}

export async function readGettingStartedProgress(u: WorkspaceUser): Promise<GettingStartedState["progress"]> {
  await requireCurrentMembership(u);
  const chat = alias(records, "first_task_chat"), pod = alias(records, "first_task_pod");
  const podId = sql<string | null>`nullif(${chat.data}->>'podId','')`;
  const [row] = await getDb().select({ id: chat.id,
    completed: sql<boolean>`exists(select 1 from ${runs} where ${runs.organizationId}=${chat.organizationId}
      and ${runs.createdBy}=${u.userId} and ${runs.chatId}=${chat.id} and ${runs.status}='completed'
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(${chat.data}->'messages')='array'
        then ${chat.data}->'messages' else '[]'::jsonb end) as message
        where message->>'runId'=${runs.id} and message->>'role'='assistant'
          and coalesce(message->>'demo','false') <> 'true' and coalesce(message->>'error','false') <> 'true'
          and length(trim(coalesce(message->>'content',''))) > 0))`,
  }).from(chat).leftJoin(pod, and(eq(pod.organizationId, chat.organizationId), eq(pod.kind, "pod"), eq(pod.id, podId)))
    .where(and(eq(chat.organizationId, u.organizationId), eq(chat.createdBy, u.userId), eq(chat.kind, "chat"),
      or(sql`${podId} is null`, and(sql`${pod.id} is not null`, or(eq(pod.createdBy, u.userId), sql`${pod.data}->>'access'='organization'`)))))
    // Prefer a real completed result, while still returning the newest chat if none completed.
    .orderBy(sql`2 desc`, desc(chat.updatedAt), desc(chat.id)).limit(1);
  await requireCurrentMembership(u);
  return { hasConversation: !!row, hasCompletedRun: row?.completed === true, lastConversationId: row?.id || null };
}

type ConnectionQuery = {
  userIds: string[];
  toolkitSlugs: string[];
  statuses: ["ACTIVE"];
  accountType: "PRIVATE";
  limit: 1;
};
type ConnectionReader = {
  isConfigured: () => boolean;
  list: (query: ConnectionQuery, options: { signal: AbortSignal }) => Promise<{
    items: { status: string; toolkit: { slug: string } }[];
  }>;
};
export async function readGettingStartedConnections(
  u: WorkspaceUser,
  reader?: ConnectionReader,
): Promise<GettingStartedState["connections"]> {
  const empty = { email: false, calendar: false };
  try {
    const configured = reader ? reader.isConfigured() : !!composioPlatformConfig().apiKey;
    if (!configured) return { status: "unavailable", ...empty };
    const client = reader ? null : await composioFor(u.organizationId);
    const userId = composioUser(u.organizationId, u.userId);
    const signal = AbortSignal.timeout(5000);
    // Installed SDK ConnectedAccounts.list accepts per-request cancellation and PRIVATE user filters.
    // Read authorization metadata directly: never start OAuth or create a tool-router session on home load.
    const connected = await Promise.all(["gmail", "outlook", "googlecalendar"].map(async toolkit => {
      const query: ConnectionQuery = { userIds: [userId], toolkitSlugs: [toolkit],
        statuses: ["ACTIVE"], accountType: "PRIVATE", limit: 1 };
      const result = reader
        ? await reader.list(query, { signal })
        : await client!.connectedAccounts.list(query, { signal });
      return result.items.some(item => item.status === "ACTIVE" && item.toolkit.slug === toolkit);
    }));
    return { status: "ready", email: connected[0] || connected[1], calendar: connected[2] };
  } catch {
    return { status: "error", ...empty };
  }
}
export async function readGettingStarted(u: WorkspaceUser): Promise<GettingStartedState> {
  await requireCurrentMembership(u);
  const [preference, settings, connections, progress] = await Promise.all([
    readGettingStartedPreference(u), connectionSettings(u.organizationId), readGettingStartedConnections(u), readGettingStartedProgress(u),
  ]);
  await requireCurrentMembership(u);
  return { preference, model: { ready: settings.providers.some(item => item.configured), canManage: ["owner", "admin"].includes(u.role) }, connections, progress };
}
