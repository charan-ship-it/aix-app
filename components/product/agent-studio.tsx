"use client";
import { AgentSkills } from "./agent-skills";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Sparkles,
  Wrench,
  Bot,
  BookOpen,
} from "lucide-react";
import {
  agentSchema,
  builtinToolCatalog,
  normalizeAgent,
  toolkitCatalog,
  type AgentConfig,
} from "@/lib/agent-config";
import { connectedDefault } from "@/lib/employee-models";
import type { Document } from "@/lib/workspace";
import type { ProviderSettingsData } from "@/components/platform/provider-settings";
import "./agent-studio.css";
import { ToolPermissions, WorkflowEditor } from "./tool-permissions";
import { MCPPermissions } from "./mcp-permissions";
import { integrationScenarios } from "@/lib/integration-tests";

const templates: Array<{
  name: string;
  description: string;
  instructions: string;
  tools: AgentConfig["tools"];
  starters: string[];
  delegateAgentIds?: string[];
}> = [
  {
    name: "Team coordinator",
    description:
      "Plan a task, involve approved specialists, and bring back a clear result.",
    instructions:
      "Help the user turn a goal into a useful outcome. Clarify missing requirements and agree what a successful result looks like. Use approved specialist delegation only when it adds value, sharing the minimum task context needed. Specialists can research and draft; they cannot take external actions. Review their actual outputs and failure states before combining results. Cite sources, explain uncertainty, and return decisions that need the user. Never claim a message was sent or an action completed without tool evidence.",
    tools: ["knowledge_search", "current_time"],
    starters: [
      "Help me plan and coordinate this project",
      "Research this question and prepare a draft for review",
    ],
    delegateAgentIds: ["research", "content"],
  },
  {
    name: "Study partner",
    description: "Turn your notes into explanations and useful practice.",
    instructions:
      "Help the user learn from their permitted notes and documents. Ask about their goal and current understanding. Explain concepts clearly, cite the source documents, and use short practice questions to check understanding. Separate source-backed facts from general explanation. Do not invent source material or claim to have checked an answer without evidence.",
    tools: ["knowledge_search", "calculator"],
    starters: [
      "Explain a difficult idea from my notes",
      "Quiz me on the material I uploaded",
    ],
  },
  {
    name: "Decision partner",
    description: "Compare options using your criteria and available evidence.",
    instructions:
      "Help compare options against criteria the user provides. Ask for missing criteria or source material. Use permitted documents and clearly cite evidence. Identify tradeoffs, uncertainty, and information that could change the choice. Never fabricate current prices, features, or research. Produce a comparison and a reasoned recommendation for the user to decide.",
    tools: ["knowledge_search", "calculator"],
    starters: [
      "Compare these options using my documents",
      "Help me make a decision with clear tradeoffs",
    ],
  },
  {
    name: "Knowledge assistant",
    description: "Find clear answers in your team's documents.",
    instructions:
      "Answer questions using the knowledge sources you have been given. Search those sources before answering company questions and cite document names. Separate confirmed facts from assumptions. When information is missing, say so and ask a focused follow-up question. Never invent company facts.",
    tools: ["knowledge_search"],
    starters: [
      "Help me find an answer in our documents",
      "Summarize the key points of a document",
    ],
  },
  {
    name: "Meeting preparation",
    description: "Turn scattered context into a useful meeting brief.",
    instructions:
      "Prepare concise meeting briefs using selected company knowledge and any connected apps available to you. Ask which meeting to prepare for when the request is unclear. Cover the meeting goal, known participants, relevant history, open questions, and recommended next steps. Cite sources and never invent participants or commitments. Ask for approval before taking external actions.",
    tools: ["knowledge_search", "current_time"],
    starters: ["Help me prepare for an upcoming meeting"],
  },
  {
    name: "Content partner",
    description: "Draft and refine writing for your audience.",
    instructions:
      "Help draft and improve clear, useful content. Ask about the audience, goal, format, and desired voice when they are missing. Use selected company knowledge for brand or product facts. Do not invent customer examples, statistics, or claims. Offer a strong first draft and explain material assumptions briefly.",
    tools: ["knowledge_search"],
    starters: [
      "Help me turn an idea into a first draft",
      "Improve the clarity of this piece",
    ],
  },
];
const tabs = [
  { id: "instructions", name: "Instructions", icon: FileText },
  { id: "skills", name: "Skills", icon: FileText },
  { id: "knowledge", name: "Knowledge", icon: BookOpen },
  { id: "tools", name: "Tools & apps", icon: Wrench },
  { id: "workflow", name: "Workflow", icon: FileText },
  { id: "model", name: "Model", icon: Bot },
] as const;
type Tab = (typeof tabs)[number]["id"];

export function AgentStudio({
  agent,
  documents,
  onSave,
  onCancel,
  organizationName,
  organizationId,
  initialToolkit,
  availableAgents = [],
}: {
  agent?: AgentConfig;
  documents: Document[];
  onSave: (agent: AgentConfig, test?: boolean) => Promise<void>;
  onCancel: () => void;
  organizationName?: string;
  organizationId?: string;
  initialToolkit?: string;
  availableAgents?: AgentConfig[];
}) {
  const starterApp = toolkitCatalog.find((t) => t.slug === initialToolkit);
  const [draft, setDraft] = useState<AgentConfig>(() => ({
    ...normalizeAgent(
      agent || {
        id: crypto.randomUUID(),
        name: "Untitled agent",
        description: "",
        instructions: "Help the user with clear, accurate, practical answers.",
        model: "claude-sonnet-4-6",
        provider: "anthropic",
        category: "General",
        icon: "sparkles",
        color: "orange",
        knowledgeScope: "selected",
        documentIds: [],
      },
    ),
    ...(!agent
      ? starterApp
        ? {
            name: `${starterApp.name} assistant`,
            description: starterApp.description,
            instructions: `Help the user work with ${starterApp.name}. Use only permitted tools and the user's connected account. Ask for missing information and approval before external actions. Report tool failures honestly.`,
            toolkits: [starterApp.slug],
            workflow: [
              {
                title: integrationScenarios[starterApp.slug].title,
                instructions: integrationScenarios[starterApp.slug].query,
              },
              {
                title: "Summarize findings",
                instructions:
                  "Summarize the tool results with source references. If the call failed or data is missing, explain what is needed before continuing.",
              },
            ],
          }
        : { name: "", instructions: "" }
      : {}),
  }));
  const [stage, setStage] = useState<
    "choice" | "describe" | "templates" | "editor"
  >(agent || starterApp ? "editor" : "choice");
  const [tab, setTab] = useState<Tab>("instructions");
  const editorScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editorScroll.current) editorScroll.current.scrollTop = 0;
  }, [tab, stage]);
  const [settings, setSettings] = useState<ProviderSettingsData | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | "test" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const storageKey =
    "aix-agent-draft:" +
    (organizationId || organizationName || "workspace") +
    ":" +
    (agent?.id || (starterApp ? "new:" + starterApp.slug : "new"));
  const restoredDraft = useRef(false),
    savedDraft = useRef(false);
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const item = JSON.parse(stored);
        const parsed = agentSchema
          .extend({
            name: z.string().max(60),
            instructions: z.string().max(16000),
            workflow: z
              .array(
                z.object({
                  title: z.string().max(100),
                  instructions: z.string().max(2000),
                }),
              )
              .max(20)
              .default([]),
          })
          .safeParse(item.draft);
        if (parsed.success) {
          setDraft(parsed.data);
          restoredDraft.current = true;
          if (
            ["choice", "describe", "templates", "editor"].includes(item.stage)
          )
            setStage(item.stage);
          if (typeof item.goal === "string") setGoal(item.goal.slice(0, 4000));
          if (tabs.some((t) => t.id === item.tab)) setTab(item.tab);
          setNotice("Your unsaved draft has been restored.");
        }
      }
    } catch {
    } finally {
      setStorageReady(true);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!storageReady || savedDraft.current) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ draft, stage, tab, goal }),
      );
    } catch {}
  }, [draft, stage, tab, goal, storageKey, storageReady]);
  const patch = (value: Partial<AgentConfig>) =>
    setDraft((d) => ({ ...d, ...value }));
  async function loadSettings() {
    setSettingsError("");
    try {
      const r = await fetch("/api/settings");
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not load model connections.");
      setSettings(data);
      if (!agent && !restoredDraft.current) {
        const selection = connectedDefault(data.providers);
        if (selection) setDraft((d) => ({ ...d, ...selection }));
      }
    } catch (e) {
      setSettingsError((e as Error).message);
    }
  }
  useEffect(() => {
    loadSettings();
  }, []);
  const provider = settings?.providers.find(
    (p) => p.provider === draft.provider,
  );
  const models = provider?.models || [];
  const connected = !!provider?.configured;
  const toggle = (key: "tools" | "toolkits" | "documentIds", value: string) =>
    patch({
      [key]: draft[key].includes(value as never)
        ? draft[key].filter((v) => v !== value)
        : [...draft[key], value],
    });
  async function save(test: boolean) {
    setError("");
    const parsed = agentSchema.safeParse({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      instructions: draft.instructions.trim(),
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      setTab(
        field === "model" || field === "provider" ? "model" : "instructions",
      );
      setError(
        field === "name"
          ? "Give your agent a name."
          : field === "instructions"
            ? "Add instructions of at least 20 characters so your agent knows what to do."
            : "Check the agent's settings before saving.",
      );
      return;
    }
    if (test && !connected) {
      setTab("model");
      setError(
        "Connect a model in organization settings before testing. You can save your agent now.",
      );
      return;
    }
    setBusy(test ? "test" : "save");
    try {
      await onSave(parsed.data, test);
      savedDraft.current = true;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
    } catch (e) {
      setError(
        (e as Error).message || "Could not save your agent. Please try again.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function draftJob() {
    setError("");
    setBusy("draft");
    try {
      const r = await fetch("/api/agents/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          provider: draft.provider,
          model: draft.model,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Could not draft your agent.");
      const parsed = normalizeAgent({ ...draft, ...data, id: draft.id });
      setDraft(parsed);
      setStage("editor");
      setNotice(
        "Your draft is ready. Review its instructions and access before saving.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="studio-v2">
      <header className="studio-v2-header">
        <div>
          <button
            type="button"
            className="studio-v2-back"
            disabled={!!busy}
            onClick={
              stage === "choice" || agent
                ? onCancel
                : () => {
                    setStage("choice");
                    setError("");
                  }
            }
          >
            <ArrowLeft size={16} />
            {stage === "choice" || agent ? "Back" : "Choose a starting point"}
          </button>
          <h1>{agent ? "Edit agent" : "Create an agent"}</h1>
          <p>
            {stage === "editor"
              ? "Define what it does, what it knows, and which tools it can use."
              : "Give a repeatable job to an agent your team can work with."}
          </p>
        </div>
        {stage === "editor" && (
          <span className="studio-v2-org">
            {organizationName || "Your workspace"}
          </span>
        )}
      </header>
      {error && (
        <div className="studio-v2-error" role="alert">
          {error}
        </div>
      )}
      {stage !== "editor" ? (
        <main className="studio-v2-start">
          {stage === "choice" && (
            <>
              <div className="studio-v2-intro">
                <h2>What will your agent help with?</h2>
                <p>
                  Start with a job, use a ready-made starting point, or write
                  your own instructions.
                </p>
              </div>
              <div className="studio-v2-choices">
                <button type="button" onClick={() => setStage("describe")}>
                  <Sparkles size={23} />
                  <h3>Describe a job</h3>
                  <p>
                    Tell us the outcome. AI drafts instructions and suggests
                    access for you to review.
                  </p>
                  <span>
                    Draft with AI <ArrowRight size={15} />
                  </span>
                </button>
                <button type="button" onClick={() => setStage("templates")}>
                  <BookOpen size={23} />
                  <h3>Use a template</h3>
                  <p>
                    Choose a useful starting point, then make it fit the way
                    your team works.
                  </p>
                  <span>
                    Browse templates <ArrowRight size={15} />
                  </span>
                </button>
                <button type="button" onClick={() => setStage("editor")}>
                  <FileText size={23} />
                  <h3>Start from scratch</h3>
                  <p>
                    Write instructions yourself and choose knowledge, tools, and
                    a model.
                  </p>
                  <span>
                    Open editor <ArrowRight size={15} />
                  </span>
                </button>
              </div>
              <p className="studio-v2-footnote">
                Agents can work in conversations and Pods. You choose their
                access before saving.
              </p>
            </>
          )}
          {stage === "templates" && (
            <>
              <div className="studio-v2-intro">
                <h2>A useful starting point</h2>
                <p>
                  Each template includes instructions you can review and change.
                </p>
              </div>
              <div className="studio-v2-choices">
                {templates.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => {
                      patch({
                        ...t,
                        delegateAgentIds: t.delegateAgentIds || [],
                      });
                      setStage("editor");
                    }}
                  >
                    <BookOpen size={23} />
                    <h3>{t.name}</h3>
                    <p>{t.description}</p>
                    <span>
                      Use template <ArrowRight size={15} />
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
          {stage === "describe" && (
            <form
              className="studio-v2-job"
              onSubmit={(e) => {
                e.preventDefault();
                draftJob();
              }}
            >
              <h2>Describe the job</h2>
              <label htmlFor="studio-v2-goal">
                What should your agent help your team accomplish?
              </label>
              <textarea
                id="studio-v2-goal"
                autoFocus
                value={goal}
                minLength={10}
                maxLength={4000}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Prepare account briefs before sales calls. Use our product documents and CRM, cite sources, and ask before updating anything."
              />
              <p>
                Include the audience, information it needs, and what a useful
                result looks like.
              </p>
              {!connected && (
                <div className="studio-v2-note">
                  AI drafting needs a connected model.{" "}
                  <Link href="/settings">Open model settings</Link>, or{" "}
                  <button type="button" onClick={() => setStage("templates")}>
                    use a template
                  </button>{" "}
                  to continue.
                </div>
              )}
              <button
                className="studio-v2-primary"
                disabled={!!busy || goal.trim().length < 10 || !connected}
                type="submit"
              >
                {busy === "draft" ? (
                  <>
                    <Loader2 size={15} className="studio-v2-spin" />
                    Drafting…
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    Draft agent
                  </>
                )}
              </button>
            </form>
          )}
        </main>
      ) : (
        <>
          <div className="studio-v2-editor-layout" ref={editorScroll}>
            <main className="studio-v2-editor">
              <div
                className="studio-v2-tabs"
                role="tablist"
                aria-label="Agent settings"
              >
                {tabs.map(({ id, name, icon: Icon }) => (
                  <button
                    key={id}
                    id={"studio-v2-tab-" + id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls={"studio-v2-panel-" + id}
                    tabIndex={tab === id ? 0 : -1}
                    disabled={!!busy}
                    onClick={() => setTab(id)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                        e.preventDefault();
                        const index = tabs.findIndex((t) => t.id === tab);
                        const next =
                          tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]
                            .id;
                        setTab(next);
                        document
                          .getElementById("studio-v2-tab-" + next)
                          ?.focus();
                      }
                    }}
                  >
                    <Icon size={15} />
                    {name}
                  </button>
                ))}
              </div>
              {notice && (
                <div className="studio-v2-note" role="status">
                  <Check size={15} />
                  {notice}
                </div>
              )}
              <fieldset
                disabled={!!busy}
                className="studio-v2-panel"
                role="tabpanel"
                id={"studio-v2-panel-" + tab}
                aria-labelledby={"studio-v2-tab-" + tab}
              >
                {tab === "skills" && <AgentSkills selected={draft.skillIds} toolkits={draft.toolkits} onChange={(skillIds) => patch({skillIds})} />}
                {tab === "instructions" && (
                  <>
                    <div className="studio-v2-section">
                      <h2>Give your agent a clear purpose</h2>
                      <p>
                        A good agent has a specific job and knows what a useful
                        answer looks like.
                      </p>
                    </div>
                    <label>
                      Name
                      <input
                        autoFocus
                        maxLength={60}
                        value={draft.name}
                        onChange={(e) => patch({ name: e.target.value })}
                        placeholder="e.g. Account brief assistant"
                      />
                    </label>
                    <label>
                      Description
                      <input
                        maxLength={160}
                        value={draft.description}
                        onChange={(e) => patch({ description: e.target.value })}
                        placeholder="A short description your team will recognize"
                      />
                    </label>
                    <label>
                      Instructions
                      <textarea
                        className="studio-v2-instructions"
                        minLength={20}
                        maxLength={16000}
                        value={draft.instructions}
                        onChange={(e) =>
                          patch({ instructions: e.target.value })
                        }
                        placeholder="Describe the role, the steps to follow, the expected result, and anything the agent should ask before doing."
                      />
                    </label>
                    <p className="studio-v2-hint">
                      Be specific about sources, format, and what to do when
                      information is missing.
                    </p>
                    <details>
                      <summary>
                        Conversation starters & advanced settings
                      </summary>
                      <label>
                        Conversation starters
                        <textarea
                          value={draft.starters.join("\n")}
                          onChange={(e) =>
                            patch({
                              starters: e.target.value
                                .split("\n")
                                .slice(0, 4)
                                .map((s) => s.slice(0, 300)),
                            })
                          }
                          placeholder="One suggested prompt per line, up to four"
                        />
                      </label>
                      <label>
                        Category
                        <input
                          maxLength={50}
                          value={draft.category}
                          onChange={(e) => patch({ category: e.target.value })}
                        />
                      </label>
                      <label>
                        Maximum steps per response
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={draft.maxSteps}
                          onChange={(e) =>
                            patch({ maxSteps: Number(e.target.value) })
                          }
                        />
                      </label>
                    </details>
                  </>
                )}
                {tab === "knowledge" && (
                  <>
                    <div className="studio-v2-section">
                      <h2>Choose what it can reference</h2>
                      <p>
                        Give the agent useful context without opening
                        information it does not need.
                      </p>
                    </div>
                    <label>
                      Knowledge access
                      <select
                        value={draft.knowledgeScope}
                        onChange={(e) =>
                          patch({
                            knowledgeScope: e.target
                              .value as AgentConfig["knowledgeScope"],
                          })
                        }
                      >
                        <option value="selected">Selected documents</option>
                        <option value="all">
                          All shared company knowledge
                        </option>
                        <option value="none">No company knowledge</option>
                      </select>
                    </label>
                    {draft.knowledgeScope === "selected" &&
                      (documents.length ? (
                        <div className="studio-v2-checks">
                          {documents.map((d) => (
                            <label key={d.id}>
                              <input
                                type="checkbox"
                                checked={draft.documentIds.includes(d.id)}
                                onChange={() => toggle("documentIds", d.id)}
                              />
                              <span>
                                <strong>{d.name}</strong>
                                <small>
                                  {d.status === "failed"
                                    ? "Indexing failed · review this source"
                                    : d.status === "queued" ||
                                        d.status === "indexing"
                                      ? "Preparing for search"
                                      : "Company document"}
                                </small>
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="studio-v2-empty">
                          <BookOpen size={24} />
                          <h3>No company documents yet</h3>
                          <p>
                            You can save the agent now and add knowledge later.
                          </p>
                        </div>
                      ))}
                    {draft.knowledgeScope !== "none" && (
                      <label className="studio-v2-check">
                        <input
                          type="checkbox"
                          checked={draft.tools.includes("knowledge_search")}
                          onChange={() => toggle("tools", "knowledge_search")}
                        />
                        <span>
                          Enable knowledge search
                          <small>
                            Required for the agent to retrieve information from
                            these documents.
                          </small>
                        </span>
                      </label>
                    )}
                  </>
                )}
                {tab === "tools" && (
                  <>
                    <div className="studio-v2-section">
                      <h2>Give it the tools for the job</h2>
                      <p>Enable only the capabilities this agent needs.</p>
                    </div>
                    <h3>Built-in tools</h3>
                    <div className="studio-v2-checks">
                      {builtinToolCatalog.map((t) => (
                        <label key={t.id}>
                          <input
                            type="checkbox"
                            checked={draft.tools.includes(
                              t.id as AgentConfig["tools"][number],
                            )}
                            onChange={() => toggle("tools", t.id)}
                          />
                          <span>
                            <strong>{t.name}</strong>
                            <small>{t.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <h3>Connected apps</h3>
                    <p className="studio-v2-hint">
                      Selecting an app makes its tools available when the person
                      using the agent has connected an account.{" "}
                      <Link href="/connections">Manage & test connections</Link>
                    </p>
                    <div className="studio-v2-checks">
                      {toolkitCatalog.map((t) => (
                        <label key={t.slug}>
                          <input
                            type="checkbox"
                            checked={draft.toolkits.includes(t.slug)}
                            onChange={() => toggle("toolkits", t.slug)}
                          />
                          <span>
                            <strong>{t.name}</strong>
                            <small>{t.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {draft.toolkits.map((t) => (
                      <details key={t} className="studio-tool-scope">
                        <summary>
                          {toolkitCatalog.find((a) => a.slug === t)?.name} tool
                          permissions
                        </summary>
                        <ToolPermissions
                          toolkit={t}
                          selected={draft.toolPermissions[t] || []}
                          onChange={(slugs) => {
                            const next = { ...draft.toolPermissions };
                            if (slugs) next[t] = slugs;
                            else delete next[t];
                            patch({ toolPermissions: next });
                          }}
                        />
                      </details>
                    ))}
                    <MCPPermissions
                      scopes={draft.mcpTools}
                      onChange={(mcpTools) => patch({ mcpTools })}
                    />
                    <h3>Specialist delegation</h3>
                    <p className="studio-v2-hint">
                      Let this agent hand research and drafting tasks to
                      selected specialists. A handoff or parallel batch requires your approval,
                      uses the same workspace and project access, and returns a
                      linked conversation. Specialists cannot use external apps
                      or delegate further. Up to two specialists per run; independent drafting tasks can run in parallel.
                    </p>
                    <div className="studio-v2-checks">
                      {availableAgents
                        .filter((a) => a.id !== draft.id && !a.archived)
                        .map((a) => (
                          <label key={a.id}>
                            <input
                              type="checkbox"
                              checked={draft.delegateAgentIds.includes(a.id)}
                              disabled={
                                !draft.delegateAgentIds.includes(a.id) &&
                                draft.delegateAgentIds.length >= 10
                              }
                              onChange={(e) =>
                                patch({
                                  delegateAgentIds: e.target.checked
                                    ? [...draft.delegateAgentIds, a.id]
                                    : draft.delegateAgentIds.filter(
                                        (id) => id !== a.id,
                                      ),
                                })
                              }
                            />
                            <span>
                              <strong>{a.name}</strong>
                              <small>{a.description}</small>
                            </span>
                          </label>
                        ))}
                    </div>
                    <label>
                      External actions
                      <select
                        value={draft.externalPolicy}
                        onChange={(e) =>
                          patch({
                            externalPolicy: e.target
                              .value as AgentConfig["externalPolicy"],
                          })
                        }
                      >
                        <option value="ask">
                          Ask for approval before actions
                        </option>
                        <option value="read-only">Read-only tools</option>
                      </select>
                    </label>
                  </>
                )}
                {tab === "workflow" && (
                  <WorkflowEditor
                    steps={draft.workflow}
                    onChange={(workflow) => patch({ workflow })}
                  />
                )}
                {tab === "model" && (
                  <>
                    <div className="studio-v2-section">
                      <h2>Choose a model</h2>
                      <p>
                        The agent uses your organization's model account. You
                        can change this later.
                      </p>
                    </div>
                    {settingsError && (
                      <div className="studio-v2-note">
                        {settingsError}
                        <button type="button" onClick={loadSettings}>
                          Retry
                        </button>
                      </div>
                    )}
                    <label>
                      Provider
                      <select
                        value={draft.provider}
                        onChange={(e) => {
                          const provider = e.target
                            .value as AgentConfig["provider"];
                          const next = settings?.providers.find(
                            (p) => p.provider === provider,
                          )?.models[0];
                          patch({
                            provider,
                            model:
                              next ||
                              (provider === "openai"
                                ? "gpt-5.2"
                                : "claude-sonnet-4-6"),
                          });
                        }}
                      >
                        <option value="anthropic">Anthropic</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </label>
                    <label>
                      Model
                      <select
                        value={draft.model}
                        onChange={(e) => patch({ model: e.target.value })}
                      >
                        {!models.includes(draft.model) && (
                          <option value={draft.model}>{draft.model}</option>
                        )}
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div
                      className={
                        "studio-v2-note " +
                        (connected ? "studio-v2-connected" : "")
                      }
                    >
                      {connected ? (
                        <>
                          <Check size={16} />
                          Organization model connected
                        </>
                      ) : (
                        <>
                          This provider is not connected. Save your agent and{" "}
                          <Link href="/settings">connect a model</Link> before
                          testing.
                        </>
                      )}
                    </div>
                  </>
                )}
              </fieldset>
            </main>
            <aside className="studio-v2-summary">
              <span className="studio-v2-avatar">
                <Sparkles size={23} />
              </span>
              <h2>{draft.name || "Your new agent"}</h2>
              <p>
                {draft.description ||
                  "A focused agent your team can return to for a specific job."}
              </p>
              <dl>
                <div>
                  <dt>Model</dt>
                  <dd>{draft.model}</dd>
                </div>
                <div>
                  <dt>Knowledge</dt>
                  <dd>
                    {draft.knowledgeScope === "all"
                      ? "Shared company knowledge"
                      : draft.knowledgeScope === "none"
                        ? "No company knowledge"
                        : `${draft.documentIds.length} selected documents`}
                  </dd>
                </div>
                <div>
                  <dt>Skills</dt>
                  <dd>{draft.skillIds.length} reusable procedures</dd>
                </div>
                <div>
                  <dt>Tools</dt>
                  <dd>
                    {draft.tools.length} built-in · {draft.toolkits.length} apps
                    {draft.mcpTools.length
                      ? ` · ${draft.mcpTools.reduce((n, s) => n + s.tools.length, 0)} MCP tools`
                      : ""}
                    {draft.delegateAgentIds.length
                      ? ` · ${draft.delegateAgentIds.length} specialists`
                      : ""}
                  </dd>
                </div>
              </dl>
              <div className="studio-v2-test-guide">
                <h3>Try a real conversation</h3>
                <p>
                  Save & test opens a new conversation with this agent. Give it
                  a representative request, check its sources, and refine the
                  instructions.
                </p>
                {!connected && (
                  <p>
                    A model connection is needed to run the test. Saving is
                    available now.
                  </p>
                )}
              </div>
              <p className="studio-v2-hint">
                Saving makes this agent available in your organization's agent
                library.
              </p>
            </aside>
          </div>
          <footer className="studio-v2-footer">
            <button
              type="button"
              className="studio-v2-cancel"
              disabled={!!busy}
              onClick={onCancel}
            >
              Cancel
            </button>
            <div>
              <button
                type="button"
                className={
                  connected ? "studio-v2-secondary" : "studio-v2-primary"
                }
                disabled={!!busy}
                onClick={() => save(false)}
              >
                {busy === "save" ? "Saving…" : "Save agent"}
              </button>
              <button
                type="button"
                className={
                  connected ? "studio-v2-primary" : "studio-v2-secondary"
                }
                disabled={!!busy || !connected}
                title={
                  !connected ? "Connect a model to test this agent" : undefined
                }
                onClick={() => save(true)}
              >
                {busy === "test" ? (
                  <>
                    <Loader2 size={15} className="studio-v2-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    Save & test <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
