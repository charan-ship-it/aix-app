"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  Bot,
  Box,
  Check,
  ChevronRight,
  FolderOpen,
  ListTodo,
  Loader2,
  Lock,
  MessageSquare,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Workspace from "@/app/workspace";
import { ProductShell, type ProductUser } from "./product-shell";
import { ProductModal } from "./modal";
import { AgentCatalog, PodCatalog } from "./catalog";
import { AgentStudio } from "./agent-studio";
import { FileLibrary } from "./file-library";
import { SettingsView } from "./settings-view";
import { PodTasks } from "./pod-tasks";
import { Connections } from "@/components/platform/connections";
import { MCPConnections } from "@/components/platform/mcp-connections";
import { Activity } from "@/components/platform/activity";
import { type AgentConfig } from "@/lib/agent-config";
import type { Chat, Document } from "@/lib/workspace";
import type { Pod } from "@/lib/pods";
import {
  request,
  conversationHref,
  type ProductData,
} from "@/lib/product-client";
import { AgentDetail } from "./agent-detail";
import { QualityWorkspace } from "./quality-workspace";
import { SkillsLibrary } from "./skills-library";
import { MyWork } from "./my-work";
import { WorkInbox } from "./work-inbox";
import { WorkDetail } from "./work-detail";
import { DelegatedWork } from "./delegated-work";
import { ConversationHistory } from "./conversation-history";
import { ConversationsIndex } from "./conversations-index";
import { CreatePod, PodSettings } from "./pod-settings";
import { HomeWorkbench, starterPrompts } from "./home-workbench";
import "./product.css";
export type ProductView =
  | "home"
  | "conversation"
  | "conversations"
  | "agents"
  | "agent"
  | "studio"
  | "pods"
  | "pod"
  | "spaces"
  | "connections"
  | "inbox"
  | "work"
  | "skills"
  | "my-work"
  | "quality"
  | "settings";
type ConversationData = { chat: Chat; pod: Pod | null; agent: AgentConfig };
export function ProductApp({
  view,
  entityId,
  section,
  user,
  initialData,
  initialPods,
  initialScoped,
  initialConversation,
  initialContextError,
}: {
  view: ProductView;
  entityId?: string;
  section?: string;
  user: ProductUser;
  initialData?: ProductData;
  initialPods?: Pod[];
  initialScoped?: ProductData;
  initialConversation?: ConversationData;
  initialContextError?: string;
}) {
  const router = useRouter(),
    path = usePathname(),
    params = useSearchParams();
  const [global, setGlobal] = useState<ProductData | null>(initialData || null),
    [pods, setPods] = useState<Pod[]>(initialPods || []),
    [scoped, setScoped] = useState<ProductData | null>(initialScoped || null),
    [conversation, setConversation] = useState<ConversationData | null>(
      initialConversation || null,
    ),
    [error, setError] = useState(""),
    [scopeError, setScopeError] = useState(initialContextError || ""),
    [loading, setLoading] = useState(!initialData),
    [scopeLoading, setScopeLoading] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [search, setSearch] = useState(""),
    [podCreate, setPodCreate] = useState(false),
    [notice, setNotice] = useState("");
  const actualChatId =
    path.startsWith("/conversation/") && path.split("/")[2] !== "new"
      ? path.split("/")[2]
      : undefined;
  const podId =
    view === "pod"
      ? entityId
      : actualChatId
        ? conversation?.pod?.id
        : params.get("pod") || undefined;
  const admin = ["owner", "admin"].includes(user.role);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const [w, p] = await Promise.all([
      request<ProductData>(
        "/api/workspace?includeArchived=1",
        undefined,
        signal,
      ),
      request<{ items: Pod[] }>(
        "/api/pods?includeArchived=1",
        undefined,
        signal,
      ),
    ]);
    setGlobal(w);
    setPods(p.items);
    setError("");
  }, []);
  useEffect(() => {
    if (initialData) return;
    const c = new AbortController();
    setLoading(true);
    refresh(c.signal)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [refresh, user.organizationId]);
  useEffect(() => {
    const c = new AbortController();
    if (!actualChatId) {
      setConversation(null);
      return;
    }
    if (initialConversation?.chat.id === actualChatId) {
      setConversation(initialConversation);
      return;
    }
    setScopeLoading(true);
    setScopeError("");
    request<ConversationData>(
      "/api/conversations/" + actualChatId,
      undefined,
      c.signal,
    )
      .then((d) => setConversation(d))
      .catch((e) => {
        if (e.name !== "AbortError") setScopeError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setScopeLoading(false);
      });
    return () => c.abort();
  }, [actualChatId]);
  const refreshScope = useCallback(async () => {
    if (!podId) return;
    setScoped(await request<ProductData>("/api/workspace?podId=" + podId));
  }, [podId]);
  useEffect(() => {
    const c = new AbortController();
    if (!podId) {
      setScoped(null);
      return;
    }
    if (initialScoped?.pod?.id === podId) {
      setScoped(initialScoped);
      return;
    }
    setScoped(null);
    setScopeLoading(true);
    setScopeError("");
    request<ProductData>("/api/workspace?podId=" + podId, undefined, c.signal)
      .then(setScoped)
      .catch((e) => {
        if (e.name !== "AbortError") setScopeError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setScopeLoading(false);
      });
    return () => c.abort();
  }, [podId]);
  useEffect(() => {
    if (view === "pods" && params.get("create") === "1") setPodCreate(true);
  }, [view, params]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const allAgents = useMemo(() => {
    const map = new Map<string, AgentConfig>();
    global?.agents.forEach((a) => map.set(a.id, a));
    global?.records.forEach((r) => {
      if (r.kind === "agent") map.set(r.id, r);
    });
    return [...map.values()];
  }, [global]);
  const agents = allAgents.filter((a) => !a.archived),
    allChats = (global?.records.filter((r) => r.kind === "chat") ||
      []) as Chat[],
    companyDocs = (global?.records.filter(
      (r) => r.kind === "document" && !r.agentId && !r.podId,
    ) || []) as Document[],
    allDocs = (global?.records.filter((r) => r.kind === "document") ||
      []) as Document[];
  const pod =
    scoped?.pod ||
    pods.find((p) => p.id === podId) ||
    conversation?.pod ||
    null;
  const agent = allAgents.find(
    (a) =>
      a.id ===
      (view === "agent" || view === "studio"
        ? entityId
        : conversation?.chat.agentId ||
          params.get("agent") ||
          pod?.defaultAgentId ||
          "xcelerate"),
  );
  const scopedChats = (
    (scoped?.records.filter((r) => r.kind === "chat") || []) as Chat[]
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const activeChat = conversation?.chat;
  const onSearch = useCallback(() => {
    setSearchOpen(true);
    setSearch("");
  }, []);
  const onChange = useCallback(() => {
    refresh().catch((e) => setError(e.message));
    refreshScope().catch((e) => setScopeError(e.message));
  }, [refresh, refreshScope]);
  async function saveAgent(a: AgentConfig, test = false) {
    await request("/api/workspace", { kind: "agent", data: a });
    await refresh();
    setNotice("Agent saved.");
    router.push(test ? "/conversation/new?agent=" + a.id : "/agents/" + a.id);
  }
  async function archiveAgent(a: AgentConfig, archived: boolean) {
    await request("/api/workspace", {
      kind: "agent",
      data: { ...a, archived },
    });
    await refresh();
    setNotice(
      archived
        ? "Agent archived. Restore it from the agent library."
        : "Agent restored.",
    );
    if (archived && view === "agent") router.push("/agents");
  }
  async function savePod(p: Pod) {
    await request("/api/pods", p);
    await refresh();
    if (p.id === podId) await refreshScope();
    setNotice("Pod settings saved.");
  }
  async function archivePod(p: Pod, archived: boolean) {
    await savePod({ ...p, archived });
    setNotice(
      archived ? "Pod archived. Its work is preserved." : "Pod restored.",
    );
    if (archived && view === "pod") router.push("/pods");
  }
  const shellChats =
    actualChatId && activeChat && !allChats.some((c) => c.id === activeChat.id)
      ? [activeChat, ...allChats]
      : allChats;
  const ready = !!global?.providers.some(
    (p) => p.provider !== "composio" && p.configured,
  );
  const isConversation = view === "conversation";
  const starter = params.get("starter");
  const initialPrompt = starter && Object.hasOwn(starterPrompts, starter)
    ? starterPrompts[starter as keyof typeof starterPrompts]
    : undefined;
  const pageContent =
    loading && !global ? (
      <div className="product-loading" role="status">
        <Loader2 className="spin" size={22} />
        <span>Opening your workspace…</span>
      </div>
    ) : error && !global ? (
      <div className="product-empty">
        <h1>Could not open your workspace</h1>
        <p role="alert">{error}</p>
        <button
          className="primary"
          onClick={() => refresh().catch((e) => setError(e.message))}
        >
          Try again
        </button>
      </div>
    ) : global ? (
      <>
        {error && (
          <div role="alert" className="product-error">
            {error}
            <button onClick={() => refresh().catch((e) => setError(e.message))}>
              Retry
            </button>
          </div>
        )}
        {view === "home" ? (
          <HomeWorkbench key={user.organizationId} user={user} agents={allAgents} providers={global.providers} />
        ) : isConversation ? (
          <>
            {actualChatId && (
              <header className="product-context-header">
                <div>
                  {pod ? (
                    <Link href={"/pods/" + pod.id}>
                      <Box size={16} />
                      {pod.name}
                    </Link>
                  ) : (
                    <Link href="/">
                      <MessageSquare size={16} />
                      Work
                    </Link>
                  )}
                  <ChevronRight size={14} />
                  <strong>{activeChat?.title || "Conversation"}</strong>
                  {activeChat?.delegatedFrom && (
                    <Link
                      href={`/conversation/${activeChat.delegatedFrom.chatId}`}
                    >
                      From {activeChat.delegatedFrom.agentName}
                    </Link>
                  )}
                </div>
                <span className="product-private">
                  <Lock size={13} />
                  Private
                </span>
              </header>
            )}
            {actualChatId && activeChat && (
              <DelegatedWork
                chatId={actualChatId}
                revision={activeChat.updatedAt}
                watching={activeChat.messages.some((m) =>
                  m.trace?.some((t) => ["delegate_task", "delegate_tasks"].includes(t.tool)),
                )}
              />
            )}
            {scopeError ? (
              <Unavailable text={scopeError} />
            ) : actualChatId && (!conversation || scopeLoading) ? (
              <Loading />
            ) : agent ? (
              <>
                <div className="product-conversation">
                  <Workspace
                    key={actualChatId || podId || "new"}
                    productMode
                    workspaceOrganizationId={user.organizationId}
                    workspaceUserId={user.id}
                    employeeId={agent.id}
                    podId={pod?.id}
                    workspaceName={pod?.name}
                    conversationId={actualChatId || "new"}
                    initialPrompt={!actualChatId ? initialPrompt : undefined}
                  />
                </div>
                {!actualChatId && !ready && (
                  <div className="product-first-use">
                    <span className="product-setup-icon">
                      <PlugIcon />
                    </span>
                    <div>
                      <strong>Connect a model to start working</strong>
                      <p>
                        {admin
                          ? "Add OpenAI or Anthropic once for your organization. You can explore agents and create Pods now."
                          : "Ask your workspace owner to connect OpenAI or Anthropic. You can explore agents and create Pods now."}
                      </p>
                    </div>
                    <Link className="secondary" href="/settings">
                      {admin ? "Connect model" : "View connections"}
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <Unavailable text="This agent is unavailable. Choose another agent from the library." />
            )}
          </>
        ) : view === "conversations" ? (
          <ConversationsIndex agents={allAgents} pods={pods} modelConnected={ready} />
        ) : view === "quality" ? (
          <QualityWorkspace admin={admin} />
        ) : view === "skills" ? (
          <SkillsLibrary admin={admin} />
        ) : view === "my-work" ? (
          <MyWork />
        ) : view === "work" && entityId ? (
          <WorkDetail key={`${user.organizationId}:${user.id}:${entityId}`} runId={entityId} />
        ) : view === "inbox" ? (
          <WorkInbox />
        ) : view === "agents" ? (
          <AgentCatalog agents={allAgents} onArchive={archiveAgent} />
        ) : view === "studio" ? (
          entityId && !agent ? (
            <Unavailable text="This agent is unavailable in your organization." />
          ) : (
            <AgentStudio
              availableAgents={allAgents}
              initialToolkit={params.get("toolkit") || undefined}
              agent={entityId ? agent : undefined}
              documents={allDocs}
              organizationName={user.organizationName}
              organizationId={user.organizationId}
              onCancel={() =>
                router.push(entityId ? "/agents/" + entityId : "/agents")
              }
              onSave={saveAgent}
            />
          )
        ) : view === "agent" ? (
          agent ? (
            <AgentDetail
              agent={agent}
              chats={allChats.filter((c) => c.agentId === agent.id)}
              onArchive={archiveAgent}
            />
          ) : (
            <Unavailable text="This agent is unavailable in your organization." />
          )
        ) : view === "pods" ? (
          <PodCatalog
            pods={pods}
            agents={agents}
            onCreate={() => setPodCreate(true)}
            onArchive={archivePod}
          />
        ) : view === "pod" ? (
          scopeError ? (
            <Unavailable text={scopeError} />
          ) : !pod || !scoped ? (
            <Loading />
          ) : (
            <>
              <header className="product-context-header pod">
                <div>
                  <Box size={20} />
                  <strong>{pod.name}</strong>
                  <span className="product-pod-access">
                    {pod.access === "private" ? (
                      <Lock size={12} />
                    ) : (
                      <Users size={13} />
                    )}
                  </span>
                </div>
                <Link
                  className="product-icon-button"
                  href={"/pods/" + pod.id + "/settings"}
                  aria-label="Pod settings"
                >
                  <Settings2 size={17} />
                </Link>
              </header>
              <nav className="product-context-tabs" aria-label="Pod tabs">
                {[
                  ["conversations", "Conversations", MessageSquare],
                  ["files", "Files", FolderOpen],
                  ["tasks", "Tasks", ListTodo],
                  ["settings", "Settings", Settings2],
                ].map(([id, label, Icon]) => {
                  const I = Icon as typeof Box;
                  return (
                    <Link
                      key={id as string}
                      href={
                        "/pods/" +
                        pod.id +
                        (id === "conversations" ? "" : "/" + id)
                      }
                      className={
                        (section || "conversations") === id ? "active" : ""
                      }
                    >
                      <I size={16} />
                      {label as string}
                    </Link>
                  );
                })}
              </nav>
              {pod.archived && (
                <div className="product-first-use archived">
                  <Archive size={18} />
                  <div>
                    <strong>This Pod is archived</strong>
                    <p>
                      Its files and history are preserved. Restore it to start
                      new work.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      archivePod(pod, false).catch((e) =>
                        setScopeError(e.message),
                      )
                    }
                  >
                    Restore Pod
                  </button>
                </div>
              )}
              {(section || "conversations") === "conversations" ? (
                <div className="product-page-scroll product-pod-conversations">
                  {!pod.archived && (
                    <Workspace
                      key={pod.id + ":" + pod.defaultAgentId}
                      employeeId={pod.defaultAgentId}
                      podId={pod.id}
                      workspaceName={pod.name}
                      productMode
                      workspaceOrganizationId={user.organizationId}
                    workspaceUserId={user.id}
                      conversationId="new"
                    />
                  )}
                  <ConversationHistory
                    chats={scopedChats}
                    agents={allAgents}
                    podName={pod.name}
                  />
                </div>
              ) : section === "files" ? (
                <div className="product-page-scroll">
                  <FileLibrary
                    podId={pod.id}
                    documents={
                      (scoped.records.filter((r) => r.kind === "document") ||
                        []) as Document[]
                    }
                    companyDocuments={companyDocs}
                    onChange={onChange}
                  />
                </div>
              ) : section === "tasks" ? (
                <div className="product-page-scroll">
                  <PodTasks
                    podId={pod.id}
                    agents={agents}
                    onConversation={(id) => router.push("/conversation/" + id)}
                    onChange={onChange}
                  />
                </div>
              ) : section === "activity" ? (
                <div className="product-page-scroll">
                  <Activity
                    agents={agents}
                    podId={pod.id}
                    onOpen={(c) => router.push(conversationHref(c))}
                  />
                </div>
              ) : (
                <div className="product-page-scroll">
                  <PodSettings
                    pod={pod}
                    agents={agents}
                    canEdit={pod.ownerId === user.id || admin}
                    onSave={savePod}
                    onArchive={() => archivePod(pod, true)}
                  />
                </div>
              )}
            </>
          )
        ) : view === "spaces" ? (
          <>
            <header className="product-page-head">
              <div>
                <h1>Company knowledge</h1>
                <p>
                  Reference material your agents can use across projects. Pod
                  files stay in their own project.
                </p>
              </div>
            </header>
            <div className="product-page-scroll">
              <FileLibrary documents={companyDocs} onChange={onChange} />
            </div>
          </>
        ) : view === "connections" ? (
          <>
            <header className="product-page-head">
              <div>
                <h1>App connections</h1>
                <p>
                  Connect the accounts your agents need. You choose which apps
                  each agent can use.
                </p>
              </div>
            </header>
            <div className="product-page-scroll">
              <Connections onSettings={() => router.push("/settings")} />
              <MCPConnections admin={admin} />
            </div>
          </>
        ) : view === "settings" ? (
          <SettingsView
            section={params.get("section") || "models"}
            admin={admin}
            agents={agents}
            onChange={onChange}
          />
        ) : null}
      </>
    ) : null;
  return (
    <ProductShell
      user={user}
      pods={pods}
      chats={shellChats}
      activePodId={podId}
      onSearch={onSearch}
    >
      {pageContent}
      {notice && (
        <div className="product-toast" role="status">
          <Check size={16} />
          {notice}
          <button
            className="product-icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {searchOpen && (
        <ProductModal
          title="Search your workspace"
          onClose={() => setSearchOpen(false)}
        >
          <label className="product-search-field modal-search">
            <Search size={17} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search workspace"
              placeholder="Find an agent, Pod, or conversation…"
            />
          </label>
          <div className="product-search-results">
            {[
              {
                name: "Agents",
                items: agents.map((a) => ({
                  id: a.id,
                  title: a.name,
                  text: a.description,
                  href: "/agents/" + a.id,
                  icon: Bot,
                })),
              },
              {
                name: "Pods",
                items: pods
                  .filter((p) => !p.archived)
                  .map((p) => ({
                    id: p.id,
                    title: p.name,
                    text: p.description,
                    href: "/pods/" + p.id,
                    icon: Box,
                  })),
              },
              {
                name: "Conversations",
                items: allChats.map((c) => ({
                  id: c.id,
                  title: c.title,
                  text: "Your conversation",
                  href: conversationHref(c),
                  icon: MessageSquare,
                })),
              },
            ].map((group) => {
              const list = group.items
                .filter((i) =>
                  (i.title + " " + i.text)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .slice(0, 8);
              return list.length ? (
                <section key={group.name}>
                  <h3>{group.name}</h3>
                  {list.map((i) => (
                    <Link
                      href={i.href}
                      key={i.id}
                      onClick={() => setSearchOpen(false)}
                    >
                      <i.icon size={16} />
                      <span>
                        <strong>{i.title}</strong>
                        <small>{i.text}</small>
                      </span>
                      <ChevronRight size={14} />
                    </Link>
                  ))}
                </section>
              ) : null;
            })}
          </div>
        </ProductModal>
      )}
      {podCreate && (
        <CreatePod
          agents={agents}
          onClose={() => {
            setPodCreate(false);
            if (params.has("create")) router.replace("/pods");
          }}
          onCreate={async (p) => {
            await request("/api/pods", p);
            await refresh();
            setPodCreate(false);
            router.push("/pods/" + p.id);
          }}
        />
      )}
    </ProductShell>
  );
}
function Loading() {
  return (
    <div className="product-loading" role="status">
      <Loader2 className="spin" size={21} />
      Loading…
    </div>
  );
}
function Unavailable({ text }: { text: string }) {
  return (
    <div className="product-empty">
      <h1>This item isn’t available</h1>
      <p role="alert">{text}</p>
      <Link className="secondary" href="/">
        Return to Work
      </Link>
    </div>
  );
}
function PlugIcon() {
  return <ShieldCheck size={20} />;
}
