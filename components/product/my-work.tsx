"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  FileText,
  ListTodo,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { ProductModal } from "./modal";
import {
  taskDateGroup,
  taskDueDay,
  type PersonalTask,
  type PersonalWorkSettings,
} from "@/lib/my-work";
import "./my-work.css";
type Data = {
  tasks: PersonalTask[];
  settings: PersonalWorkSettings | null;
  sources: { id: string; name: string }[];
  accountEmail: string;
};
async function request(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      value.error || "Could not complete this request. Please try again.",
    );
  return value;
}
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function displayDate(value: string) {
  return new Date(
    value.length === 10 ? `${value}T12:00:00` : value,
  ).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function MyWork() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"upcoming" | "overdue" | "completed">(
      "upcoming",
    ),
    [busy, setBusy] = useState<string>();
  const [editTask, setEditTask] = useState<PersonalTask | "new" | null>(null),
    [deleteTask, setDeleteTask] = useState<PersonalTask | null>(null),
    [sourceOpen, setSourceOpen] = useState(false);
  const [connectionId, setConnectionId] = useState(""),
    [ownerEmail, setOwnerEmail] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [title, setTitle] = useState(""),
    [notes, setNotes] = useState(""),
    [dueDate, setDueDate] = useState(""),
    [sourceUrl, setSourceUrl] = useState(""),
    [meeting, setMeeting] = useState("");
  const load = useCallback(async () => {
    const result: Data = await request("/api/my-work");
    setData(result);
    return result;
  }, []);
  useEffect(() => {
    void load()
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false));
  }, [load]);
  const groups = useMemo(() => {
    const result = {
      upcoming: [] as PersonalTask[],
      overdue: [] as PersonalTask[],
      completed: [] as PersonalTask[],
    };
    for (const task of data?.tasks || [])
      result[taskDateGroup(task, today())].push(task);
    for (const [key, tasks] of Object.entries(result))
      tasks.sort((a, b) =>
        key === "completed"
          ? b.updatedAt.localeCompare(a.updatedAt)
          : (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
            b.createdAt.localeCompare(a.createdAt),
      );
    return result;
  }, [data]);
  async function perform(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(undefined);
    }
  }
  function configure() {
    setConnectionId(data?.settings?.connectionId || data?.sources[0]?.id || "");
    setOwnerEmail(data?.settings?.ownerEmail || data?.accountEmail || "");
    setConfirmed(false);
    setError("");
    setSourceOpen(true);
  }
  function edit(task?: PersonalTask) {
    setEditTask(task || "new");
    setTitle(task?.title || "");
    setNotes(task?.notes || "");
    setDueDate(task?.dueDate ? taskDueDay(task.dueDate) : "");
    setSourceUrl(task?.source.url || "");
    setMeeting(task?.source.meeting || "");
    setError("");
  }
  async function sync() {
    await perform("sync", async () => {
      const result = await request("/api/my-work/sync", {});
      setNotice(
        `${result.imported} matching ${result.imported === 1 ? "task" : "tasks"} imported${result.partial ? ". This import is partial: only the first 250 source items were checked" : ""}.${result.skipped ? ` ${result.skipped} unmatched or unsupported items were skipped.` : ""} Completion changes stay in AIX.`,
      );
    });
  }
  const sourceName = data?.sources.find(
    (source) => source.id === data.settings?.connectionId,
  )?.name;
  return (
    <div className="my-work-v2">
      <header className="my-work-v2-heading">
        <div>
          <h1>My work</h1>
          <p>Your follow-ups from meetings and the tasks you add yourself.</p>
        </div>
        <button className="my-work-v2-primary" onClick={() => edit()}>
          <Plus size={16} />
          Add task
        </button>
      </header>
      {error && (
        <div role="alert" className="my-work-v2-error">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="my-work-v2-notice">
          <Check size={16} />
          {notice}
        </div>
      )}
      <section className="my-work-v2-source">
        <span className="my-work-v2-source-icon">
          <FileText size={20} />
        </span>
        <div>
          <h2>
            {data?.settings
              ? "Meeting follow-ups from Scribe"
              : "Bring your meeting follow-ups here"}
          </h2>
          <p>
            {data?.settings ? (
              <>
                Owner: <strong>{data.settings.ownerEmail}</strong>
                {sourceName ? ` · ${sourceName}` : " · Connection unavailable"}
              </>
            ) : (
              "Connect your own Scribe owner identity to import only tasks assigned to you."
            )}
          </p>
          {data?.settings && (
            <small>
              {data.settings.lastSyncAt
                ? `Last imported ${new Date(data.settings.lastSyncAt).toLocaleString()}${data.settings.lastSyncPartial ? " · Partial import" : ""}`
                : "Not imported yet"}{" "}
              · Owner confirmed by you
            </small>
          )}
        </div>
        <div className="my-work-v2-source-actions">
          {data?.settings && (
            <button
              onClick={configure}
              disabled={!!busy}
              aria-label="Configure Scribe identity"
            >
              <Settings2 size={16} />
            </button>
          )}
          <button
            disabled={!!busy || loading}
            onClick={() => (data?.settings ? void sync() : configure())}
          >
            {busy === "sync" ? (
              <Loader2 size={15} className="my-work-v2-spin" />
            ) : (
              <RefreshCw size={15} />
            )}{" "}
            {data?.settings ? "Import from Scribe" : "Set up import"}
          </button>
        </div>
      </section>
      <div className="my-work-v2-tabs" role="tablist" aria-label="Task status">
        {(["upcoming", "overdue", "completed"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
          >
            {key === "upcoming"
              ? "Upcoming"
              : key === "overdue"
                ? "Overdue"
                : "Completed"}
            <span>{groups[key].length}</span>
          </button>
        ))}
      </div>
      <div
        className="my-work-v2-list"
        role="tabpanel"
        aria-label={`${filter} tasks`}
      >
        {loading ? (
          <div className="my-work-v2-empty" role="status">
            <Loader2 className="my-work-v2-spin" />
            Loading your tasks…
          </div>
        ) : !groups[filter].length ? (
          <div className="my-work-v2-empty">
            <span>
              <ListTodo size={25} />
            </span>
            <h2>
              {filter === "completed"
                ? "Your finished work will appear here"
                : filter === "overdue"
                  ? "You’re up to date"
                  : "Make room for your next follow-up"}
            </h2>
            <p>
              {filter === "completed"
                ? "Check off a task when you finish it. Its completion is saved privately in AIX."
                : filter === "overdue"
                  ? "There are no open tasks with a past due date."
                  : "Add a task or import your own Scribe assignments to keep the next step in view."}
            </p>
            {filter === "upcoming" && (
              <button onClick={() => edit()}>
                <Plus size={15} />
                Add your first task
              </button>
            )}
          </div>
        ) : (
          groups[filter].map((task) => (
            <article
              key={task.id}
              className={`my-work-v2-task ${task.status === "completed" ? "is-completed" : ""}`}
            >
              <button
                className="my-work-v2-check"
                aria-label={`${task.status === "completed" ? "Reopen" : "Complete"} ${task.title}`}
                disabled={!!busy}
                onClick={() =>
                  void perform(task.id, async () => {
                    await request("/api/my-work", {
                      action: "update",
                      id: task.id,
                      status:
                        task.status === "completed" ? "open" : "completed",
                    });
                  })
                }
              >
                {busy === task.id ? (
                  <Loader2 size={14} className="my-work-v2-spin" />
                ) : task.status === "completed" ? (
                  <Check size={14} />
                ) : null}
              </button>
              <div className="my-work-v2-task-main">
                <button
                  className="my-work-v2-task-title"
                  onClick={() => edit(task)}
                >
                  {task.title}
                </button>
                <div className="my-work-v2-task-meta">
                  <span>
                    {task.source.kind === "scribe"
                      ? "Scribe meeting"
                      : task.source.meeting || "Personal task"}
                  </span>
                  {task.source.meetingId && (
                    <span title={task.source.meetingId}>
                      Meeting {task.source.meetingId.slice(0, 8)}
                    </span>
                  )}
                  {task.source.url && (
                    <a href={task.source.url} target="_blank" rel="noreferrer">
                      Source
                      <ExternalLink size={11} />
                    </a>
                  )}
                  {task.source.kind === "scribe" &&
                    task.status !== task.source.upstreamStatus && (
                      <span>Completion differs from Scribe</span>
                    )}
                </div>
                {task.notes && (
                  <p className="my-work-v2-task-notes">{task.notes}</p>
                )}
              </div>
              {task.dueDate && (
                <span
                  className={`my-work-v2-date ${filter === "overdue" ? "is-overdue" : ""}`}
                >
                  {filter === "overdue" ? "Due " : ""}
                  {displayDate(task.dueDate)}
                </span>
              )}
              <button
                className="my-work-v2-delete"
                aria-label={`Delete ${task.title}`}
                disabled={!!busy}
                onClick={() => setDeleteTask(task)}
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))
        )}
      </div>
      <p className="my-work-v2-private">
        <LockKeyhole size={13} />
        Only you can see these tasks in this organization. Imported completion
        changes are saved here; Scribe is never updated.
      </p>
      {sourceOpen && (
        <ProductModal
          title="Import your Scribe follow-ups"
          onClose={() => !busy && setSourceOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void perform("settings", async () => {
                await request("/api/my-work", {
                  action: "settings",
                  connectionId,
                  ownerEmail,
                  confirmed,
                });
                setSourceOpen(false);
                setNotice(
                  "Scribe identity saved. Choose Import from Scribe to load your assignments.",
                );
              });
            }}
          >
            <p className="my-work-v2-helper">
              Choose the connected source and enter the email Scribe uses for
              your assignments. This mapping is confirmed by you; AIX cannot
              independently verify your identity in Scribe.
            </p>
            {error && (
              <p role="alert" className="my-work-v2-error">
                {error}
              </p>
            )}
            <label>
              Scribe connection
              <select
                required
                value={connectionId}
                onChange={(event) => {
                  setConnectionId(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">Choose a connection</option>
                {data?.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            {!data?.sources.length && (
              <p className="my-work-v2-helper">
                No enabled Scribe connection is available. Ask your organization
                administrator to add it in Connections.
              </p>
            )}
            <label>
              Your Scribe owner email
              <input
                required
                type="email"
                maxLength={254}
                value={ownerEmail}
                onChange={(event) => {
                  setOwnerEmail(event.target.value);
                  setConfirmed(false);
                }}
                placeholder="you@company.com"
              />
            </label>
            <label className="my-work-v2-confirm">
              <input
                required
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                I confirm this is my own owner email in Scribe. Import only
                assignments matching this exact email.
              </span>
            </label>
            <p className="my-work-v2-helper">
              Each import checks up to 250 source items. It reads action items
              only and never changes your meetings or Scribe tasks.
            </p>
            <footer>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setSourceOpen(false)}
              >
                Cancel
              </button>
              <button
                className="my-work-v2-primary"
                disabled={!!busy || !confirmed || !connectionId}
              >
                Save identity
              </button>
            </footer>
          </form>
        </ProductModal>
      )}
      {editTask && (
        <ProductModal
          title={editTask === "new" ? "Add a personal task" : "Task details"}
          onClose={() => !busy && setEditTask(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              // Read the submitted control as well as keeping React state in sync.
              // Native date controls can commit their final value at submit time.
              const submittedDueDate = String(new FormData(event.currentTarget).get("dueDate") || "");
              void perform("task", async () => {
                await request(
                  "/api/my-work",
                  editTask === "new"
                    ? {
                        action: "create",
                        title,
                        notes,
                        dueDate: submittedDueDate || null,
                        sourceUrl: sourceUrl || undefined,
                        meeting: meeting || undefined,
                      }
                    : {
                        action: "update",
                        id: editTask.id,
                        title,
                        notes,
                        dueDate: submittedDueDate || null,
                      },
                );
                setEditTask(null);
              });
            }}
          >
            <label>
              Task
              <input
                autoFocus
                required
                maxLength={500}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                name="dueDate"
                value={dueDate}
                onInput={(event) => setDueDate(event.currentTarget.value)}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
            <label>
              Notes
              <textarea
                maxLength={5000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Any context you want to keep with this task"
              />
            </label>
            {editTask === "new" ? (
              <>
                <label>
                  Meeting or source name <small>Optional</small>
                  <input
                    maxLength={200}
                    value={meeting}
                    onChange={(event) => setMeeting(event.target.value)}
                  />
                </label>
                <label>
                  Source link <small>Optional</small>
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://…"
                  />
                </label>
              </>
            ) : (
              editTask.source.kind === "scribe" && (
                <p className="my-work-v2-helper">
                  Imported from Scribe for {editTask.source.ownerEmail}. Source
                  status: {editTask.source.upstreamStatus}. Your completion and
                  notes stay local; imported titles and dates may refresh on
                  import.
                </p>
              )
            )}
            {error && (
              <p role="alert" className="my-work-v2-error">
                {error}
              </p>
            )}
            <footer>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => setEditTask(null)}
              >
                Cancel
              </button>
              <button className="my-work-v2-primary" disabled={!!busy}>
                {busy === "task" ? "Saving…" : "Save task"}
              </button>
            </footer>
          </form>
        </ProductModal>
      )}
      {deleteTask && (
        <ProductModal
          title="Delete personal task?"
          onClose={() => !busy && setDeleteTask(null)}
        >
          <p className="my-work-v2-helper">
            Remove “{deleteTask.title}” from My work?
            {deleteTask.source.kind === "scribe"
              ? " The source item stays in Scribe and may appear again on your next import."
              : ""}
          </p>
          <footer>
            <button disabled={!!busy} onClick={() => setDeleteTask(null)}>
              Cancel
            </button>
            <button
              className="my-work-v2-danger"
              disabled={!!busy}
              onClick={() =>
                void perform("delete", async () => {
                  await request("/api/my-work", {
                    action: "delete",
                    id: deleteTask.id,
                  });
                  setDeleteTask(null);
                })
              }
            >
              Delete task
            </button>
          </footer>
        </ProductModal>
      )}
    </div>
  );
}
