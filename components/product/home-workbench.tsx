"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, CalendarDays, Check, ChevronRight, FileText, Lock, Mail, MessageSquare, RefreshCw, Sparkles } from "lucide-react";
import type { AgentConfig } from "@/lib/agent-config";
import type { ConversationIndexPage } from "@/lib/conversation-index";
import { request, type ProductData } from "@/lib/product-client";
import type { GettingStartedState as Setup, FirstTaskGoal as Goal } from "@/lib/getting-started";
import type { ProductUser } from "./product-shell";
import "./home-workbench.css";

// A starter requires explicit read tools, not merely a connected account or toolkit.
function canReadApp(agent: AgentConfig, toolkit: string, subject: RegExp) {
  return agent.toolkits.includes(toolkit) && (agent.toolPermissions[toolkit] || []).some(tool => /(?:^|_)(?:LIST|FETCH|SEARCH|GET)(?:_|$)/.test(tool) && subject.test(tool));
}

const goals = [
  { id: "follow-ups" as const, title: "Find my follow-ups", text: "Turn email and calendar context into a short list of next steps.", icon: Mail },
  { id: "transcript" as const, title: "Turn notes into action items", text: "Paste a transcript or meeting notes. No notetaker required.", icon: FileText },
  { id: "custom" as const, title: "Work through something else", text: "Bring a question, a draft, or a task of your own.", icon: Sparkles },
];
export const starterPrompts: Record<Goal, string> = {
  "follow-ups": "Review my connected email and calendar for the last 7 days. Identify follow-ups assigned to me or awaiting my response. Show a table with the action, supporting source, due date if explicitly stated, and what needs my review. Use only sources you can access; tell me about missing access. Do not send messages or change external records.",
  transcript: "Extract action items from the transcript or notes I paste below. Show a table with action, explicitly named owner, stated deadline, and supporting quote. Mark missing owners or dates as unspecified. Do not create external tasks.\n\nTranscript or notes:\n",
  custom: "Help me work through this task. Ask for any essential missing context, explain the proposed approach, and show the result here before taking external actions.\n\nMy task:\n",
};

export function HomeWorkbench({ user, agents, providers }: { user: ProductUser; agents: AgentConfig[]; providers: ProductData["providers"] }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recent, setRecent] = useState<ConversationIndexPage["items"]>([]);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    const c = new AbortController();
    setSetup(null); setSaving(false); setError(""); setRecent([]); setHistoryError(false);
    request<Setup>("/api/getting-started", undefined, c.signal).then(setSetup).catch(e => { if (!c.signal.aborted) setError(e.message); });
    request<ConversationIndexPage>("/api/conversations?limit=4", undefined, c.signal).then(d => setRecent(d.items)).catch(() => { if (!c.signal.aborted) setHistoryError(true); });
    return () => { generation.current++; c.abort(); };
  }, [user.organizationId, revision]);
  async function save(patch: Partial<Setup["preference"]>) {
    const currentGeneration = generation.current;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/getting-started", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your setup could not be saved.");
      if (currentGeneration === generation.current) setSetup(current => current ? { ...current, preference: data.preference } : current);
    } catch (e) { if (currentGeneration === generation.current) setError(e instanceof Error ? e.message : "Your setup could not be saved."); }
    finally { if (currentGeneration === generation.current) setSaving(false); }
  }
  const goal = setup?.preference.goal || "transcript";
  const selected = goals.find(g => g.id === goal)!;
  const activeAgents = agents.filter(a => !a.archived);
  const taskAgent = goal === "follow-ups"
    ? activeAgents.find(a => ["gmail", "outlook"].some(t => canReadApp(a, t, /EMAIL|MESSAGE/)) && canReadApp(a, "googlecalendar", /EVENT/))
    : goal === "transcript"
      ? activeAgents.find(a => a.tools.includes("extract_transcript_actions")) || activeAgents.find(a => a.id === "xcelerate")
      : activeAgents.find(a => a.id === "xcelerate");
  const showGuide = setup && !setup.preference.dismissed;
  const modelConfigured = taskAgent ? providers.some(p => p.provider === taskAgent.provider && p.configured) : !!setup?.model.ready;
  const draftHref = taskAgent ? `/conversation/new?agent=${encodeURIComponent(taskAgent.id)}&starter=${goal}` : null;
  return <>
    <header className="product-page-head workbench-head">
      <h1>Home</h1>
      <span className="workbench-private"><Lock size={14} aria-hidden="true" /> Your personal workspace</span>
    </header>
    <div className="product-page-scroll workbench-scroll">
      <div className="workbench">
        <section className="workbench-intro">
          <h2>What would you like to get done?</h2>
          <p>Start with one task. Bring in the context it needs, then review the result here.</p>
        </section>
        {error && <div className="workbench-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRevision(r => r + 1)}><RefreshCw size={14} aria-hidden="true" /> Retry</button></div>}
        <div className={"workbench-start " + (!showGuide ? "guide-hidden" : "")}>
          <section className="workbench-goals" aria-label="Choose a starting task">
            {goals.map(item => <button key={item.id} className={"workbench-goal " + (setup?.preference.goal === item.id && showGuide ? "chosen" : "")} aria-pressed={!!(setup?.preference.goal === item.id && showGuide)} disabled={!setup || saving} onClick={() => void save({ goal: item.id, dismissed: false })}>
              <span className="workbench-goal-icon"><item.icon size={21} aria-hidden="true" /></span>
              <span><strong>{item.title}</strong><small>{item.text}</small></span><ChevronRight size={18} aria-hidden="true" />
            </button>)}
            {!setup && !error && <p role="status" className="workbench-muted">Checking your workspace…</p>}
            <div className="workbench-build"><Bot size={17} aria-hidden="true" /><span>Have a repeatable job in mind?</span><Link href="/agents/new">Create an agent</Link></div>
          </section>
          {showGuide && <section className="workbench-guide" aria-labelledby="guide-title" aria-busy={saving}>
            <div className="workbench-guide-top"><span>Getting started</span><button disabled={saving} onClick={() => void save({ dismissed: true })}>Skip guide</button></div>
            <h3 id="guide-title">{selected.title}</h3>
            <p className="workbench-muted">Your progress is saved. You can leave and come back.</p>
            <ol className="workbench-steps">
              <li><span className={"workbench-step-mark " + (setup.preference.goal ? "done" : "")}>{setup.preference.goal ? <Check size={14} aria-hidden="true" /> : "1"}</span><div><strong>Choose your task</strong><p>This conversation starts private. Sharing with a team is a separate choice.</p></div></li>
              <li><span className="workbench-step-mark">2</span><div><strong>{goal === "follow-ups" ? "Connect your context" : "Bring your context"}</strong>
                {goal === "follow-ups" ? <><p>{setup.connections.status === "unavailable" ? "App connections haven’t been enabled for this workspace. Ask an owner or admin to set them up." : setup.connections.status === "error" ? "We couldn’t verify your accounts. Check connections before running." : "Use your own email and calendar accounts. Connecting an account doesn’t grant every agent access."}</p><div className="workbench-source-status"><span><Mail size={13} aria-hidden="true" /> Email: {setup.connections.status !== "ready" ? "not checked" : setup.connections.email ? "connected" : "not connected"}</span><span><CalendarDays size={13} aria-hidden="true" /> Calendar: {setup.connections.status !== "ready" ? "not checked" : setup.connections.calendar ? "connected" : "not connected"}</span></div><Link href="/connections">Manage my connections</Link>{taskAgent && <p>Confirm {taskAgent.name} has permission to read the same apps you connected. <Link href={`/agents/${encodeURIComponent(taskAgent.id)}`}>Review agent tools</Link></p>}{!taskAgent && <p>No agent has explicit email and calendar read tools configured yet. <Link href="/agents/new?toolkit=gmail">Configure an agent</Link></p>}</> : <p>{goal === "transcript" ? "Paste notes or a transcript into the task draft. Only include material you’re allowed to use." : "Describe your goal and add only the context needed for this task."}</p>}
              </div></li>
              <li><span className={"workbench-step-mark " + (modelConfigured ? "done" : "")}>{modelConfigured ? <Check size={14} aria-hidden="true" /> : "3"}</span><div><strong>{modelConfigured ? "Model configured for this agent" : "Enable AI for this workspace"}</strong><p>{modelConfigured ? "A model key is saved. Review the draft before sending; the run will report any connection errors." : setup.model.canManage ? "A workspace owner or admin needs to connect a model before tasks can run." : "Ask your workspace owner or admin to connect a model. You can prepare your draft now."}</p>{!modelConfigured && <Link href="/settings?section=models">{setup.model.canManage ? "Set up AI connection" : "View AI connection status"}</Link>}</div></li>
              <li><span className={"workbench-step-mark " + (setup.progress.hasCompletedRun ? "done" : "")}>{setup.progress.hasCompletedRun ? <Check size={14} aria-hidden="true" /> : "4"}</span><div><strong>{setup.progress.hasCompletedRun ? "You have a completed run" : "Run, review, and return"}</strong><p>{setup.progress.hasCompletedRun ? "Open your conversations to review results and continue the work." : "The conversation shows progress and tool approvals. Your result stays in conversation history."}</p></div></li>
            </ol>
            {draftHref ? <Link className="primary workbench-draft" href={draftHref}>Open task draft <ArrowRight size={16} aria-hidden="true" /></Link> : <Link className="secondary workbench-draft" href="/agents">Choose an agent</Link>}
            <small className="workbench-send-note">Opening a draft won’t send a message or run any tools.</small>
          </section>}
        </div>
        {setup?.preference.dismissed && <div className="workbench-resume"><p>Want a hand setting up your first task?</p><button className="secondary" disabled={saving} onClick={() => void save({ dismissed: false })}>Resume getting started</button></div>}
        <section className="workbench-recent" aria-labelledby="recent-title"><div className="workbench-section-heading"><h3 id="recent-title">Pick up where you left off</h3><Link href="/conversations">All conversations <ArrowRight size={14} aria-hidden="true" /></Link></div>
          {recent.length ? <div className="workbench-recent-list">{recent.map(chat => <Link key={chat.id} href={`/conversation/${encodeURIComponent(chat.id)}`}><MessageSquare size={17} aria-hidden="true" /><span><strong>{chat.title}</strong><small>{chat.agentName}{chat.podName ? ` · ${chat.podName}` : " · Private conversation"}</small></span><ChevronRight size={16} aria-hidden="true" /></Link>)}</div> : <div className="workbench-history-empty"><MessageSquare size={21} aria-hidden="true" /><p>{historyError ? "Recent conversations couldn’t be loaded. Open history to try again." : "Your saved conversations will appear here after you start a task."}</p></div>}
        </section>
        <p className="workbench-scope-note"><Lock size={13} aria-hidden="true" /> This page shows your conversations. Being a workspace owner doesn’t make other people’s private work visible here.</p>
      </div>
    </div>
  </>;
}
