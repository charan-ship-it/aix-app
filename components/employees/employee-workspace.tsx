"use client";
import type { Pod } from "@/lib/pods";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Box,
  Check,
  FileText,
  FolderOpen,
  MessageSquare,
  Plus,
  Settings2,
  ListTodo,
  Activity as ActivityIcon,
  Plug,
  Play,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import Workspace, { AgentIcon } from "@/app/workspace";
import { AgentBuilder } from "@/components/platform/agent-builder";
import { Activity, Schedules } from "@/components/platform/activity";
import { builtinToolLabel, toolkitCatalog, type AgentConfig } from "@/lib/agent-config";
import type { Chat, Document } from "@/lib/workspace";
import { taskStatus, type EmployeeTask } from "@/lib/employee-tasks";
const tabs = [
  ["overview", "Overview", Bot],
  ["conversations", "Conversations", MessageSquare],
  ["tasks", "Tasks", ListTodo],
  ["files", "Files", FolderOpen],
  ["tools", "Tools", Plug],
  ["activity", "Activity", ActivityIcon],
  ["settings", "Settings", Settings2],
] as const;
export function EmployeeWorkspace({
  employee,
  pod,
  organization,
  section,
  conversationId,
}: {
  employee: AgentConfig;
  pod?: Pod;
  organization: { id: string; name: string; role: string };
  section: string;
  conversationId: string | null;
}) {
  const pathname = usePathname();
  const actualConversationId =
    section === "conversations" ? pathname.split("/")[4] : undefined;
  const router = useRouter(),
    base = pod
      ? "/pods/" + pod.id
      : "/agents/" + encodeURIComponent(employee.id);
  const taskUrl = pod
    ? "/api/pods/" + pod.id + "/tasks"
    : "/api/employees/" + encodeURIComponent(employee.id) + "/tasks";
  const name = pod?.name || employee.name;
  const [podDraft, setPodDraft] = useState(pod);
  const [allAgents, setAllAgents] = useState<AgentConfig[]>([]);
  const [agent, setAgent] = useState(employee),
    [chats, setChats] = useState<Chat[]>([]),
    [docs, setDocs] = useState<Document[]>([]),
    [tasks, setTasks] = useState<EmployeeTask[]>([]),
    [error, setError] = useState(""),
    [savedMessage, setSavedMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [adding, setAdding] = useState(false),
    [title, setTitle] = useState(""),
    [prompt, setPrompt] = useState(""),
    [providerReady, setProviderReady] = useState(false);
  async function refresh() {
    try {
      const [wr, tr] = await Promise.all([
        fetch(
          pod
            ? "/api/workspace?podId=" + pod.id
            : section === "settings"
              ? "/api/workspace"
              : "/api/workspace?agentId=" + encodeURIComponent(agent.id),
        ),
        fetch(taskUrl),
      ]);
      const [w, t] = await Promise.all([wr.json(), tr.json()]);
      if (!wr.ok || !tr.ok)
        throw Error(w.error || t.error || "Could not load this employee.");
      setChats(
        w.records
          .filter(
            (r: any) =>
              r.kind === "chat" &&
              (pod ? r.podId === pod.id : r.agentId === agent.id),
          )
          .sort((a: Chat, b: Chat) => b.updatedAt.localeCompare(a.updatedAt)),
      );
      setDocs(w.records.filter((r: any) => r.kind === "document"));
      setTasks(t.items);
      setAllAgents([
        ...(w.agents || []),
        ...w.records.filter(
          (r: any) =>
            r.kind === "agent" &&
            !(w.agents || []).some((a: any) => a.id === r.id),
        ),
      ]);
      setProviderReady(
        w.providers?.some(
          (p: any) => p.provider === agent.provider && p.configured,
        ) || false,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => setAgent(employee), [employee]);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [agent.id, agent.provider, section]);
  useEffect(() => {
    document.documentElement.dataset.theme =
      localStorage.getItem("aix-theme") === "light" ? "light" : "dark";
  }, []);
  const [startingTask, setStartingTask] = useState<EmployeeTask | null>(null);
  const [taskEmployee, setTaskEmployee] = useState(agent.id);
  const [taskInstructions, setTaskInstructions] = useState("");
  async function taskAction(action: string, id?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(taskUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "create"
            ? { action, title, prompt }
            : action === "run" && startingTask
              ? {
                  action,
                  id,
                  agentId: taskEmployee,
                  instructions: taskInstructions,
                }
              : { action, id },
        ),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not update task.");
      setAdding(false);
      setStartingTask(null);
      setTaskInstructions("");
      setTitle("");
      setPrompt("");
      await refresh();
      if (action === "run") router.push(base + "/conversations/" + d.chatId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name) || file.size > 200000) {
      setError("Choose a text, Markdown, or CSV file smaller than 200 KB.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "document",
          data: {
            id: crypto.randomUUID(),
            ...(pod ? { podId: pod.id } : { agentId: agent.id }),
            name: file.name,
            content: await file.text(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [conversationSearch, setConversationSearch] = useState("");
  const [note, setNote] = useState<{ name: string; content: string } | null>(
    null,
  );
  const [companyFiles, setCompanyFiles] = useState<Document[] | null>(null);
  const newConversation = base + "/conversations/new";
  return (
    <div className="employee-shell">
      <aside className="employee-rail">
        <Link className="employee-brand" href="/?view=agents">
          <img src="/brand/aix-icon-dark.png" alt="" />
          AIXCCELERATE
        </Link>
        <Link className="employee-back" href={pod ? "/pods" : "/?view=agents"}>
          <ArrowLeft size={15} />
          {pod ? "All Pods" : "All employees"}
        </Link>
        <div className={"employee-identity " + agent.color}>
          <span className="employee-avatar">
            {pod ? <Box size={25} /> : <AgentIcon agent={agent} />}
          </span>
          <strong>{name}</strong>
          <small>{pod ? "Project Pod" : agent.category + " employee"}</small>
        </div>
        <Link className="employee-back employee-pods-link" href="/pods">
          Project Pods <ArrowUpRight size={13} />
        </Link>
        <nav aria-label="Employee navigation">
          {tabs.map(([id, label, Icon]) => (
            <Link
              key={id}
              className={section === id ? "selected" : ""}
              href={base + (id === "overview" ? "" : "/" + id)}
            >
              <Icon size={17} />
              {label}
              {id === "tasks" &&
                tasks.filter((t) => t.status === "todo").length > 0 && (
                  <small>
                    {tasks.filter((t) => t.status === "todo").length}
                  </small>
                )}
            </Link>
          ))}
        </nav>
        <div className="employee-rail-foot">
          <ShieldCheck size={15} />
          <span>
            {organization.name}
            <small>Organization workspace</small>
          </span>
          <Link aria-label="Organization settings" href="/?view=settings">
            <Settings2 size={16} />
          </Link>
        </div>
      </aside>
      <main className="employee-main">
        <header className="employee-topbar">
          <div>
            <Link href={pod ? "/pods" : "/?view=agents"}>
              {pod ? "Pods" : "Employees"}
            </Link>
            <span>/</span>
            <Link href={base}>
              <strong>{name}</strong>
            </Link>
            <span>/</span>
            <span>
              {actualConversationId && actualConversationId !== "new"
                ? (tasks.find((t) => t.chatId === actualConversationId)
                    ? "Task · " +
                      tasks.find((t) => t.chatId === actualConversationId)!
                        .title
                    : chats.find((c) => c.id === actualConversationId)
                        ?.title) || "Conversation"
                : tabs.find((t) => t[0] === section)?.[1]}
            </span>
            {actualConversationId &&
              tasks.some((t) => t.chatId === actualConversationId) && (
                <Link className="employee-task-back" href={base + "/tasks"}>
                  Back to task
                </Link>
              )}
          </div>
          <Link className="primary" href={newConversation}>
            <Plus size={15} />
            New conversation
          </Link>
        </header>
        <div className="employee-mobile-tabs">
          {tabs.map(([id, label]) => (
            <Link
              className={section === id ? "selected" : ""}
              key={id}
              href={base + (id === "overview" ? "" : "/" + id)}
            >
              {label}
            </Link>
          ))}
        </div>
        {savedMessage && section === "settings" && (
          <div role="status" className="employee-saved-message">
            {savedMessage}
          </div>
        )}
        {error && (
          <div className="employee-alert" role="alert">
            {error}
            <button
              onClick={() => {
                setError("");
                refresh();
              }}
            >
              Retry
            </button>
            {error.toLowerCase().includes("connect") && (
              <Link href="/?view=settings">Connect model</Link>
            )}
          </div>
        )}
        {section === "conversations" && conversationId ? (
          <Workspace
            key={conversationId}
            employeeId={agent.id}
            podId={pod?.id}
            workspaceName={name}
            conversationId={conversationId}
          />
        ) : (
          <div className="employee-scroll">
            {section === "overview" && (
              <>
                <div className="employee-heading">
                  <span className="employee-eyebrow">
                    {pod
                      ? "PROJECT WORKSPACE"
                      : "YOUR " + agent.category.toUpperCase() + " EMPLOYEE"}
                  </span>
                  <h1>{name}</h1>
                  <p>{pod?.description || agent.description}</p>
                  <div className="employee-actions">
                    <Link className="primary" href={newConversation}>
                      <MessageSquare size={16} />
                      Start working together
                    </Link>
                    <Link className="secondary" href={base + "/settings"}>
                      <Settings2 size={15} />
                      {pod ? "Configure Pod" : "Configure employee"}
                    </Link>
                  </div>
                </div>
                {!providerReady && (
                  <div className="employee-connection-note">
                    Connect{" "}
                    {agent.provider === "openai" ? "OpenAI" : "Anthropic"} to
                    start running this employee.{" "}
                    <Link href="/?view=settings">
                      Connect model <ArrowUpRight size={13} />
                    </Link>
                  </div>
                )}
                <div className="employee-stats">
                  {[
                    [
                      "Conversations",
                      chats.length,
                      MessageSquare,
                      "conversations",
                    ],
                    [
                      "Open tasks",
                      tasks.filter((t) => t.status === "todo").length,
                      ListTodo,
                      "tasks",
                    ],
                    ["Knowledge sources", docs.length, FolderOpen, "files"],
                  ].map(([label, count, Icon, target]) => {
                    const I = Icon as typeof Bot;
                    return (
                      <Link key={String(label)} href={base + "/" + target}>
                        <I size={20} />
                        <strong>{String(count)}</strong>
                        <span>{String(label)}</span>
                        <ArrowUpRight size={15} />
                      </Link>
                    );
                  })}
                </div>
                <div className="employee-overview-grid">
                  <section className="employee-card">
                    <div className="employee-section-title">
                      <h2>Recent conversations</h2>
                      <Link href={base + "/conversations"}>View all</Link>
                    </div>
                    {chats.slice(0, 5).map((c) => (
                      <Conversation
                        key={c.id}
                        chat={c}
                        base={base}
                        task={tasks.find((t) => t.chatId === c.id)}
                        employeeName={
                          allAgents.find((a) => a.id === c.agentId)?.name ||
                          agent.name
                        }
                      />
                    ))}
                    {!chats.length && (
                      <Empty
                        icon={MessageSquare}
                        title="Your work starts here"
                        text="Every conversation with this employee stays in this workspace."
                        href={newConversation}
                        label="Start a conversation"
                      />
                    )}
                  </section>
                  <section className="employee-card">
                    <h2>How I work</h2>
                    <p className="employee-instructions">
                      {pod?.instructions || agent.instructions}
                    </p>
                    <div className="employee-facts">
                      <span>
                        Model<strong>{agent.model}</strong>
                      </span>
                      <span>
                        Connected apps<strong>{agent.toolkits.length}</strong>
                      </span>
                      <span>
                        Knowledge
                        <strong>
                          {agent.knowledgeScope === "all"
                            ? "Organization library"
                            : agent.knowledgeScope === "none"
                              ? "Disabled"
                              : "Selected & employee files"}
                        </strong>
                      </span>
                      <span>
                        External actions
                        <strong>
                          {agent.externalPolicy === "ask"
                            ? "Approval required"
                            : "Read only"}
                        </strong>
                      </span>
                    </div>
                    <Link href={base + "/settings"}>
                      Edit instructions & capabilities{" "}
                      <ArrowUpRight size={14} />
                    </Link>
                  </section>
                </div>
              </>
            )}
            {section === "conversations" && (
              <>
                <PageHeading
                  title="Conversations"
                  text={
                    "Work with " +
                    agent.name +
                    ". Your conversations stay here."
                  }
                />
                <input
                  className="employee-filter"
                  aria-label="Search conversations"
                  placeholder="Search conversations…"
                  value={conversationSearch}
                  onChange={(e) => setConversationSearch(e.target.value)}
                />
                <section className="employee-card">
                  {chats
                    .filter((c) =>
                      c.title
                        .toLowerCase()
                        .includes(conversationSearch.toLowerCase()),
                    )
                    .map((c) => (
                      <Conversation
                        key={c.id}
                        chat={c}
                        base={base}
                        task={tasks.find((t) => t.chatId === c.id)}
                        employeeName={
                          allAgents.find((a) => a.id === c.agentId)?.name ||
                          agent.name
                        }
                      />
                    ))}
                  {!chats.length && (
                    <Empty
                      icon={MessageSquare}
                      title="A fresh workspace"
                      text="Start your first conversation with this employee."
                      href={newConversation}
                      label="New conversation"
                    />
                  )}
                </section>
              </>
            )}
            {section === "tasks" && (
              <>
                <PageHeading
                  title="Tasks"
                  text="Give your employee work with a clear outcome."
                />
                <button className="primary" onClick={() => setAdding(!adding)}>
                  <Plus size={16} />
                  New task
                </button>
                {adding && (
                  <form
                    className="employee-card employee-task-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      taskAction("create");
                    }}
                  >
                    <label>
                      Task name
                      <input
                        required
                        maxLength={120}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Prepare the weekly report"
                      />
                    </label>
                    <label>
                      Instructions
                      <textarea
                        required
                        maxLength={20000}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the outcome, context, and what done looks like."
                      />
                    </label>
                    <div>
                      <button className="primary" disabled={busy}>
                        Create task
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setAdding(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                <section className="employee-card employee-task-list">
                  {tasks.map((t) => {
                    const running = [
                      "queued",
                      "running",
                      "awaiting_approval",
                    ].includes(t.runStatus || "");
                    return (
                      <article key={t.id}>
                        <button
                          className={
                            "task-check " +
                            (t.status === "done" ? "checked" : "")
                          }
                          disabled={busy || running}
                          onClick={() =>
                            taskAction(
                              t.status === "done" ? "reopen" : "complete",
                              t.id,
                            )
                          }
                          aria-label={
                            (t.status === "done" ? "Reopen " : "Complete ") +
                            t.title
                          }
                        >
                          {t.status === "done" && <Check size={14} />}
                        </button>
                        <div>
                          <strong>{t.title}</strong>
                          <p>{t.prompt}</p>
                          <small>
                            {taskStatus(t).replaceAll("_", " ")} ·{" "}
                            {allAgents.find((a) => a.id === t.agentId)?.name ||
                              agent.name}
                          </small>
                        </div>
                        {t.chatId && (
                          <Link
                            className="secondary"
                            href={base + "/conversations/" + t.chatId}
                          >
                            Open conversation
                          </Link>
                        )}
                        {t.status !== "done" && (
                          <button
                            className="secondary"
                            disabled={busy || running}
                            onClick={() => {
                              setStartingTask(t);
                              setTaskEmployee(t.agentId);
                              setTaskInstructions("");
                            }}
                          >
                            <Play size={14} />
                            {running ? "Working…" : "Run task"}
                          </button>
                        )}
                      </article>
                    );
                  })}
                  {!tasks.length && (
                    <Empty
                      icon={ListTodo}
                      title="Ready for the next assignment"
                      text="Create a task, then run it when you’re ready. Each task has its own conversation."
                    />
                  )}
                </section>
              </>
            )}
            {section === "tasks" && startingTask && (
              <form
                className="employee-card employee-task-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  taskAction("run", startingTask.id);
                }}
              >
                <h2>Start: {startingTask.title}</h2>
                <label>
                  Employee
                  <select
                    disabled={!!startingTask.chatId}
                    value={taskEmployee}
                    onChange={(e) => setTaskEmployee(e.target.value)}
                  >
                    {(pod ? allAgents : [agent]).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Additional instructions
                  <textarea
                    maxLength={10000}
                    value={taskInstructions}
                    onChange={(e) => setTaskInstructions(e.target.value)}
                    placeholder="Anything else this employee should know?"
                  />
                </label>
                <div>
                  <button className="primary" disabled={busy}>
                    Start working
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setStartingTask(null)}
                  >
                    Cancel
                  </button>
                </div>
                <p className="settings-note">
                  Opens a linked conversation in this workspace. External
                  actions still require approval.
                </p>
              </form>
            )}
            {section === "files" && (
              <>
                <PageHeading
                  title="Files & knowledge"
                  text={
                    pod
                      ? "Project files provide context for agents working in this Pod."
                      : "Files added here belong to this employee and are available to its knowledge search."
                  }
                />
                <label className="primary employee-upload">
                  <Plus size={16} />
                  {busy ? "Uploading…" : "Add files"}
                  <input
                    disabled={busy}
                    type="file"
                    accept=".txt,.md,.csv"
                    onChange={(e) => {
                      upload(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                <div className="employee-actions">
                  <button
                    className="secondary"
                    onClick={() => setNote({ name: "", content: "" })}
                  >
                    <FileText size={15} />
                    Create a note
                  </button>
                  {pod && (
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          const r = await fetch("/api/workspace");
                          const d = await r.json();
                          if (!r.ok) throw Error(d.error);
                          setCompanyFiles(
                            d.records.filter((r: any) => r.kind === "document"),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Add company knowledge
                    </button>
                  )}
                </div>
                <p className="settings-note">
                  Text, Markdown, or CSV · up to 200 KB each. Organization
                  sources can be selected in employee settings.
                </p>
                {note && (
                  <form
                    className="employee-card employee-task-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await upload(
                        new File(
                          [note.content],
                          note.name.endsWith(".md")
                            ? note.name
                            : note.name + ".md",
                        ),
                      );
                      setNote(null);
                    }}
                  >
                    <label>
                      Note name
                      <input
                        required
                        value={note.name}
                        onChange={(e) =>
                          setNote({ ...note, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Content
                      <textarea
                        required
                        value={note.content}
                        onChange={(e) =>
                          setNote({ ...note, content: e.target.value })
                        }
                      />
                    </label>
                    <div>
                      <button className="primary" disabled={busy}>
                        Save note
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => setNote(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {companyFiles && (
                  <section className="employee-card">
                    <div className="employee-section-title">
                      <h2>Add company knowledge</h2>
                      <button
                        className="secondary"
                        onClick={() => setCompanyFiles(null)}
                      >
                        Close
                      </button>
                    </div>
                    <p className="settings-note">
                      Add a copy to this Pod. Changes to the original stay
                      separate.
                    </p>
                    {companyFiles.map((d) => (
                      <div className="employee-file" key={d.id}>
                        <FileText size={16} />
                        <strong>{d.name}</strong>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={async () => {
                            await upload(new File([d.content], d.name));
                            setCompanyFiles(null);
                          }}
                        >
                          Add to Pod
                        </button>
                      </div>
                    ))}
                    {!companyFiles.length && (
                      <p className="settings-note">
                        No company sources yet. Add them in organization
                        Knowledge.
                      </p>
                    )}
                  </section>
                )}
                <section className="employee-card">
                  {docs.map((d) => (
                    <div className="employee-file" key={d.id}>
                      <FileText size={20} />
                      <div>
                        <details>
                          <summary>
                            <strong>{d.name}</strong>
                          </summary>
                          <pre>{d.content}</pre>
                        </details>
                        <small>
                          {pod && d.podId === pod.id
                            ? "Pod file"
                            : d.agentId === agent.id
                              ? "Employee file"
                              : "Shared organization source"}{" "}
                          · {d.chunkCount || 0} chunks
                        </small>
                        {d.indexError && (
                          <p className="form-error">{d.indexError}</p>
                        )}
                      </div>
                      <span className="status-pill">
                        {d.status || "queued"}
                      </span>
                    </div>
                  ))}
                  {!docs.length && (
                    <Empty
                      icon={FolderOpen}
                      title="Give this employee context"
                      text="Add reference material, company guidelines, or project notes."
                    />
                  )}
                </section>
              </>
            )}
            {section === "tools" && (
              <>
                <PageHeading
                  title="Tools & apps"
                  text="The capabilities this employee can use while working."
                />
                <section className="employee-card">
                  <h2>Built-in tools</h2>
                  {agent.tools.map((t) => (
                    <div className="employee-file" key={t}>
                      <Check size={17} />
                      <strong>{builtinToolLabel(t)}</strong>
                      <span className="status-pill">Enabled</span>
                    </div>
                  ))}
                  {!agent.tools.length && <p>No built-in tools enabled.</p>}
                  <h2>App permissions</h2>
                  {agent.toolkits.map((slug) => (
                    <div className="employee-file" key={slug}>
                      <Plug size={17} />
                      <strong>
                        {toolkitCatalog.find((t) => t.slug === slug)?.name ||
                          slug}
                      </strong>
                      <Link href="/?view=integrations">
                        Manage connection <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  ))}
                  {!agent.toolkits.length && (
                    <p className="settings-note">
                      No external apps enabled. Choose apps in this employee’s
                      settings, then connect your account.
                    </p>
                  )}
                  <div className="employee-actions">
                    <Link className="secondary" href={base + "/settings"}>
                      Edit capabilities
                    </Link>
                    <Link className="secondary" href="/?view=integrations">
                      Manage app connections
                    </Link>
                  </div>
                </section>
              </>
            )}
            {section === "activity" && !pod && (
              <>
                <PageHeading
                  title="Activity & schedules"
                  text="Follow this employee’s runs and recurring assignments."
                />
                <Activity
                  agents={[agent]}
                  agentId={agent.id}
                  onOpen={(c) => router.push(base + "/conversations/" + c.id)}
                />
                <Schedules agents={[agent]} agentId={agent.id} />
              </>
            )}
            {section === "settings" && !pod && (
              <>
                <PageHeading
                  title="Employee settings"
                  text="Define this employee’s role, instructions, model, tools, and knowledge."
                />
                <div className="employee-settings">
                  <AgentBuilder
                    agent={agent}
                    documents={docs}
                    onCancel={() => router.push(base)}
                    onSave={async (a, test) => {
                      const r = await fetch("/api/workspace", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ kind: "agent", data: a }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw Error(d.error);
                      setAgent(a);
                      setSavedMessage("Employee settings saved.");
                      router.refresh();
                      if (test) router.push(newConversation);
                    }}
                  />
                </div>
              </>
            )}
            {section === "settings" && pod && podDraft && (
              <>
                <PageHeading
                  title="Pod settings"
                  text="Project context is separate from the employees working here."
                />
                <form
                  className="employee-card employee-task-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      const r = await fetch("/api/pods", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(podDraft),
                      });
                      const d = await r.json();
                      if (!r.ok) throw Error(d.error);
                      router.refresh();
                      setSavedMessage("Pod settings saved.");
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Pod name
                    <input
                      required
                      value={podDraft.name}
                      onChange={(e) =>
                        setPodDraft({ ...podDraft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      value={podDraft.description}
                      onChange={(e) =>
                        setPodDraft({
                          ...podDraft,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Instructions for agents
                    <textarea
                      value={podDraft.instructions}
                      onChange={(e) =>
                        setPodDraft({
                          ...podDraft,
                          instructions: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Default employee
                    <select
                      value={podDraft.defaultAgentId}
                      onChange={(e) =>
                        setPodDraft({
                          ...podDraft,
                          defaultAgentId: e.target.value,
                        })
                      }
                    >
                      {allAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Access
                    <select
                      value={podDraft.access}
                      onChange={(e) =>
                        setPodDraft({
                          ...podDraft,
                          access: e.target.value as Pod["access"],
                        })
                      }
                    >
                      <option value="private">Private · only you</option>
                      <option value="organization">
                        Organization · all members
                      </option>
                    </select>
                  </label>
                  <p className="settings-note">
                    Conversations and task runs remain private to their author.
                    Pod files and instructions follow the Pod access setting.
                  </p>
                  <button disabled={busy} className="primary">
                    {busy ? "Saving…" : "Save Pod settings"}
                  </button>
                </form>
              </>
            )}
            {section === "activity" && pod && (
              <>
                <PageHeading
                  title="Pod activity"
                  text="Your runs inside this project."
                />
                <Activity
                  agents={allAgents}
                  podId={pod.id}
                  onOpen={(c) => router.push(base + "/conversations/" + c.id)}
                />
              </>
            )}
            {loading && (
              <p role="status" className="settings-note">
                <Loader2 size={15} className="spin" /> Loading workspace…
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
function PageHeading({ title, text }: { title: string; text: string }) {
  return (
    <div className="employee-page-heading">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
function Conversation({
  chat,
  base,
  task,
  employeeName,
}: {
  chat: Chat;
  base: string;
  task?: EmployeeTask;
  employeeName?: string;
}) {
  return (
    <Link
      className="employee-conversation"
      href={base + "/conversations/" + chat.id}
    >
      <MessageSquare size={18} />
      <div>
        <strong>
          {task && <span className="conversation-task-tag">Task</span>}
          {task?.title || chat.title}
        </strong>
        <small>
          {new Date(chat.updatedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}{" "}
          · {employeeName} · {chat.messages.length} messages
        </small>
      </div>
      <ArrowUpRight size={15} />
    </Link>
  );
}
function Empty({
  icon: Icon,
  title,
  text,
  href,
  label,
}: {
  icon: typeof Bot;
  title: string;
  text: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="employee-empty">
      <Icon size={27} />
      <h3>{title}</h3>
      <p>{text}</p>
      {href && (
        <Link className="secondary" href={href}>
          {label}
          <ArrowUpRight size={14} />
        </Link>
      )}
    </div>
  );
}
