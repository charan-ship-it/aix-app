import { z } from "zod";
export const ownerEmailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
export const dueDateSchema = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })])
  .nullable()
  .optional();
export const personalTaskFields = z.object({
  title: z.string().trim().min(1).max(500),
  notes: z.string().max(5000).default(""),
  dueDate: dueDateSchema,
  sourceUrl: z
    .string()
    .url()
    .max(2000)
    .optional()
    .refine(
      (value) => !value || /^https?:\/\//i.test(value),
      "Use an HTTP or HTTPS link.",
    ),
  meeting: z.string().trim().max(200).optional(),
});
export type PersonalTask = {
  id: string;
  title: string;
  notes: string;
  status: "open" | "completed";
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  localStatusOverride?: boolean;
  source: {
    kind: "manual" | "scribe";
    connectionId?: string;
    itemId?: string;
    meetingId?: string;
    meeting?: string;
    url?: string;
    ownerEmail?: string;
    upstreamStatus?: "open" | "completed";
    importedAt?: string;
  };
};
export type PersonalWorkSettings = {
  id: string;
  connectionId: string;
  ownerEmail: string;
  ownerConfirmedAt: string;
  lastSyncAt?: string;
  lastSyncPartial?: boolean;
  lastSyncCount?: number;
};
export type ImportedActionItem = {
  id: string;
  title: string;
  ownerEmail: string;
  meetingId?: string;
  dueDate?: string;
  status: "open" | "completed";
};
export function parseScribePage(result: unknown, ownerEmail: string) {
  const envelope = z
    .object({
      isError: z.boolean().optional(),
      structuredContent: z.unknown().optional(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    })
    .safeParse(result);
  if (!envelope.success || envelope.data.isError)
    throw new Error(
      "Scribe could not return action items. Check the connection and try again.",
    );
  let value = envelope.data.structuredContent;
  if (value === undefined) {
    const text = envelope.data.content?.find(
      (part) => part.type === "text" && part.text,
    )?.text;
    if (!text || text.length > 1500000)
      throw new Error(
        "Scribe returned an unsupported action-item response. No tasks were imported.",
      );
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(
        "Scribe returned an unsupported action-item response. No tasks were imported.",
      );
    }
  }
  const page = z
    .object({
      items: z.array(z.unknown()).max(50),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      page_size: z.number().int().positive().max(50),
    })
    .safeParse(value);
  if (!page.success)
    throw new Error(
      "Scribe’s action-item format changed. No tasks were imported; reconnect or try again later.",
    );
  const expected = ownerEmailSchema.parse(ownerEmail);
  const items: ImportedActionItem[] = [];
  let skipped = 0;
  for (const entry of page.data.items) {
    const parsed = z
      .object({
        id: z.string().min(1).max(200),
        task: z.string().trim().min(1).max(500),
        owner_email: ownerEmailSchema,
        meeting_id: z.string().max(200).nullable().optional(),
        due_date: z.string().max(100).nullable().optional(),
        status: z.enum(["open", "completed"]),
      })
      .safeParse(entry);
    // The vendor filter is a substring search. Local exact matching is the privacy boundary.
    if (!parsed.success || parsed.data.owner_email !== expected) {
      skipped++;
      continue;
    }
    const source = parsed.data;
    const date = dueDateSchema.safeParse(source.due_date || undefined);
    items.push({
      id: source.id,
      title: source.task,
      ownerEmail: source.owner_email,
      meetingId: source.meeting_id || undefined,
      status: source.status,
      dueDate: date.success ? date.data || undefined : undefined,
    });
  }
  return {
    items,
    skipped,
    total: page.data.total,
    page: page.data.page,
    pageSize: page.data.page_size,
    received: page.data.items.length,
  };
}
export function mergeImportedTask(
  existing: PersonalTask | undefined,
  source: ImportedActionItem,
  id: string,
  connectionId: string,
  now: string,
): PersonalTask {
  const localStatusOverride =
    existing?.localStatusOverride === true ||
    (existing?.localStatusOverride === undefined &&
      !!existing?.source.upstreamStatus &&
      existing.status !== existing.source.upstreamStatus);
  const status =
    existing && localStatusOverride ? existing.status : source.status;
  return {
    id,
    title: source.title,
    notes: existing?.notes || "",
    status,
    localStatusOverride,
    dueDate: source.dueDate,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    completedAt: status === "completed" ? existing?.completedAt || now : null,
    source: {
      kind: "scribe",
      connectionId,
      itemId: source.id,
      meetingId: source.meetingId,
      ownerEmail: source.ownerEmail,
      upstreamStatus: source.status,
      importedAt: now,
    },
  };
}
export function taskDueDay(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function taskDateGroup(task: PersonalTask, today: string) {
  if (task.status === "completed") return "completed";
  return task.dueDate && taskDueDay(task.dueDate) < today
    ? "overdue"
    : "upcoming";
}
