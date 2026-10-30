"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ListTodo,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { AgentConfig } from "@/lib/agent-config";
import type { EmployeeTask } from "@/lib/employee-tasks";
import "./pod-tasks.css";

type Props = {
  podId: string;
  agents: AgentConfig[];
  onConversation: (chatId: string) => void;
  onChange?: () => void;
};
type Filter = "open" | "completed" | "all";
const activeRun = (task: EmployeeTask) =>
  ["queued", "running", "awaiting_approval"].includes(task.runStatus || "");
function runLabel(task: EmployeeTask) {
  if (task.status === "done") return "Completed";
  switch (task.runStatus) {
    case "queued":
      return "Queued";
    case "running":
      return "Working";
    case "awaiting_approval":
      return "Needs approval";
    case "completed":
      return "Run finished";
    case "failed":
      return "Run failed";
    case "cancelled":
      return "Run stopped";
    default:
      return "Ready to start";
  }
}

export function PodTasks({ podId, agents, onConversation, onChange }: Props) {
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [startingId, setStartingId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [instructions, setInstructions] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const endpoint = "/api/pods/" + encodeURIComponent(podId) + "/tasks";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setTasks([]);
    setStartingId(null);
    setError("");
    async function load(initial = false) {
      try {
        const r = await fetch(endpoint, { signal: controller.signal });
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "Could not load tasks.");
        if (!cancelled) setTasks(data.items);
      } catch (e) {
        if (!cancelled && (initial || (e as Error).name !== "AbortError"))
          setError((e as Error).message || "Could not load tasks.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load(true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [endpoint, refreshToken]);

  async function mutate(
    action: "create" | "complete" | "reopen" | "run",
    task?: EmployeeTask,
  ) {
    if (busy) return;
    setBusy(task?.id || "create");
    setError("");
    try {
      const payload =
        action === "create"
          ? {
              action,
              title: title.trim(),
              prompt: prompt.trim() || title.trim(),
            }
          : action === "run"
            ? {
                action,
                id: task!.id,
                agentId: selectedAgent,
                instructions: instructions.trim(),
              }
            : { action, id: task!.id };
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not update this task.");
      if (data.item)
        setTasks((current) =>
          action === "create"
            ? [data.item, ...current]
            : current.map((t) =>
                t.id === data.item.id
                  ? {
                      ...data.item,
                      ...(action === "run" ? { runStatus: "queued" } : {}),
                    }
                  : t,
              ),
        );
      if (action === "create") {
        setTitle("");
        setPrompt("");
        setExpanded(false);
        setFilter("open");
        setSearch("");
      }
      if (action === "run") {
        setStartingId(null);
        setInstructions("");
      }
      onChange?.();
      if (action === "run" && data.chatId) onConversation(data.chatId);
    } catch (e) {
      setError(
        (e as Error).message || "Could not update this task. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }
  function start(task: EmployeeTask) {
    setStartingId(task.id);
    setSelectedAgent(
      agents.some((a) => a.id === task.agentId)
        ? task.agentId
        : task.chatId
          ? ""
          : agents[0]?.id || "",
    );
    setInstructions("");
    setError("");
  }
  const visible = tasks.filter(
    (t) =>
      (filter === "all" ||
        (filter === "completed" ? t.status === "done" : t.status !== "done")) &&
      (
        t.title +
        " " +
        t.prompt +
        " " +
        (agents.find((a) => a.id === t.agentId)?.name || "")
      )
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const openCount = tasks.filter((t) => t.status !== "done").length;

  return (
    <section className="task-v2" aria-label="Pod tasks">
      <div className="task-v2-heading">
        <div>
          <h1>Tasks</h1>
          <p>Define the outcome. Choose an agent when you're ready to start.</p>
        </div>
        <span>{openCount} open</span>
      </div>
      <form
        className="task-v2-create"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) mutate("create");
        }}
      >
        <div className="task-v2-quick">
          <Plus size={17} aria-hidden="true" />
          <input
            aria-label="New task title"
            placeholder="Add a task…"
            value={title}
            maxLength={120}
            disabled={!!busy || loading}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            className="task-v2-detail-toggle"
            aria-expanded={expanded}
            aria-controls="task-v2-new-details"
            disabled={!!busy}
            onClick={() => setExpanded(!expanded)}
          >
            Details <ChevronDown size={13} />
          </button>
          <button
            className="task-v2-add"
            disabled={!!busy || loading || !title.trim()}
            type="submit"
          >
            {busy === "create" ? (
              <Loader2 className="task-v2-spin" size={14} />
            ) : (
              <Plus size={14} />
            )}
            Add task
          </button>
        </div>
        {expanded && (
          <div className="task-v2-create-details" id="task-v2-new-details">
            <label>
              Instructions <span>Optional</span>
              <textarea
                value={prompt}
                maxLength={20000}
                disabled={!!busy}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the context, expected result, and what done looks like."
              />
            </label>
            <p>
              If left blank, the task title becomes the instructions. Creating a
              task does not run it.
            </p>
          </div>
        )}
      </form>
      <div className="task-v2-toolbar">
        <div className="task-v2-filters" role="group" aria-label="Task status">
          {(["open", "completed", "all"] as const).map((f) => (
            <button
              type="button"
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <label className="task-v2-search">
          <Search size={14} />
          <input
            aria-label="Search tasks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks"
          />
        </label>
      </div>
      {error && (
        <div className="task-v2-error" role="alert">
          <div>
            <strong>Something needs attention</strong>
            <p>{error}</p>
            {/connect|model|provider|api key/i.test(error) && (
              <a href="/settings">
                Open model settings <ArrowRight size={12} />
              </a>
            )}
          </div>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => setRefreshToken((t) => t + 1)}
          >
            Retry loading
          </button>
        </div>
      )}
      {loading ? (
        <div className="task-v2-empty" role="status">
          <Loader2 size={20} className="task-v2-spin" />
          <p>Loading tasks…</p>
        </div>
      ) : (
        <div className="task-v2-list">
          {visible.map((task) => {
            const working = activeRun(task),
              done = task.status === "done",
              currentAgent = agents.find((a) => a.id === task.agentId);
            return (
              <article
                key={task.id}
                className={"task-v2-row " + (done ? "task-v2-done" : "")}
              >
                <div className="task-v2-row-main">
                  <label
                    className="task-v2-checkbox"
                    title={
                      working
                        ? "Finish or stop the linked run before changing this task"
                        : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={!!busy || working}
                      onChange={() =>
                        mutate(done ? "reopen" : "complete", task)
                      }
                      aria-label={(done ? "Reopen " : "Complete ") + task.title}
                    />
                    <span aria-hidden="true">
                      {done && <Check size={12} />}
                    </span>
                  </label>
                  <div className="task-v2-content">
                    <h2>{task.title}</h2>
                    <div className="task-v2-meta">
                      <span
                        className={
                          "task-v2-status task-v2-status-" +
                          (task.runStatus || task.status)
                        }
                      >
                        {working && (
                          <Loader2 size={11} className="task-v2-spin" />
                        )}
                        {runLabel(task)}
                      </span>
                      <span className="task-v2-meta-dot">·</span>
                      <span>{currentAgent?.name || "Agent unavailable"}</span>
                    </div>
                  </div>
                  <div className="task-v2-actions">
                    {task.chatId && (
                      <button
                        type="button"
                        disabled={!!busy}
                        className="task-v2-conversation"
                        onClick={() => onConversation(task.chatId!)}
                      >
                        <MessageSquare size={14} />
                        <span>Conversation</span>
                      </button>
                    )}
                    {!done && (
                      <button
                        type="button"
                        className="task-v2-start"
                        disabled={
                          !!busy ||
                          working ||
                          !agents.length ||
                          (Boolean(task.chatId) && !currentAgent)
                        }
                        onClick={() =>
                          startingId === task.id
                            ? setStartingId(null)
                            : start(task)
                        }
                      >
                        <Play size={12} />
                        {working
                          ? "Working…"
                          : task.chatId
                            ? "Continue task"
                            : "Start working"}
                      </button>
                    )}
                  </div>
                </div>
                {task.prompt !== task.title && (
                  <details className="task-v2-description">
                    <summary>
                      {task.prompt.slice(0, 140)}
                      {task.prompt.length > 140 ? "…" : ""}
                    </summary>
                    <p>{task.prompt}</p>
                  </details>
                )}
                {startingId === task.id && (
                  <form
                    className="task-v2-run-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (selectedAgent) mutate("run", task);
                    }}
                  >
                    <div className="task-v2-run-title">
                      <h3>
                        {task.chatId
                          ? "Continue this task"
                          : "Start working on this task"}
                      </h3>
                      <button
                        type="button"
                        className="task-v2-close"
                        aria-label="Close start task form"
                        disabled={!!busy}
                        onClick={() => setStartingId(null)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    <label>
                      Agent
                      <select
                        value={selectedAgent}
                        disabled={!!busy || !!task.chatId}
                        onChange={(e) => setSelectedAgent(e.target.value)}
                      >
                        {!selectedAgent && (
                          <option value="">Choose an agent</option>
                        )}
                        {agents.map((a) => (
                          <option value={a.id} key={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {task.chatId && (
                      <p>
                        This task continues with its original agent in the
                        linked conversation.
                      </p>
                    )}
                    <label>
                      Additional instructions <span>Optional</span>
                      <textarea
                        maxLength={10000}
                        value={instructions}
                        disabled={!!busy}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Anything else the agent should know for this run?"
                      />
                    </label>
                    <div className="task-v2-run-footer">
                      <p>
                        Starts a real run and opens its conversation. External
                        actions follow the agent's approval settings.
                      </p>
                      <button
                        className="task-v2-add"
                        type="submit"
                        disabled={!!busy || !selectedAgent}
                      >
                        {busy === task.id ? (
                          <>
                            <Loader2 size={14} className="task-v2-spin" />
                            Starting…
                          </>
                        ) : (
                          <>
                            Start working <ArrowRight size={14} />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
          {!visible.length && (
            <div className="task-v2-empty">
              <ListTodo size={26} />
              <h2>
                {search.trim()
                  ? "No matching tasks"
                  : filter === "completed"
                    ? "No completed tasks yet"
                    : filter === "open" && tasks.length
                      ? "All caught up"
                      : "Give your next task a home"}
              </h2>
              <p>
                {search.trim()
                  ? "Try a different search or change the status filter."
                  : filter === "completed"
                    ? "Check off a task when its outcome is ready."
                    : "Add a task above. When you're ready, choose an agent to work on it."}
              </p>
              {search.trim() && (
                <button type="button" onClick={() => setSearch("")}>
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {!agents.length && !loading && (
        <p className="task-v2-footnote">
          No agents are available. Create or restore an agent before starting
          work.
        </p>
      )}
    </section>
  );
}
