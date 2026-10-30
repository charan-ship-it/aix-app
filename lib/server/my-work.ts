import { createHash } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { records } from "@/db/schema";
import type { WorkspaceUser } from "./http";
import { AppError } from "./http";
import { mcpConnectionSchema } from "@/lib/mcp";
import { openStoredMCP } from "./mcp";
import { withLock } from "./redis";
import {
  parseScribePage,
  mergeImportedTask,
  type PersonalTask,
  type PersonalWorkSettings,
} from "@/lib/my-work";
export const personalWhere = (u: WorkspaceUser, kind: string, id?: string) =>
  and(
    eq(records.organizationId, u.organizationId),
    eq(records.createdBy, u.userId),
    eq(records.kind, kind),
    id ? eq(records.id, id) : undefined,
  );
export const settingsId = (u: WorkspaceUser) =>
  "personal-work-settings:" + u.userId;
export async function workSettings(u: WorkspaceUser) {
  const [row] = await getDb()
    .select()
    .from(records)
    .where(personalWhere(u, "personal-work-settings", settingsId(u)))
    .limit(1);
  return row?.data as PersonalWorkSettings | undefined;
}
export async function listPersonalTasks(u: WorkspaceUser) {
  const rows = await getDb()
    .select()
    .from(records)
    .where(personalWhere(u, "personal-task"))
    .orderBy(desc(records.updatedAt));
  return rows.map((row) => row.data as PersonalTask);
}
export async function scribeSources(u: WorkspaceUser) {
  const rows = await getDb()
    .select()
    .from(records)
    .where(
      and(
        eq(records.organizationId, u.organizationId),
        eq(records.kind, "mcp-connection"),
      ),
    );
  return rows.flatMap((row) => {
    const parsed = mcpConnectionSchema.safeParse(row.data);
    return parsed.success &&
      parsed.data.enabled &&
      /scribe/i.test(parsed.data.name + " " + new URL(parsed.data.url).hostname)
      ? [{ id: parsed.data.id, name: parsed.data.name }]
      : [];
  });
}
export function importedTaskId(
  u: Pick<WorkspaceUser, "organizationId" | "userId">,
  connectionId: string,
  itemId: string,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify([u.organizationId, u.userId, connectionId, itemId]))
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export async function collectScribeItems(
  ownerEmail: string,
  fetchPage: (input: {
    owner_email: string;
    page: number;
    page_size: number;
  }) => Promise<unknown>,
) {
  const collected = new Map<
    string,
    ReturnType<typeof parseScribePage>["items"][number]
  >();
  let partial = false,
    skipped = 0,
    pages = 0;
  const seenPages = new Set<string>();
  for (let pageNumber = 1; pageNumber <= 5; pageNumber++) {
    const result = await fetchPage({
      owner_email: ownerEmail,
      page: pageNumber,
      page_size: 50,
    });
    let page: ReturnType<typeof parseScribePage>;
    try {
      page = parseScribePage(result, ownerEmail);
    } catch (error) {
      throw new AppError(
        502,
        error instanceof Error
          ? error.message
          : "Scribe returned an unsupported response.",
      );
    }
    if (page.page !== pageNumber)
      throw new AppError(
        502,
        "Scribe returned inconsistent pagination. No tasks were imported.",
      );
    const fingerprint = page.items.map((item) => item.id).join("\0");
    if (fingerprint && seenPages.has(fingerprint))
      throw new AppError(
        502,
        "Scribe repeated a page. No tasks were imported.",
      );
    seenPages.add(fingerprint);
    pages++;
    skipped += page.skipped;
    page.items.forEach((item) => collected.set(item.id, item));
    if (
      page.received < page.pageSize ||
      pageNumber * page.pageSize >= page.total
    )
      break;
    if (pageNumber === 5) partial = true;
  }
  return { collected, partial, skipped, pages };
}
export async function syncScribe(u: WorkspaceUser) {
  return withLock(
    "personal-work-sync:" + u.organizationId + ":" + u.userId,
    async () => {
      const settings = await workSettings(u);
      if (!settings?.ownerConfirmedAt)
        throw new AppError(
          409,
          "Confirm your Scribe owner email before importing tasks.",
        );
      if (
        !(await scribeSources(u)).some(
          (source) => source.id === settings.connectionId,
        )
      )
        throw new AppError(409, "Select an enabled Scribe connection first.");
      const connection = await openStoredMCP(
        u.organizationId,
        settings.connectionId,
      );
      let fetched: Awaited<ReturnType<typeof collectScribeItems>>;
      try {
        const listed = await connection.client.listTools({
          options: { timeout: 20000 },
        });
        const definition = listed.tools.find(
          (tool) => tool.name === "get_action_items",
        );
        if (!definition)
          throw new AppError(
            409,
            "This Scribe connection does not expose get_action_items. No tasks were imported.",
          );
        const tools = connection.client.toolsFromDefinitions({
          ...listed,
          tools: [definition],
        });
        const action = tools.get_action_items;
        if (!action?.execute)
          throw new AppError(409, "Scribe action items are unavailable.");
        fetched = await collectScribeItems(
          settings.ownerEmail,
          (input) =>
            action.execute!(input, {
              toolCallId: crypto.randomUUID(),
              messages: [],
              abortSignal: AbortSignal.timeout(20000),
            }) as Promise<unknown>,
        );
      } finally {
        await connection.close().catch(() => {});
      }
      const { collected, partial, skipped, pages } = fetched;
      const now = new Date().toISOString();
      await getDb().transaction(async (tx) => {
        // Settings may have changed while a remote page was loading. Never import under a stale identity mapping.
        const [current] = await tx
          .select()
          .from(records)
          .where(personalWhere(u, "personal-work-settings", settings.id))
          .for("update")
          .limit(1);
        const saved = current?.data as PersonalWorkSettings | undefined;
        if (
          !saved ||
          saved.connectionId !== settings.connectionId ||
          saved.ownerEmail !== settings.ownerEmail
        )
          throw new AppError(
            409,
            "Your Scribe identity changed. Import again with the saved settings.",
          );
        for (const source of collected.values()) {
          const id = importedTaskId(u, settings.connectionId, source.id);
          const [row] = await tx
            .select()
            .from(records)
            .where(personalWhere(u, "personal-task", id))
            .for("update")
            .limit(1);
          const task = mergeImportedTask(
            row?.data as PersonalTask | undefined,
            source,
            id,
            settings.connectionId,
            now,
          );
          await tx
            .insert(records)
            .values({
              organizationId: u.organizationId,
              createdBy: u.userId,
              id,
              kind: "personal-task",
              data: task,
            })
            .onConflictDoUpdate({
              target: [records.organizationId, records.id],
              set: { data: task, updatedAt: new Date() },
            });
        }
        await tx
          .update(records)
          .set({
            data: {
              ...saved,
              lastSyncAt: now,
              lastSyncCount: collected.size,
              lastSyncPartial: partial,
            },
            updatedAt: new Date(),
          })
          .where(personalWhere(u, "personal-work-settings", settings.id));
      });
      return {
        imported: collected.size,
        skipped,
        partial,
        pages,
        syncedAt: now,
      };
    },
  );
}
