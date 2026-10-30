import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/db";
import { member, records } from "@/db/schema";
import { agents as builtinAgents } from "@/lib/workspace";
import type { ConversationIndexPage } from "@/lib/conversation-index";
import { AppError, type WorkspaceUser } from "./http";
import { requireCurrentMembership } from "./conversation-access";

const filterSchema = z.object({
  q: z.string().trim().max(200).default(""),
  agentId: z.string().trim().min(1).max(100).optional(),
  podId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().min(1).max(2000).optional(),
}).strict();
const cursorSchema = z.object({
  v: z.literal(1),
  at: z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/).refine(value => Number.isFinite(Date.parse(value))),
  id: z.string().min(1).max(100),
  scope: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
function cursorKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new AppError(503, "Conversation history is not configured.");
  return secret;
}
function sign(payload: string) { return createHmac("sha256", cursorKey()).update("conversation-index:" + payload).digest("base64url"); }
function decodeCursor(value: string, scope: string) {
  try {
    const parts = value.split(".");
    if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    if (Buffer.from(parts[0], "base64url").toString("base64url") !== parts[0] || Buffer.from(parts[1], "base64url").toString("base64url") !== parts[1]) throw new Error();
    const signature = Buffer.from(parts[1], "base64url"), expected = Buffer.from(sign(parts[0]), "base64url");
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error();
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")));
    if (cursor.scope !== scope) throw new Error();
    return cursor;
  } catch { throw new AppError(400, "This history page cursor is invalid. Start from the first page."); }
}
function encodeCursor(value: z.infer<typeof cursorSchema>) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return payload + "." + sign(payload);
}
export async function listConversationIndex(u: WorkspaceUser, value: unknown = {}): Promise<ConversationIndexPage> {
  const parsed = filterSchema.safeParse(value);
  if (!parsed.success) throw new AppError(400, "Use a title search up to 200 characters and a page size between 1 and 50.");
  const filters = parsed.data;
  await requireCurrentMembership(u);
  const scope = createHash("sha256").update(JSON.stringify([u.organizationId, u.userId, filters.q, filters.agentId || "", filters.podId || ""])).digest("hex");
  const cursor = filters.cursor ? decodeCursor(filters.cursor, scope) : undefined;
  const chat = alias(records, "history_chat"), pod = alias(records, "history_pod"), agent = alias(records, "history_agent");
  const podId = sql<string | null>`nullif(${chat.data}->>'podId','')`;
  const title = sql<string>`coalesce(${chat.data}->>'title','Untitled conversation')`;
  const agentId = sql<string>`coalesce(${chat.data}->>'agentId','xcelerate')`;
  // Preserve PostgreSQL microseconds in the cursor; Date serialization would truncate them.
  const exactUpdatedAt = sql<string>`to_char(${chat.updatedAt} at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const rows = await getDb().select({
    id: chat.id, title, agentId,
    agentName: sql<string | null>`${agent.data}->>'name'`,
    podId, podName: sql<string | null>`${pod.data}->>'name'`,
    updatedAt: exactUpdatedAt,
    messageCount: sql<number>`case when jsonb_typeof(${chat.data}->'messages')='array' then jsonb_array_length(${chat.data}->'messages') else 0 end`,
  }).from(chat)
    .innerJoin(member, and(eq(member.organizationId, chat.organizationId), eq(member.userId, u.userId)))
    .leftJoin(pod, and(eq(pod.organizationId, chat.organizationId), eq(pod.kind, "pod"), eq(pod.id, podId)))
    .leftJoin(agent, and(eq(agent.organizationId, chat.organizationId), eq(agent.kind, "agent"), eq(agent.id, agentId)))
    .where(and(eq(chat.organizationId, u.organizationId), eq(chat.createdBy, u.userId), eq(chat.kind, "chat"),
      or(sql`${podId} is null`, and(sql`${pod.id} is not null`, or(eq(pod.createdBy, u.userId), sql`${pod.data}->>'access'='organization'`))),
      filters.agentId ? eq(agentId, filters.agentId) : undefined,
      filters.podId ? eq(podId, filters.podId) : undefined,
      filters.q ? sql`${title} ilike ${"%" + filters.q.replace(/[\\%_]/g, "\\$&") + "%"}` : undefined,
      cursor ? sql`(${chat.updatedAt},${chat.id}) < (${cursor.at}::timestamptz,${cursor.id})` : undefined,
    )).orderBy(desc(chat.updatedAt), desc(chat.id)).limit(filters.limit + 1);
  await requireCurrentMembership(u);
  const page = rows.slice(0, filters.limit), last = page.at(-1);
  return {
    items: page.map(row => ({ id: row.id, title: row.title, agentId: row.agentId,
      agentName: row.agentName || builtinAgents.find(item => item.id === row.agentId)?.name || "Unavailable agent",
      ...(row.podId ? { podId: row.podId, podName: row.podName || "Untitled Pod" } : {}),
      updatedAt: row.updatedAt, messageCount: Number(row.messageCount) })),
    nextCursor: rows.length > filters.limit && last ? encodeCursor({ v: 1, at: last.updatedAt, id: last.id, scope }) : null,
  };
}
