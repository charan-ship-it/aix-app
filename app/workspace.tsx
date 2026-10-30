"use client";
import { RunFeedback } from "@/components/product/run-feedback";
import { PodsNav } from "@/components/employees/pods-nav";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ProviderStatus } from "@/components/platform/provider-settings";
import {
  ArrowUpRight,
  Bot,
  ChevronRight,
  Code2,
  Globe,
  Lightbulb,
  Loader2,
  Menu,
  Paperclip,
  Search,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  ShieldCheck,
  Workflow,
  LogOut,
} from "lucide-react";
import {
  MessageSquare,
  Sparkles,
  Settings2,
  Layers3,
  Plus,
  Trash2,
  FileText,
  Folder,
  Plug,
  ChevronDown,
  ArrowUp,
  ArrowRight,
  Check,
  Copy,
  PenLine,
  MoreHorizontal,
  X,
  CircleHelp,
  ChartNoAxesCombined,
  BookOpen,
} from "@/components/mike-icons";
import {
  agents as defaults,
  prompts,
  type Agent,
  type Chat,
  type Document,
} from "@/lib/workspace";
import { InfrastructureStatus } from "@/components/platform/infrastructure";
import { KnowledgeSearch } from "@/components/platform/knowledge-search";
import { AgentBuilder } from "@/components/platform/agent-builder";
import { ProviderSettings } from "@/components/platform/provider-settings";
import { Connections } from "@/components/platform/connections";
import { Activity, Schedules } from "@/components/platform/activity";
import {
  OrganizationPicker,
  TeamSettings,
} from "@/components/platform/organizations";
import { authClient } from "@/lib/auth-client";
import type { AgentConfig } from "@/lib/agent-config";
const icons: Record<
  string,
  React.ComponentType<{ size?: number; strokeWidth?: number }>
> = {
  sparkles: Sparkles,
  search: Search,
  pen: PenLine,
  chart: ChartNoAxesCombined,
  workflow: Workflow,
  code: Code2,
  book: BookOpen,
  bulb: Lightbulb,
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const I = icons[name] || Sparkles;
  return <I size={size} strokeWidth={1.7} />;
}
function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={"brand-mark " + (small ? "small" : "")} aria-hidden="true">
      <img className="brand-dark" src="/brand/aix-icon-dark.png" alt="" />
      <img className="brand-light" src="/brand/aix-icon.png" alt="" />
    </span>
  );
}
export function AgentIcon({
  agent,
  small = false,
}: {
  agent: Agent;
  small?: boolean;
}) {
  return (
    <span className={`agent-icon ${agent.color} ${small ? "compact" : ""}`}>
      <Icon name={agent.icon} size={small ? 16 : 23} />
    </span>
  );
}
function toolLabel(name: string) {
  return (
    (
      {
        knowledge_search: "Search company knowledge",
        calculator: "Calculate",
        current_time: "Read date and time",
        extract_transcript_actions: "Extract transcript action items",
        COMPOSIO_SEARCH_TOOLS: "Find connected app tools",
        COMPOSIO_MULTI_EXECUTE_TOOL: "Use connected apps",
        COMPOSIO_GET_TOOL_SCHEMAS: "Read tool inputs",
      } as Record<string, string>
    )[name] || name.replaceAll("_", " ")
  );
}
type Page =
  "chat" | "agents" | "knowledge" | "integrations" | "settings" | "activity";
export default function Workspace({
  employeeId,
  podId,
  workspaceName,
  productMode,
  workspaceOrganizationId,
  workspaceUserId,
  homeFooter,
  initialPrompt,
  conversationId,
}: {
  employeeId?: string;
  podId?: string;
  workspaceName?: string;
  productMode?: boolean;
  workspaceOrganizationId?: string;
  workspaceUserId?: string;
  homeFooter?: React.ReactNode;
  initialPrompt?: string;
  conversationId?: string | null;
} = {}) {
  const router = useRouter();
  const workspaceUrl = podId
    ? "/api/workspace?podId=" + encodeURIComponent(podId)
    : employeeId
      ? "/api/workspace?agentId=" + encodeURIComponent(employeeId)
      : "/api/workspace";
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [density, setDensity] = useState("default");
  const [collapsed, setCollapsed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [organization, setOrganization] = useState<{
    id: string;
    name: string;
    role: string;
  } | null>(null);
  const watching = useRef(new Set<string>());
  const [runningChats, setRunningChats] = useState<Record<string, string>>({});
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [composerError, setComposerError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [settingsTab, setSettingsTab] = useState("models");
  const [pendingDelete, setPendingDelete] = useState<{
    kind: string;
    data: Chat | Agent | Document;
  } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const followTail = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [page, setPage] = useState<Page>("chat");
  const [allAgents, setAgents] = useState<Agent[]>(defaults);
  const [chats, setChats] = useState<Chat[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [agentId, setAgentId] = useState(employeeId || "xcelerate");
  const [input, setInput] = useState("");
  const draftKey =
    "aix-draft:" +
    (workspaceOrganizationId || organization?.id || "loading") +
    ":" +
    (workspaceUserId || "legacy") +
    ":" +
    (podId || employeeId || "workspace") +
    ":" +
    (active ||
      (conversationId && conversationId !== "new" ? conversationId : "new"));
  useEffect(() => {
    try {
      setInput(sessionStorage.getItem(draftKey) ?? (conversationId === "new" ? initialPrompt || "" : ""));
    } catch {
      setInput(conversationId === "new" ? initialPrompt || "" : "");
    }
  }, [draftKey, initialPrompt, conversationId]);
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || !!(active && runningChats[active]);
  const [signedIn, setSignedIn] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState("Your workspace");
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<
    "agent" | "search" | "help" | "delete" | null
  >(null);
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState("All agents");
  const [viewDoc, setViewDoc] = useState<Document | null>(null);
  const [attached, setAttached] = useState<Document | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teamAgents = [
    ...allAgents.filter((a) => !defaults.some((d) => d.id === a.id)).reverse(),
    ...allAgents.filter((a) => defaults.some((d) => d.id === a.id)),
  ];
  const current = chats.find((c) => c.id === active);
  const agent = allAgents.find((a) => a.id === agentId) || defaults[0];
  const missingAgent = loaded && !allAgents.some((a) => a.id === agentId);
  const missingChat = loaded && !!active && !current;
  const contextDocuments =
    agent.knowledgeScope === "none"
      ? []
      : agent.knowledgeScope === "selected"
        ? documents.filter((d) => agent.documentIds?.includes(d.id))
        : documents;
  function toast(s: string) {
    setNotice(s);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 5000);
  }
  async function load() {
    try {
      const r = await fetch(workspaceUrl);
      if (r.status === 401) {
        setSignedIn(false);
        return;
      }
      const d = (await r.json()) as {
        error?: string;
        records: any[];
        employee?: Agent;
        agents?: Agent[];
        providers?: ProviderStatus[];
        live: boolean;
        user: string;
        content: string;
        sources: string[];
        demo: boolean;
        organization: { id: string; name: string; role: string };
      };
      if (!r.ok) throw Error(d.error || "Request failed. Please try again.");
      setWorkspaceError("");
      setSignedIn(true);
      setProviders(d.providers || []);
      setUser(d.user);
      setOrganization(d.organization);
      setChats(d.records.filter((r: any) => r.kind === "chat"));
      setDocuments(d.records.filter((r: any) => r.kind === "document"));
      const custom = d.records.filter((r: any) => r.kind === "agent");
      setAgents(
        employeeId && !podId && !productMode && d.employee
          ? [d.employee]
          : [
              ...(d.agents ||
                defaults.map(
                  (a) => custom.find((c: any) => c.id === a.id) || a,
                )),
              ...custom.filter(
                (c: any) => !defaults.some((a) => a.id === c.id),
              ),
            ].map((a) =>
              podId
                ? {
                    ...a,
                    documentIds: [
                      ...new Set([
                        ...(a.documentIds || []),
                        ...d.records
                          .filter((r: any) => r.kind === "document")
                          .map((r: any) => r.id),
                      ]),
                    ],
                  }
                : a,
            ),
      );
    } catch (e) {
      setWorkspaceError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    restoreLocation();
    window.addEventListener("popstate", restoreLocation);
    load();
    try {
      setTheme(
        localStorage.getItem("aix-theme") === "light" ? "light" : "dark",
      );
      setCollapsed(localStorage.getItem("aix-sidebar") === "collapsed");
      const saved = localStorage.getItem("aix-density");
      if (saved && ["default", "comfortable", "compact"].includes(saved))
        setDensity(saved);
    } catch {}
    return () => window.removeEventListener("popstate", restoreLocation);
  }, []);
  useEffect(() => {
    if (productMode) return;
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("aix-theme", theme);
    } catch {}
  }, [theme, productMode]);
  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem("aix-density", density);
    } catch {}
  }, [density]);
  function toggleSidebar() {
    setCollapsed((c) => {
      try {
        localStorage.setItem("aix-sidebar", c ? "open" : "collapsed");
      } catch {}
      return !c;
    });
  }

  useEffect(() => {
    if (followTail.current && thread.current)
      thread.current.scrollTop = thread.current.scrollHeight;
  }, [current?.messages, active]);
  useEffect(() => {
    viewport.current?.scrollTo(0, 0);
    followTail.current = true;
    setAwayFromBottom(false);
  }, [page, active]);
  useEffect(() => {
    if (!loaded || !active) return;
    const c = chats.find((c) => c.id === active);
    if (!c) return;
    setAgentId(c.agentId);
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => {
        const run = d.items?.find(
          (r: any) =>
            r.chatId === active && ["queued", "running"].includes(r.status),
        );
        if (run) watchRun(run.id, active);
      })
      .catch(() => {});
  }, [loaded, active]);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height =
      Math.min(textarea.current.scrollHeight, 180) + "px";
  }, [input]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setModal("search");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        newChat();
      }
      if (e.key === "Escape") {
        setModal(null);
        setPicker(false);
        setMobile(false);
        setViewDoc(null);
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!modal && !viewDoc) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const previous = document.activeElement as HTMLElement;
    const timer = setTimeout(() => {
      const first =
        dialog?.querySelector<HTMLElement>(
          "input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
        ) || dialog?.querySelector<HTMLElement>("button,a");
      first?.focus();
    }, 20);
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,textarea,select,a[href]",
        ),
      );
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", trap);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal, viewDoc]);
  async function save(kind: string, data: unknown, action = "save") {
    const r = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, data, action }),
    });
    if (!r.ok) {
      const d = (await r.json()) as {
        error?: string;
        records: any[];
        live: boolean;
        user: string;
        content: string;
        sources: string[];
        demo: boolean;
      };
      throw Error(d.error || "Request failed. Please try again.");
    }
  }
  function syncLocation(
    p: Page,
    chatId: string | null = active,
    selectedAgent = agentId,
  ) {
    if (productMode) {
      if (p !== "chat") {
        router.push(
          (
            {
              agents: "/agents",
              knowledge: "/spaces",
              integrations: "/connections",
              settings: "/settings",
              activity: "/settings?section=activity",
            } as Record<string, string>
          )[p] || "/",
        );
        return;
      }
      const params = new URLSearchParams();
      if (!chatId) {
        params.set("agent", selectedAgent);
        if (podId) params.set("pod", podId);
      }
      const url =
        "/conversation/" +
        (chatId || "new") +
        (params.size ? "?" + params : "");
      if (location.pathname + location.search !== url)
        history.pushState(null, "", url);
      return;
    }
    if (employeeId) {
      const url =
        (podId ? "/pods/" : "/agents/") +
        encodeURIComponent(podId || employeeId) +
        "/conversations/" +
        (chatId || "new");
      if (p !== "chat") {
        router.push(
          (podId ? "/pods/" : "/agents/") +
            encodeURIComponent(podId || employeeId) +
            "/" +
            (p === "knowledge" ? "files" : p === "integrations" ? "tools" : p),
        );
        return;
      }
      if (location.pathname !== url) history.pushState(null, "", url);
      return;
    }
    const params = new URLSearchParams();
    if (p !== "chat") params.set("view", p);
    else if (chatId) params.set("chat", chatId);
    else if (selectedAgent !== "xcelerate") params.set("agent", selectedAgent);
    const url = "/" + (params.size ? "?" + params : "");
    if (location.pathname + location.search !== url)
      history.pushState(null, "", url);
  }
  function restoreLocation() {
    if (productMode) {
      const segment = location.pathname.startsWith("/conversation/")
        ? location.pathname.split("/")[2]
        : null;
      setPage("chat");
      setActive(segment && segment !== "new" ? segment : null);
      setAgentId(
        new URLSearchParams(location.search).get("agent") ||
          employeeId ||
          "xcelerate",
      );
      return;
    }
    if (employeeId) {
      const segment = location.pathname.split("/")[4];
      setPage("chat");
      setAgentId(employeeId);
      setActive(segment && segment !== "new" ? segment : null);
      return;
    }
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    setPage(
      ["agents", "knowledge", "integrations", "settings", "activity"].includes(
        view || "",
      )
        ? (view as Page)
        : "chat",
    );
    setActive(params.get("chat"));
    setAgentId(params.get("agent") || "xcelerate");
    setComposerError("");
    const section = params.get("section");
    setSettingsTab(
      ["models", "team", "appearance", "system"].includes(section || "")
        ? section!
        : "models",
    );
    setMobile(false);
  }
  function selectSettingsTab(id: string) {
    setSettingsTab(id);
    const params = new URLSearchParams(location.search);
    if (id === "models") params.delete("section");
    else params.set("section", id);
    history.replaceState(null, "", "/?" + params);
  }
  function navigate(p: Page) {
    syncLocation(p);
    setPage(p);
    if (p === "settings") setSettingsTab("models");
    setMobile(false);
    setSearch("");
    setPicker(false);
    setComposerError("");
  }
  function openEmployee(id: string) {
    router.push("/agents/" + encodeURIComponent(id));
  }
  function newChat(id = employeeId || "xcelerate") {
    if (productMode) {
      router.push(
        "/conversation/new?agent=" +
          encodeURIComponent(id) +
          (podId ? "&pod=" + podId : ""),
      );
      setActive(null);
      setInput("");
      setAttached(null);
      setComposerError("");
      return;
    }
    if (!employeeId) {
      router.push("/agents/" + encodeURIComponent(id) + "/conversations/new");
      return;
    }
    syncLocation("chat", null, id);
    setActive(null);
    setAgentId(id);
    setInput("");
    setAttached(null);
    setComposerError("");
    setPage("chat");
    setMobile(false);
    setPicker(false);
    setTimeout(() => textarea.current?.focus(), 50);
  }
  function openChat(c: Chat) {
    if (productMode) {
      router.push("/conversation/" + c.id);
      return;
    }
    if (!employeeId) {
      router.push(
        (c.podId
          ? "/pods/" + c.podId
          : "/agents/" + encodeURIComponent(c.agentId)) +
          "/conversations/" +
          c.id,
      );
      return;
    }
    setActive(c.id);
    setAgentId(c.agentId);
    syncLocation("chat", c.id, c.agentId);
    setPage("chat");
    setMobile(false);
    setComposerError("");
    setInput("");
    setAttached(null);
    setModal(null);
    fetch("/api/runs")
      .then((r) => r.json())
      .then((d) => {
        const run = d.items?.find(
          (r: any) =>
            r.chatId === c.id && ["queued", "running"].includes(r.status),
        );
        if (run) watchRun(run.id, c.id);
      })
      .catch(() => {});
  }
  async function watchRun(runId: string, chatId: string) {
    if (watching.current.has(runId)) return;
    watching.current.add(runId);
    setRunningChats((prev) => ({ ...prev, [chatId]: runId }));
    setChats((chats) =>
      chats.map((c) =>
        c.id !== chatId
          ? c
          : {
              ...c,
              messages: [
                ...c.messages.filter((m) => m.runId !== runId),
                {
                  role: "assistant",
                  content: "",
                  runId,
                  agentName:
                    allAgents.find((a) => a.id === current?.agentId)?.name ||
                    agent.name,
                  trace: [],
                  pending: [],
                },
              ],
            },
      ),
    );
    try {
      let finished = false;
      let lastEvent = "";
      for (let reconnect = 0; reconnect < 5 && !finished; reconnect++) {
        const response = await fetch(
          "/api/runs/" +
            runId +
            "/events" +
            (lastEvent ? "?after=" + encodeURIComponent(lastEvent) : ""),
        );
        if (!response.ok || !response.body)
          throw Error(
            "Could not follow the run. Open Activity to check its status.",
          );
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (!block.startsWith("data: ")) continue;
            const event = JSON.parse(block.slice(6));
            if (event.eventId) lastEvent = event.eventId;
            if (event.type === "done") {
              if (event.data.chat)
                setChats((prev) => [
                  event.data.chat,
                  ...prev.filter((c) => c.id !== event.data.chat.id),
                ]);
              finished = true;
            } else if (event.type === "error") throw Error(event.data);
            else
              setChats((prev) =>
                prev.map((c) =>
                  c.id !== chatId
                    ? c
                    : {
                        ...c,
                        messages: c.messages.map((m) =>
                          m.runId !== runId
                            ? m
                            : event.type === "text"
                              ? { ...m, content: m.content + event.data }
                              : event.type === "tool"
                                ? {
                                    ...m,
                                    trace: [...(m.trace || []), event.data],
                                  }
                                : event.type === "tool-result"
                                  ? {
                                      ...m,
                                      trace: (m.trace || []).map((t) =>
                                        t.tool === event.data.tool &&
                                        t.status === "running"
                                          ? {
                                              ...t,
                                              status: event.data.error
                                                ? "failed"
                                                : "completed",
                                            }
                                          : t,
                                      ),
                                    }
                                  : event.type === "approval"
                                    ? {
                                        ...m,
                                        pending: [
                                          ...(m.pending || []),
                                          event.data,
                                        ],
                                      }
                                    : m,
                        ),
                      },
                ),
              );
          }
        }
      }
      if (!finished)
        toast("Your run is still active. Open Activity to reconnect.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      watching.current.delete(runId);
      setRunningChats((prev) => {
        const next = { ...prev };
        if (next[chatId] === runId) delete next[chatId];
        return next;
      });
    }
  }
  async function waitForDocument(id: string) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const r = await fetch(workspaceUrl);
      if (!r.ok) throw Error("Could not check document indexing.");
      const state = await r.json();
      const doc = state.records?.find((d: Document) => d.id === id);
      if (doc?.status === "ready") {
        setDocuments((prev) => prev.map((d) => (d.id === id ? doc : d)));
        return;
      }
      if (doc?.status === "failed")
        throw Error("Document indexing failed. Retry it from Knowledge.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw Error(
      "Document indexing is still running. Send again once it is ready.",
    );
  }
  async function reindex(d: Document) {
    try {
      await save("document", { id: d.id }, "reindex");
      setDocuments((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, status: "queued" } : x)),
      );
      toast("Document queued for indexing");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  async function send(text = input) {
    if (!text.trim() || busy || missingAgent || missingChat) return;
    if (!signedIn) {
      toast("Sign in to run your agents.");
      return;
    }
    if (
      !providers.find((p) => p.provider === (agent.provider || "anthropic"))
        ?.configured
    ) {
      setComposerError(
        `Connect ${agent.provider === "openai" ? "OpenAI" : "Anthropic Claude"} in Settings to use ${agent.name}. Your message will stay here.`,
      );
      return;
    }
    const message = text.trim();
    setComposerError("");
    setSubmitting(true);
    try {
      if (attached) {
        await save("document", attached);
        setDocuments((d) => [
          { ...attached, status: "queued" },
          ...d.filter((x) => x.id !== attached.id),
        ]);
        toast("Indexing your attachment…");
        await waitForDocument(attached.id);
        setAttached(null);
      }
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId,
          ...(podId ? { podId } : {}),
          message,
          ...(active ? { chatId: active } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setInput("");
      try {
        sessionStorage.removeItem(draftKey);
      } catch {}
      setSubmitting(false);
      syncLocation("chat", d.chat.id, agentId);
      setActive(d.chat.id);
      setChats((c) => [d.chat, ...c.filter((x) => x.id !== d.chat.id)]);
      await watchRun(d.runId, d.chat.id);
    } catch (e) {
      setComposerError((e as Error).message);
      setInput(message);
    } finally {
      setSubmitting(false);
    }
  }
  async function stopRun() {
    const id = active && runningChats[active];
    if (!id || stopping) return;
    setStopping(true);
    try {
      const r = await fetch("/api/runs/" + id + "/cancel", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      toast("Stopping this run…");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setStopping(false);
    }
  }
  async function approve(runId: string, approved: boolean) {
    try {
      const r = await fetch("/api/runs/" + runId + "/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await watchRun(runId, d.chatId);
    } catch (e) {
      toast((e as Error).message);
    }
  }
  function openBuilder(a?: Agent) {
    if (employeeId) {
      router.push(
        "/agents/" + encodeURIComponent(a?.id || agentId) + "/settings",
      );
      return;
    }
    setEditingAgent(a || null);
    setModal("agent");
  }
  async function saveAgent(a: AgentConfig, test = false) {
    await save("agent", a);
    setAgents((prev) => [...prev.filter((x) => x.id !== a.id), a]);
    setModal(null);
    if (!editingAgent || test)
      router.push(
        "/agents/" +
          encodeURIComponent(a.id) +
          (test ? "/conversations/new" : ""),
      );
    toast(
      editingAgent ? "Agent saved" : "Agent created. Add a task to test it.",
    );
  }
  useEffect(() => {
    if (
      page !== "knowledge" ||
      !documents.some((d) => ["queued", "indexing"].includes(d.status || ""))
    )
      return;
    const timer = setInterval(() => {
      fetch(workspaceUrl)
        .then((r) => r.json())
        .then((d) => {
          if (d.records)
            setDocuments(d.records.filter((r: any) => r.kind === "document"));
        })
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [page, documents]);
  async function upload(f: File | undefined) {
    if (!f) return;
    if (!/\.(txt|md|csv)$/i.test(f.name)) {
      toast("Please choose a text, Markdown, or CSV file.");
      return;
    }
    if (f.size > 200000) {
      toast("Please choose a file smaller than 200 KB.");
      return;
    }
    const d: Document = {
      id: crypto.randomUUID(),
      ...(podId ? { podId } : employeeId ? { agentId: employeeId } : {}),
      name: f.name,
      content: await f.text(),
      updatedAt: new Date().toISOString(),
    };
    if (page === "chat") {
      setAttached(d);
      toast("Document attached. It will be saved when you send.");
    } else {
      try {
        await save("document", d);
        setDocuments((prev) => [{ ...d, status: "queued" }, ...prev]);
        toast("Document queued for indexing");
      } catch (e) {
        toast((e as Error).message);
      }
    }
    if (file.current) file.current.value = "";
  }
  function remove(kind: string, data: Chat | Agent | Document) {
    setPendingDelete({ kind, data });
    setModal("delete");
  }
  async function deleteRecord(kind: string, data: Chat | Agent | Document) {
    try {
      await save(kind, data, "delete");
      if (kind === "document") {
        setDocuments((d) => d.filter((x) => x.id !== data.id));
        setViewDoc(null);
      }
      if (kind === "chat") {
        setChats((c) => c.filter((x) => x.id !== data.id));
        if (active === data.id) {
          setActive(null);
          syncLocation("chat", null);
        }
      }
      if (kind === "agent") setAgents((a) => a.filter((x) => x.id !== data.id));
      setModal(null);
      setPendingDelete(null);
      toast("Deleted");
    } catch (e) {
      toast((e as Error).message);
    }
  }
  const knowledgeLabel = (
    <span className="context-label">
      <span className="tiny-dot" />{" "}
      {contextDocuments.length
        ? `${contextDocuments.length} knowledge ${contextDocuments.length === 1 ? "source" : "sources"}`
        : agent.knowledgeScope === "none"
          ? "Knowledge disabled"
          : "No knowledge added"}
    </span>
  );
  const agentChooser = (
    <div className="composer-agent">
      <button
        type="button"
        className="agent-selector"
        aria-expanded={picker}
        onClick={() => setPicker(!picker)}
        disabled={busy || (!!employeeId && !podId && !productMode) || !!active}
        aria-label="Choose agent"
      >
        <AgentIcon agent={agent} small />
        {agent.name}
        <ChevronDown size={13} />
      </button>
      {picker && (
        <div className="agent-menu">
          {allAgents.map((a) => (
            <button
              type="button"
              key={a.id}
              onClick={() => {
                setAgentId(a.id);
                setPicker(false);
                setComposerError("");
                if (!active) syncLocation("chat", null, a.id);
              }}
            >
              <AgentIcon agent={a} small />
              <span>{a.name}</span>
              {a.id === agentId && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
  const composer = (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {!productMode && (
          <>
            {agentChooser}
            {knowledgeLabel}
          </>
        )}
        <label className="sr-only" htmlFor="prompt">
          Message your agent
        </label>
        <textarea
          ref={textarea}
          disabled={!loaded}
          rows={2}
          id="prompt"
          placeholder={`What would you like to work on?`}
          value={input}
          maxLength={20000}
          onChange={(e) => {
            setInput(e.target.value);
            try {
              sessionStorage.setItem(draftKey, e.target.value);
            } catch {}
            setComposerError("");
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send();
            }
          }}
        />
        {attached && (
          <div className="attached">
            <FileText size={14} />
            {attached.name}
            <button
              type="button"
              aria-label="Remove attachment"
              onClick={() => setAttached(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="composer-tools">
          {productMode && agentChooser}
          <button
            type="button"
            className="tool"
            aria-label="Attach a document"
            title="Attach text or Markdown"
            onClick={() => file.current?.click()}
          >
            <Paperclip size={19} />
          </button>
          <button
            type="button"
            className="tool context-button"
            onClick={() => navigate("knowledge")}
          >
            <Globe size={17} />
            <span>Knowledge</span>
          </button>
          <span className="composer-spacer" />
          {productMode && knowledgeLabel}
          <span className="enter-hint">
            <kbd>↵</kbd> to send
          </span>
          {active && runningChats[active] ? (
            <button
              type="button"
              className="stop-run"
              aria-label="Stop run"
              title="Stop run"
              disabled={stopping}
              onClick={stopRun}
            >
              <span />
            </button>
          ) : (
            <button
              type="submit"
              className="send"
              disabled={
                !input.trim() || busy || !loaded || missingAgent || missingChat
              }
              aria-label="Send message"
            >
              {busy ? (
                <Loader2 size={19} className="spin" />
              ) : (
                <ArrowUp size={18} />
              )}
            </button>
          )}
        </div>
      </form>
      {composerError && (
        <div className="composer-error" role="alert">
          <span>{composerError}</span>
          <button
            onClick={() => {
              setSettingsTab("models");
              navigate("settings");
            }}
          >
            Open Settings
          </button>
        </div>
      )}
      <p className="composer-foot">
        <span>
          {agent.name} <span className="text-separator">/</span>{" "}
          {(agent.provider || "anthropic") === "openai" ? "OpenAI" : "Claude"}
        </span>
        <span>
          Enter to send <span className="text-separator">·</span> Shift + Enter
          for a new line
        </span>
      </p>
    </div>
  );
  return (
    <div
      className={`app ${employeeId || productMode ? "employee-chat-embedded" : ""} ${productMode ? "product-chat" : ""} ${collapsed ? "sidebar-collapsed" : ""} ${contextOpen ? "context-open" : ""}`}
    >
      <input
        ref={file}
        type="file"
        accept=".txt,.md,.csv"
        className="sr-only"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <div className="brand-row">
          <button
            className="workspace-brand"
            onClick={() => newChat()}
            title="AI Xccelerate home"
          >
            <Mark small />
            <span>
              Xccelerate
              <span className="workspace-caption">Employee workspace</span>
            </span>
          </button>
          <button
            className="collapse-nav tool"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
        </div>
        <OrganizationPicker />
        <button
          aria-label="New conversation"
          title="New conversation"
          className="new-chat"
          onClick={() => newChat()}
        >
          <Plus size={18} />
          <span className="nav-label">New conversation</span>
          <kbd>⌘ J</kbd>
        </button>
        <button
          aria-label="Search workspace"
          title="Search workspace"
          className="search-nav"
          onClick={() => setModal("search")}
        >
          <Search size={17} />
          <span className="nav-label">Search workspace</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="sidebar-scroll">
          <nav className="primary-nav">
            <button onClick={() => router.push("/pods")} aria-label="Pods">
              <Layers3 size={18} />
              <span className="nav-label">Pods</span>
            </button>
            <button
              aria-label="Conversations"
              title="Conversations"
              className={page === "chat" ? "active" : ""}
              onClick={() => navigate("chat")}
            >
              <MessageSquare size={18} />
              <span className="nav-label">Conversations</span>
            </button>
            <button
              aria-label="Agents"
              title="Agents"
              className={page === "agents" ? "active" : ""}
              onClick={() => navigate("agents")}
            >
              <Bot size={18} />
              <span className="nav-label">Agents</span>
              <span className="count">{allAgents.length}</span>
            </button>
            <button
              aria-label="Knowledge"
              title="Knowledge"
              className={page === "knowledge" ? "active" : ""}
              onClick={() => navigate("knowledge")}
            >
              <Layers3 size={18} />
              <span className="nav-label">Knowledge</span>
            </button>
            <button
              aria-label="Connections"
              title="Connections"
              className={page === "integrations" ? "active" : ""}
              onClick={() => navigate("integrations")}
            >
              <Plug size={18} />
              <span className="nav-label">Connections</span>
            </button>
            <button
              aria-label="Activity"
              title="Activity"
              className={page === "activity" ? "active" : ""}
              onClick={() => navigate("activity")}
            >
              <Workflow size={18} />
              <span className="nav-label">Activity & schedules</span>
            </button>
          </nav>
          <PodsNav />
          <div className="sidebar-section-title">
            Your team
            <button aria-label="Create an agent" onClick={() => openBuilder()}>
              <Plus size={15} />
            </button>
          </div>
          <div className="pinned-agents">
            {teamAgents.slice(0, 6).map((a) => (
              <button
                key={a.id}
                title={a.name}
                aria-label={a.name}
                onClick={() => openEmployee(a.id)}
              >
                <AgentIcon agent={a} small />
                <span className="nav-label">{a.name}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-section-title">Recent conversations</div>
          <div className="recent-chats">
            {chats.length ? (
              chats.slice(0, 7).map((c) => (
                <div
                  className={
                    "recent-row " + (active === c.id ? "selected" : "")
                  }
                  key={c.id}
                >
                  <button onClick={() => openChat(c)}>
                    <MessageSquare size={14} />
                    <span>{c.title}</span>
                  </button>
                  <button
                    className="delete-chat"
                    aria-label={`Delete ${c.title}`}
                    onClick={() => remove("chat", c)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            ) : (
              <p>
                Your next great idea
                <br />
                starts with a conversation.
              </p>
            )}
          </div>
        </div>
        <div className="sidebar-bottom">
          <button
            className="settings-nav theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            <span className="nav-label">
              {theme === "dark" ? "Light appearance" : "Dark appearance"}
            </span>
            <span className="theme-switch" />
          </button>
          <button
            aria-label="Workspace settings"
            title="Settings"
            className="settings-nav"
            onClick={() => navigate("settings")}
          >
            <Settings2 size={17} />
            <span className="nav-label">Settings</span>
          </button>
          <button className="profile" onClick={() => navigate("settings")}>
            <span className="avatar">
              {user
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")
                .toUpperCase()}
            </span>
            <span className="profile-info">
              {signedIn ? user : "Welcome"}
              <small>{organization?.name || "Workspace"}</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      <main className="main" id="main-content">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu tool"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              {organization?.name || "Workspace"}
            </span>
            <ChevronRight size={13} />
            <span>
              {
                {
                  chat: current?.title || "New conversation",
                  agents: "Agents",
                  knowledge: "Knowledge",
                  integrations: "Connections",
                  settings: "Settings",
                  activity: "Activity & schedules",
                }[page]
              }
            </span>
          </div>
          <div className="topbar-right">
            <button
              className={`context-toggle tool ${contextOpen ? "is-active" : ""}`}
              onClick={() => setContextOpen(!contextOpen)}
              aria-label="Toggle workspace context"
              aria-expanded={contextOpen}
            >
              <PanelRight size={17} />
              <span>Workspace context</span>
            </button>
            <button
              className="tool help-button"
              aria-label="Help"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        <div
          ref={viewport}
          className={`workspace-body ${page === "chat" && current ? "thread-view" : ""}`}
          aria-busy={!loaded}
        >
          {!loaded && (
            <div className="workspace-loading" role="status">
              <Loader2 className="spin" size={20} />
              <span>Loading your workspace…</span>
            </div>
          )}
          {workspaceError && (
            <div className="workspace-error" role="alert">
              <span>{workspaceError}</span>
              <button className="secondary" onClick={load}>
                Retry
              </button>
            </div>
          )}
          {!signedIn && loaded && (
            <div className="signin-banner">
              Make this workspace yours. Sign in to save agents, documents, and
              conversations.
              <a href="/sign-in" target="_top">
                Sign in
                <ArrowUpRight size={14} />
              </a>
            </div>
          )}
          {page === "chat" && (
            <div className={"chat-page " + (current ? "has-chat" : "")}>
              {!current ? (
                productMode ? (
                  <div className={"work-start " + (podId ? "in-pod" : "")}>
                    <div className="work-start-heading">
                      {!podId && <Mark />}
                      <h1>
                        {podId
                          ? workspaceName
                          : "What would you like to work on, " +
                            (user.split(" ")[0] || "there") +
                            "?"}
                      </h1>
                      <p>
                        {podId
                          ? "Conversations, files, and tasks for this project stay together here."
                          : "Start with a question. Choose an agent when you need a specialist."}
                      </p>
                    </div>
                    {missingAgent || missingChat ? (
                      <div className="composer-error" role="alert">
                        This conversation or agent is unavailable in this
                        organization.
                        <button onClick={() => router.push("/")}>
                          Return to Work
                        </button>
                      </div>
                    ) : (
                      composer
                    )}
                    {!podId && !current && (
                      <>
                        <div className="work-suggestions">
                          {[
                            {
                              title: "Turn a document into a clear summary",
                              text: "Summarize a document for me. Ask me to attach the source and tell you who the summary is for.",
                              icon: "book",
                            },
                            {
                              title: "Draft something for my next project",
                              text: "Help me draft something for my project. Ask me about the goal, audience, and context.",
                              icon: "pen",
                            },
                            {
                              title: "Think through a decision",
                              text: "Help me think through a decision. Ask me about my options, constraints, and what success looks like.",
                              icon: "bulb",
                            },
                          ].map((p) => (
                            <button
                              key={p.title}
                              onClick={() => {
                                setInput(p.text);
                                textarea.current?.focus();
                                try {
                                  sessionStorage.setItem(draftKey, p.text);
                                } catch {}
                              }}
                            >
                              <Icon name={p.icon} size={17} />
                              <span>{p.title}</span>
                              <ArrowRight size={15} />
                            </button>
                          ))}
                        </div>
                        <div className="work-start-links">
                          <button onClick={() => router.push("/agents")}>
                            Discover agents <ArrowUpRight size={14} />
                          </button>
                          <span>or</span>
                          <button onClick={() => router.push("/pods?create=1")}>
                            Create a project Pod <Plus size={14} />
                          </button>
                        </div>
                      </>
                    )}
                    {homeFooter}
                  </div>
                ) : (
                  <div className="welcome">
                    <div className="welcome-stage">
                      <div className="welcome-top">
                        <h1>
                          {missingChat
                            ? "Conversation unavailable"
                            : missingAgent
                              ? "Agent unavailable"
                              : podId
                                ? workspaceName || "New conversation"
                                : agentId === "xcelerate"
                                  ? "How can I help?"
                                  : agent.name}
                        </h1>
                        <p className="welcome-sub">
                          {agentId === "xcelerate"
                            ? "Ask a question or give your team a task."
                            : agent.description}
                        </p>
                      </div>
                      {(missingAgent || missingChat) && (
                        <div className="composer-error" role="alert">
                          <span>
                            This item was removed or is unavailable in this
                            organization.
                          </span>
                          <button onClick={() => newChat()}>
                            New conversation
                          </button>
                        </div>
                      )}
                      {agentId !== "xcelerate" &&
                        !missingAgent &&
                        !missingChat && (
                          <div className="employee-context">
                            <span>
                              <span
                                className={
                                  "tiny-dot " +
                                  (providers.find(
                                    (p) =>
                                      p.provider ===
                                      (agent.provider || "anthropic"),
                                  )?.configured
                                    ? "connected"
                                    : "")
                                }
                              />
                              {providers.find(
                                (p) =>
                                  p.provider ===
                                  (agent.provider || "anthropic"),
                              )?.configured
                                ? "Model connected"
                                : "Model setup needed"}
                            </span>
                            <button onClick={() => openBuilder(agent)}>
                              <Settings2 size={13} />
                              Configure agent
                            </button>
                          </div>
                        )}
                      {composer}
                      <div className="quick-prompts">
                        {(agent.starters?.length
                          ? agent.starters.map((p) => ({
                              title: p,
                              prompt: p,
                              icon: "sparkles",
                            }))
                          : prompts
                        ).map((p) => (
                          <button
                            key={p.title}
                            onClick={() => {
                              setInput(p.prompt);
                              textarea.current?.focus();
                            }}
                          >
                            <Icon name={p.icon} size={14} />
                            {p.title}
                            <ArrowUpRight size={12} />
                          </button>
                        ))}
                      </div>
                    </div>
                    {!employeeId && agentId === "xcelerate" && (
                      <section className="home-team">
                        <div className="section-line">
                          <div>
                            <h2>Your agents</h2>
                          </div>
                          <button onClick={() => navigate("agents")}>
                            View all agents
                            <ArrowRight size={15} />
                          </button>
                        </div>
                        <div className="team-grid">
                          {teamAgents
                            .filter((a) => a.id !== "xcelerate")
                            .slice(0, 4)
                            .map((a) => (
                              <button
                                className={`team-card team-${a.color}`}
                                key={a.id}
                                onClick={() => openEmployee(a.id)}
                              >
                                <div className="team-card-art">
                                  <span className="art-grid" />
                                  <span className="art-orbit" />
                                  <AgentIcon agent={a} />
                                  <span className="team-category">
                                    {a.category}
                                  </span>
                                  <ArrowUpRight size={17} />
                                </div>
                                <div className="team-card-info">
                                  <h3>{a.name}</h3>
                                  <p>{a.description}</p>
                                </div>
                              </button>
                            ))}
                        </div>
                      </section>
                    )}
                    {agentId !== "xcelerate" &&
                      chats.some((c) => c.agentId === agentId) && (
                        <section className="employee-recent">
                          <div className="section-line">
                            <h2>Recent work with {agent.name}</h2>
                          </div>
                          {chats
                            .filter((c) => c.agentId === agentId)
                            .slice(0, 4)
                            .map((c) => (
                              <button key={c.id} onClick={() => openChat(c)}>
                                <MessageSquare size={14} />
                                <span>{c.title}</span>
                                <ArrowRight size={14} />
                              </button>
                            ))}
                        </section>
                      )}
                  </div>
                )
              ) : (
                <>
                  <div
                    ref={thread}
                    className="conversation-scroll"
                    onScroll={() => {
                      const node = thread.current;
                      if (!node) return;
                      const away =
                        node.scrollHeight - node.scrollTop - node.clientHeight >
                        100;
                      followTail.current = !away;
                      setAwayFromBottom(away);
                    }}
                  >
                    <div className="conversation">
                      {current.messages.map((m, i) => (
                        <article
                          className={`message ${m.role} ${m.error ? "message-error" : ""}`}
                          key={i}
                        >
                          <span className="message-avatar">
                            {m.role === "user" ? (
                              <span className="avatar">You</span>
                            ) : (
                              <AgentIcon agent={agent} small />
                            )}
                          </span>
                          <div className="message-body">
                            <div className="message-author">
                              {m.role === "user"
                                ? "You"
                                : m.agentName || agent.name}
                              {m.demo && (
                                <span className="demo-label">
                                  Demo response
                                </span>
                              )}
                            </div>
                            <div className="message-text">
                              {m.content ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    a: ({ children, ...props }) => (
                                      <a
                                        {...props}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {children}
                                      </a>
                                    ),
                                  }}
                                >
                                  {m.content}
                                </ReactMarkdown>
                              ) : (
                                <span className="response-pending">
                                  <Loader2 size={15} className="spin" />{" "}
                                  {m.trace?.some((t) => t.status === "running")
                                    ? "Using tools…"
                                    : "Thinking…"}
                                </span>
                              )}
                            </div>
                            {productMode && m.role === "assistant" && m.runId && (
                              <Link className="work-detail-link" href={`/work/${encodeURIComponent(m.runId)}`}>
                                View work details <ArrowUpRight size={12} aria-hidden="true" />
                              </Link>
                            )}
                            {m.trace && m.trace.length > 0 && (
                              <details className="tool-trace">
                                <summary>
                                  {m.trace.length} tool call
                                  {m.trace.length === 1 ? "" : "s"}
                                </summary>
                                {m.trace.map((t, i) => (
                                  <div key={i}>
                                    <strong>{toolLabel(t.tool)}</strong>
                                    <span className="status-pill">
                                      {t.status}
                                    </span>
                                    <pre>
                                      {JSON.stringify(t.input, null, 2)}
                                    </pre>
                                    {t.output !== undefined && (
                                      <pre>
                                        {typeof t.output === "string"
                                          ? t.output
                                          : JSON.stringify(t.output, null, 2)}
                                      </pre>
                                    )}
                                  </div>
                                ))}
                              </details>
                            )}
                            {m.pending && m.pending.length > 0 && (
                              <div className="approval-card">
                                <strong>Review tool access</strong>
                                <p>
                                  This agent wants to execute the following tool
                                  calls with your connected accounts.
                                </p>
                                {m.pending.map((p) => (
                                  <details key={p.id} open>
                                    <summary>{toolLabel(p.tool)}</summary>
                                    <pre>
                                      {JSON.stringify(p.input, null, 2)}
                                    </pre>
                                  </details>
                                ))}
                                <div>
                                  <button
                                    className="primary"
                                    disabled={busy}
                                    onClick={() => approve(m.runId!, true)}
                                  >
                                    Approve & continue
                                  </button>
                                  <button
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() => approve(m.runId!, false)}
                                  >
                                    Deny
                                  </button>
                                </div>
                              </div>
                            )}
                            {m.usage && (
                              <small className="token-usage">
                                {m.usage.input.toLocaleString()} input tokens ·{" "}
                                {m.usage.output.toLocaleString()} output tokens
                              </small>
                            )}
                            {m.sources && m.sources.length > 0 && (
                              <div className="sources">
                                {m.sources.map((s) => (
                                  <span key={s}>
                                    <FileText size={12} />
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}
                            {productMode && m.role === "assistant" && m.runId && !m.demo && !m.pending?.length && !runningChats[current.id] && <RunFeedback runId={m.runId} />}
                            <button
                              className="copy-button"
                              aria-label="Copy message"
                              onClick={() =>
                                navigator.clipboard
                                  .writeText(m.content)
                                  .then(() => toast("Copied to clipboard"))
                                  .catch(() =>
                                    toast(
                                      "Could not copy. Select the text to copy manually.",
                                    ),
                                  )
                              }
                            >
                              <Copy size={13} />
                              Copy
                            </button>
                          </div>
                        </article>
                      ))}
                      <div ref={bottom} />
                    </div>
                  </div>
                  <div className="chat-composer">
                    {awayFromBottom && (
                      <button
                        className="jump-latest secondary"
                        onClick={() => {
                          followTail.current = true;
                          thread.current?.scrollTo({
                            top: thread.current.scrollHeight,
                            behavior: "smooth",
                          });
                          setAwayFromBottom(false);
                        }}
                      >
                        Jump to latest{" "}
                        <ArrowUp
                          size={14}
                          style={{ transform: "rotate(180deg)" }}
                        />
                      </button>
                    )}
                    {composer}
                  </div>
                </>
              )}
            </div>
          )}
          {page === "agents" && (
            <div className="content-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    <Bot size={14} />
                    The agent library
                  </p>
                  <h1>Your agents</h1>
                  <p>
                    Shared agents for your team. Configure their instructions,
                    tools, and knowledge.
                  </p>
                </div>
                <button className="primary" onClick={() => openBuilder()}>
                  <Plus size={17} />
                  Create agent
                </button>
              </div>
              <div className="filter-row">
                <div className="tabs">
                  {[
                    "All agents",
                    "General",
                    "Research",
                    "Marketing",
                    "Sales",
                    "Operations",
                    "Engineering",
                  ].map((f) => (
                    <button
                      key={f}
                      className={filter === f ? "selected" : ""}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <label className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search agents"
                    placeholder="Find an agent…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="agent-grid">
                {allAgents
                  .filter(
                    (a) =>
                      (filter === "All agents" || a.category === filter) &&
                      `${a.name} ${a.description}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((a) => (
                    <article className="agent-card" key={a.id}>
                      <div className="agent-card-top">
                        <AgentIcon agent={a} />
                        <span>
                          {defaults.some((d) => d.id === a.id)
                            ? "By AI Xccelerate"
                            : "Custom agent"}
                        </span>
                        {!defaults.some((d) => d.id === a.id) && (
                          <button
                            aria-label={`Delete ${a.name}`}
                            className="tool"
                            onClick={() => remove("agent", a)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <h2>{a.name}</h2>
                      <p>{a.description}</p>
                      <div className="agent-capabilities">
                        <span>
                          {a.provider === "openai" ? "OpenAI" : "Claude"}
                        </span>
                        <span>
                          {a.tools?.length ?? 1}{" "}
                          {(a.tools?.length ?? 1) === 1 ? "tool" : "tools"}
                        </span>
                        {!!a.toolkits?.length && (
                          <span>{a.toolkits.length} apps</span>
                        )}
                      </div>
                      <div className="agent-card-bottom">
                        <button
                          className="configure-agent"
                          onClick={() => openBuilder(a)}
                        >
                          Configure
                        </button>
                        <button onClick={() => openEmployee(a.id)}>
                          Open employee
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
              </div>
              {!allAgents.some(
                (a) =>
                  (filter === "All agents" || a.category === filter) &&
                  `${a.name} ${a.description}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              ) && (
                <div className="empty">
                  <Search />
                  <h2>No agents found</h2>
                  <p>Try a different search or create your own agent.</p>
                </div>
              )}
            </div>
          )}
          {page === "knowledge" && (
            <div className="content-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    <Layers3 size={14} />
                    Workspace knowledge
                  </p>
                  <h1>Company knowledge</h1>
                  <p>
                    Give your agents the context to be useful to your business.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => file.current?.click()}
                >
                  <Plus size={17} />
                  Add document
                </button>
              </div>
              <div className="knowledge-info">
                <ShieldCheck size={22} />
                <div>
                  <strong>Private knowledge. Better answers.</strong>
                  <p>
                    Documents are stored in your private workspace. Agents
                    retrieve relevant excerpts when you ask a question.
                  </p>
                </div>
              </div>
              <KnowledgeSearch />
              {documents.length ? (
                <div className="document-list">
                  <div className="table-head">
                    <span>Document</span>
                    <span>Added</span>
                    <span />
                  </div>
                  {documents.map((d) => (
                    <div className="document-row" key={d.id}>
                      <button onClick={() => setViewDoc(d)}>
                        <span className="file-icon">
                          <FileText size={20} />
                        </span>
                        <span>
                          <strong>{d.name}</strong>
                          <small>
                            {Math.ceil(d.content.length / 1024) || 1} KB ·{" "}
                            {d.status || "ready"}
                            {d.indexMode ? " · " + d.indexMode + " search" : ""}
                            {d.chunkCount
                              ? " · " + d.chunkCount + " chunks"
                              : ""}
                          </small>
                        </span>
                      </button>
                      <span>{new Date(d.updatedAt).toLocaleDateString()}</span>
                      <div className="document-actions">
                        <button
                          className="secondary"
                          aria-label={`Reindex ${d.name}`}
                          disabled={["queued", "indexing"].includes(
                            d.status || "",
                          )}
                          onClick={() => reindex(d)}
                        >
                          Reindex
                        </button>
                        <button
                          className="tool"
                          aria-label={`Delete ${d.name}`}
                          onClick={() => remove("document", d)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  className="upload-zone"
                  onClick={() => file.current?.click()}
                >
                  <span>
                    <FileText size={30} />
                  </span>
                  <h2>Bring your company context.</h2>
                  <p>
                    Add playbooks, product notes, or a project brief.
                    <br />
                    Your agents will take it from here.
                  </p>
                  <strong>
                    <Plus size={15} />
                    Choose a document
                  </strong>
                  <small>Text, Markdown, or CSV · Up to 200 KB per file</small>
                </button>
              )}
              <div className="knowledge-bottom">
                <BookOpen size={18} />
                <p>
                  Start with what matters: your brand guide, a team playbook, or
                  a recent project brief.
                </p>
              </div>
            </div>
          )}
          {page === "integrations" && (
            <div className="content-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    <Plug size={14} />
                    Connected tools
                  </p>
                  <h1>Connections</h1>
                  <p>Authorize the apps your agents can use.</p>
                </div>
              </div>
              <Connections onSettings={() => navigate("settings")} />
            </div>
          )}
          {page === "activity" && (
            <div className="content-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    <Workflow size={14} />
                    Background work
                  </p>
                  <h1>Activity & schedules</h1>
                  <p>Follow agent runs and schedule recurring work.</p>
                </div>
              </div>
              <Schedules agents={allAgents} />
              <Activity agents={allAgents} onOpen={openChat} />
            </div>
          )}
          {page === "settings" && (
            <div className="content-page settings-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    <Settings2 size={14} />
                    Preferences & setup
                  </p>
                  <h1>Workspace settings</h1>
                  <p>A clear view of what’s connected and what comes next.</p>
                </div>
              </div>
              <div
                className="settings-tabs"
                role="tablist"
                aria-label="Settings sections"
              >
                {[
                  ["models", "Models & API keys"],
                  ["team", "Team"],
                  ["appearance", "Preferences"],
                  ["system", "Infrastructure"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={settingsTab === id}
                    onClick={() => selectSettingsTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {settingsTab === "appearance" && (
                <>
                  {" "}
                  <section className="settings-section">
                    <h2>Workspace</h2>
                    <div className="setting-row">
                      <div>
                        <strong>AI Xccelerate</strong>
                        <p>{user}</p>
                      </div>
                      <span className="status-pill">
                        <ShieldCheck size={13} />
                        Private
                      </span>
                    </div>
                    <div className="setting-row">
                      <div>
                        <strong>Sign-in</strong>
                        <p>
                          {signedIn
                            ? "Your workspace data is scoped to your signed-in account."
                            : "Sign in to save your conversations and knowledge."}
                        </p>
                      </div>
                      <button
                        className="secondary"
                        onClick={async () => {
                          await authClient.signOut();
                          location.href = "/sign-in";
                        }}
                      >
                        Sign out
                        <LogOut size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="settings-section">
                    <h2>Appearance</h2>
                    <div className="setting-row">
                      <div>
                        <strong>Display density</strong>
                        <p>
                          Adjust control sizes and spacing across the workspace.
                        </p>
                      </div>
                      <div
                        className="density-options"
                        role="group"
                        aria-label="Display density options"
                      >
                        {["default", "comfortable", "compact"].map((d) => (
                          <button
                            key={d}
                            className={density === d ? "selected" : ""}
                            aria-pressed={density === d}
                            onClick={() => setDensity(d)}
                          >
                            {d[0].toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              )}
              {settingsTab === "models" && (
                <ProviderSettings
                  onChange={load}
                  admin={
                    organization?.role === "owner" ||
                    organization?.role === "admin"
                  }
                />
              )}
              {settingsTab === "team" && <TeamSettings />}
              {settingsTab === "system" && <InfrastructureStatus />}
            </div>
          )}
        </div>
      </main>
      {contextOpen && (
        <aside className="context-panel">
          <div className="context-heading">
            <span>
              <PanelRight size={17} />
              Workspace context
            </span>
            <button
              className="tool"
              aria-label="Close context"
              onClick={() => setContextOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="context-selected">
            <span className="context-kicker">Your thinking partner</span>
            <AgentIcon agent={agent} />
            <h2>{agent.name}</h2>
            <p>{agent.description}</p>
            <span className="status-pill">
              {providers.find(
                (p) => p.provider === (agent.provider || "anthropic"),
              )?.configured
                ? "Model connected"
                : "Model setup needed"}
            </span>
            <button className="secondary" onClick={() => openBuilder(agent)}>
              Configure agent
              <Settings2 size={14} />
            </button>
          </div>
          <div className="context-section">
            <h3>Your workspace</h3>
            <div>
              <span>
                <Bot size={15} />
                Agents
              </span>
              <strong>{allAgents.length}</strong>
            </div>
            <div>
              <span>
                <FileText size={15} />
                Knowledge sources
              </span>
              <strong>{documents.length}</strong>
            </div>
            <div>
              <span>
                <MessageSquare size={15} />
                Conversations
              </span>
              <strong>{chats.length}</strong>
            </div>
          </div>
          <div className="context-section context-docs">
            <h3>
              Available knowledge
              <button
                aria-label="Add knowledge"
                onClick={() => {
                  navigate("knowledge");
                  file.current?.click();
                }}
              >
                <Plus size={14} />
              </button>
            </h3>
            {documents.length ? (
              documents.slice(0, 5).map((d) => (
                <button key={d.id} onClick={() => setViewDoc(d)}>
                  <FileText size={15} />
                  <span>{d.name}</span>
                  <ArrowUpRight size={12} />
                </button>
              ))
            ) : (
              <div className="context-empty">
                <Folder size={24} />
                <p>Your knowledge belongs here.</p>
                <small>
                  Add documents so your agents can answer with context.
                </small>
                <button onClick={() => navigate("knowledge")}>
                  Add a source
                  <Plus size={13} />
                </button>
              </div>
            )}
          </div>
          <div className="context-bottom">
            <ShieldCheck size={17} />
            <p>
              Your documents and conversations stay in your private workspace.
            </p>
          </div>
        </aside>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {(modal || viewDoc) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setModal(null);
            setViewDoc(null);
          }}
        >
          <section
            className={"modal " + (modal === "agent" ? "builder-modal" : "")}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close tool"
              aria-label="Close dialog"
              onClick={() => {
                setModal(null);
                setViewDoc(null);
              }}
            >
              <X size={20} />
            </button>
            {modal === "agent" && (
              <AgentBuilder
                agent={editingAgent}
                documents={documents}
                onSave={saveAgent}
                onCancel={() => setModal(null)}
              />
            )}
            {modal === "search" && (
              <>
                <h2 id="modal-title">Find your next starting point.</h2>
                <label className="search-field modal-search">
                  <Search size={18} />
                  <input
                    autoFocus
                    aria-label="Search workspace"
                    placeholder="Search agents and conversations…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="search-results">
                  {allAgents
                    .filter((a) =>
                      a.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          openEmployee(a.id);
                          setModal(null);
                        }}
                      >
                        <AgentIcon agent={a} small />
                        <span>
                          {a.name}
                          <small>Agent</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  {chats
                    .filter((c) =>
                      c.title.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((c) => (
                      <button key={c.id} onClick={() => openChat(c)}>
                        <MessageSquare size={18} />
                        <span>
                          {c.title}
                          <small>Conversation</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                </div>
              </>
            )}
            {modal === "delete" && pendingDelete && (
              <>
                <h2 id="modal-title">
                  Delete this{" "}
                  {pendingDelete.kind === "chat"
                    ? "conversation"
                    : pendingDelete.kind}
                  ?
                </h2>
                <p>
                  “
                  {"name" in pendingDelete.data
                    ? pendingDelete.data.name
                    : pendingDelete.data.title}
                  ” will be removed
                  {pendingDelete.kind === "chat"
                    ? " from your history"
                    : " from the organization"}
                  . This cannot be undone.
                </p>
                <div className="dialog-actions">
                  <button className="secondary" onClick={() => setModal(null)}>
                    Cancel
                  </button>
                  <button
                    className="danger"
                    onClick={() =>
                      deleteRecord(pendingDelete.kind, pendingDelete.data)
                    }
                  >
                    Delete{" "}
                    {pendingDelete.kind === "chat"
                      ? "conversation"
                      : pendingDelete.kind}
                  </button>
                </div>
              </>
            )}
            {modal === "help" && (
              <>
                <span className="agent-icon orange">
                  <Lightbulb size={25} />
                </span>
                <h2 id="modal-title">A head start on good work.</h2>
                <p>
                  Pick a specialist agent or start with Xcelerate. Add documents
                  in Knowledge for answers with company context. Create an agent
                  to save your own instructions.
                </p>
                <div className="help-tip">
                  <strong>Try a little context.</strong>
                  <p>
                    Tell your agent the goal, the audience, and what a useful
                    result looks like.
                  </p>
                </div>
                <button
                  className="primary full"
                  onClick={() => {
                    setModal(null);
                    newChat();
                  }}
                >
                  Start a conversation
                  <ArrowUpRight size={16} />
                </button>
              </>
            )}
            {viewDoc && (
              <>
                <h2 id="modal-title">{viewDoc.name}</h2>
                <p>Workspace knowledge</p>
                <pre className="document-preview">{viewDoc.content}</pre>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
