import { test, after } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { user, organization, records } from "../db/schema";
import {
  parseScribePage,
  mergeImportedTask,
  taskDateGroup,
  type PersonalTask,
} from "../lib/my-work";
import {
  collectScribeItems,
  importedTaskId,
  listPersonalTasks,
  workSettings,
  personalWhere,
} from "../lib/server/my-work";
import type { WorkspaceUser } from "../lib/server/http";
try {
  process.loadEnvFile();
} catch {}
const owner = "alex@example.invalid";
const item = (id: string, email = owner) => ({
  id,
  task: "Fixture task",
  owner_email: email,
  meeting_id: "fixture-meeting",
  due_date: "2026-10-30",
  status: "open",
});
const envelope = (
  items: unknown[],
  page = 1,
  total = items.length,
  page_size = 50,
) => ({
  isError: false,
  content: [
    { type: "text", text: JSON.stringify({ items, total, page, page_size }) },
  ],
});
test("Scribe substring matches never import another owner’s assignment", () => {
  const result = parseScribePage(
    envelope([
      item("own", "  ALEX@EXAMPLE.INVALID  "),
      item("suffix", "not-alex@example.invalid"),
      item("subdomain", "alex@example.invalid.evil"),
      { ...item("missing"), owner_email: undefined },
      { ...item("name-only"), owner_email: "Alex" },
    ]),
    owner,
  );
  assert.deepEqual(
    result.items.map((value) => value.id),
    ["own"],
  );
  assert.equal(result.skipped, 4);
});
test("unsupported or error Scribe responses fail closed without reflecting source content", () => {
  for (const response of [
    {
      isError: true,
      content: [{ type: "text", text: "private upstream error" }],
    },
    { content: [{ type: "text", text: "private non-json response" }] },
    { structuredContent: { action_items: [item("x")] } },
  ])
    assert.throws(
      () => parseScribePage(response, owner),
      (error) => error instanceof Error && !error.message.includes("private"),
    );
  assert.equal(parseScribePage(envelope([]), owner).items.length, 0);
});
test("imports preserve local completion and notes while retaining upstream provenance", () => {
  const source = parseScribePage(envelope([item("same")]), owner).items[0];
  const existing: PersonalTask = {
    id: "stable",
    title: "Previous",
    notes: "Private notes",
    status: "completed",
    dueDate: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    completedAt: "2026-10-02T00:00:00Z",
    localStatusOverride: true,
    source: { kind: "scribe" },
  };
  const merged = mergeImportedTask(
    existing,
    source,
    "stable",
    "source",
    "2026-10-27T00:00:00Z",
  );
  assert.equal(merged.status, "completed");
  assert.equal(merged.notes, existing.notes);
  assert.equal(merged.completedAt, existing.completedAt);
  assert.equal(merged.source.upstreamStatus, "open");
  assert.equal(merged.source.ownerEmail, owner);
});
test("stable import identities isolate source connections, organizations, users and task IDs", () => {
  const user = { organizationId: "a", userId: "one" };
  const key = importedTaskId(user, "source", "task");
  assert.equal(importedTaskId(user, "source", "task"), key);
  for (const other of [
    importedTaskId({ ...user, userId: "two" }, "source", "task"),
    importedTaskId({ ...user, organizationId: "b" }, "source", "task"),
    importedTaskId(user, "other-source", "task"),
    importedTaskId(user, "source", "other-task"),
  ])
    assert.notEqual(other, key);
});
test("Scribe imports cap at five pages, expose partial coverage and pass exact owner filter", async () => {
  const calls: unknown[] = [];
  const result = await collectScribeItems(owner, async (input) => {
    calls.push(input);
    return envelope(
      Array.from({ length: 50 }, (_, index) => item(`${input.page}-${index}`)),
      input.page,
      1000,
    );
  });
  assert.equal(calls.length, 5);
  assert.equal(result.collected.size, 250);
  assert.equal(result.partial, true);
  assert.deepEqual(calls[0], { owner_email: owner, page: 1, page_size: 50 });
  await assert.rejects(
    collectScribeItems(owner, async () => envelope([item("x")], 2)),
    /inconsistent pagination/,
  );
});
test("repeated vendor pages are rejected and invalid due dates never become deadlines", async () => {
  await assert.rejects(
    collectScribeItems(owner, async (input) =>
      envelope(
        Array.from({ length: 50 }, (_, index) => item(String(index))),
        input.page,
        100,
      ),
    ),
    /repeated a page/,
  );
  assert.equal(
    parseScribePage(
      envelope([{ ...item("x"), due_date: "next week sometime" }]),
      owner,
    ).items[0].dueDate,
    undefined,
  );
  const task = mergeImportedTask(
    undefined,
    parseScribePage(envelope([item("x")]), owner).items[0],
    "x",
    "source",
    "2026-10-27T00:00:00Z",
  );
  assert.equal(taskDateGroup(task, "2026-10-31"), "overdue");
  assert.equal(
    taskDateGroup({ ...task, status: "completed" }, "2026-10-31"),
    "completed",
  );
});
test("personal tasks and saved Scribe mappings stay private within and across organizations", async () => {
  const db = getDb(),
    suffix = crypto.randomUUID(),
    orgA = "mywork-a-" + suffix,
    orgB = "mywork-b-" + suffix,
    userA = "mywork-user-a-" + suffix,
    userB = "mywork-user-b-" + suffix;
  const person = (organizationId: string, userId: string) =>
    ({ organizationId, userId }) as WorkspaceUser;
  await db.insert(user).values([
    { id: userA, name: "Fixture A", email: userA + "@example.invalid" },
    { id: userB, name: "Fixture B", email: userB + "@example.invalid" },
  ]);
  try {
    await db.insert(organization).values([
      { id: orgA, slug: orgA, name: "Fixture A" },
      { id: orgB, slug: orgB, name: "Fixture B" },
    ]);
    const taskId = crypto.randomUUID(),
      settingId = "personal-work-settings:" + userA;
    await db.insert(records).values([
      {
        organizationId: orgA,
        createdBy: userA,
        id: taskId,
        kind: "personal-task",
        data: { id: taskId, title: "Private fixture" },
      },
      {
        organizationId: orgA,
        createdBy: userA,
        id: settingId,
        kind: "personal-work-settings",
        data: { id: settingId, ownerEmail: owner },
      },
    ]);
    assert.equal((await listPersonalTasks(person(orgA, userA))).length, 1);
    assert.equal((await listPersonalTasks(person(orgA, userB))).length, 0);
    assert.equal((await listPersonalTasks(person(orgB, userA))).length, 0);
    assert.equal((await workSettings(person(orgA, userA)))?.ownerEmail, owner);
    assert.equal(await workSettings(person(orgA, userB)), undefined);
    const unauthorized = await db
      .update(records)
      .set({ data: { id: taskId, title: "Forbidden change" } })
      .where(personalWhere(person(orgA, userB), "personal-task", taskId))
      .returning();
    assert.equal(unauthorized.length, 0);
    const [unchanged] = await db
      .select()
      .from(records)
      .where(and(eq(records.organizationId, orgA), eq(records.id, taskId)));
    assert.equal(
      (unchanged.data as { title: string }).title,
      "Private fixture",
    );
  } finally {
    await db.delete(organization).where(eq(organization.id, orgA));
    await db.delete(organization).where(eq(organization.id, orgB));
    await db.delete(user).where(eq(user.id, userA));
    await db.delete(user).where(eq(user.id, userB));
  }
});
after(async () => {
  await getSql().end();
});

test("upstream completion changes refresh untouched tasks while local completion and reopen win", () => {
  const source = parseScribePage(envelope([item("source")]), owner).items[0];
  const initial = mergeImportedTask(
    undefined,
    source,
    "stable",
    "source",
    "2026-10-27T00:00:00Z",
  );
  const upstreamCompleted = { ...source, status: "completed" as const };
  const refreshed = mergeImportedTask(
    initial,
    upstreamCompleted,
    "stable",
    "source",
    "2026-10-28T00:00:00Z",
  );
  assert.equal(refreshed.status, "completed");
  assert.equal(refreshed.localStatusOverride, false);
  const reopened = mergeImportedTask(
    { ...refreshed, status: "open", localStatusOverride: true },
    upstreamCompleted,
    "stable",
    "source",
    "2026-10-29T00:00:00Z",
  );
  assert.equal(reopened.status, "open");
  assert.equal(reopened.completedAt, null);
  const localCompleted = mergeImportedTask(
    { ...initial, status: "completed", localStatusOverride: true },
    source,
    "stable",
    "source",
    "2026-10-29T00:00:00Z",
  );
  assert.equal(localCompleted.status, "completed");
  assert.equal(localCompleted.source.upstreamStatus, "open");
});
test("timestamp deadlines use browser local calendar day while date-only deadlines remain literal", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    const task = {
      id: "fixture",
      status: "open",
      dueDate: "2026-10-28T00:30:00Z",
    } as PersonalTask;
    assert.equal(taskDateGroup(task, "2026-10-28"), "overdue");
    assert.equal(
      taskDateGroup({ ...task, dueDate: "2026-10-28" }, "2026-10-28"),
      "upcoming",
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
