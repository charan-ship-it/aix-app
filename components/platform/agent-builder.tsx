"use client";
import { connectedDefault } from "@/lib/employee-models";
import { useState, useEffect } from "react";
import {
  normalizeAgent,
  type AgentConfig,
  toolkitCatalog,
  builtinToolCatalog,
} from "@/lib/agent-config";
import type { Agent, Document } from "@/lib/workspace";
import type { ProviderSettingsData } from "./provider-settings";
const templates = [
  {
    name: "Knowledge assistant",
    description: "Answer questions using company documents.",
    instructions:
      "You are a company knowledge assistant. Search the selected knowledge library before answering. Cite document names for every factual claim. If the answer is not in the documents, say what is missing. Never invent company facts.",
    tools: ["knowledge_search"],
  },
  {
    name: "Meeting preparation",
    description: "Prepare a concise brief for an upcoming meeting.",
    instructions:
      "You are a meeting preparation assistant. Find relevant company context and use only the connected apps you have been given. Summarize the goal, participants, open questions, and useful next steps. Separate confirmed facts from assumptions. Ask for approval before changing anything.",
    tools: ["knowledge_search", "current_time"],
  },
  {
    name: "Sales research",
    description: "Prepare an evidence-based account brief.",
    instructions:
      "You are an account research assistant. Use company knowledge and available connected tools to identify account context, known opportunities, recent interactions, and practical next steps. Cite your sources. Never invent customer facts, pricing, or commitments.",
    tools: ["knowledge_search", "calculator"],
  },
];
export function AgentBuilder({
  agent,
  documents,
  onSave,
  onCancel,
}: {
  agent: Agent | null;
  documents: Document[];
  onSave: (a: AgentConfig, test?: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<AgentConfig>(() =>
      normalizeAgent(
        agent || {
          id: crypto.randomUUID(),
          name: "New agent",
          description: "",
          instructions:
            "Help the user with clear, accurate, practical answers.",
          model: "claude-sonnet-4-6",
          provider: "anthropic",
          category: "General",
          icon: "sparkles",
          color: "orange",
          knowledgeScope:"selected",documentIds:[],
        },
      ),
    ),
    [providers, setProviders] = useState<ProviderSettingsData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState("prompt"),
    [goal, setGoal] = useState(""),
    [drafting, setDrafting] = useState(false),
    [draftNote, setDraftNote] = useState("");
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setProviders(data);
        if (!agent && data.providers) {
          const selection = connectedDefault(data.providers);
          if (selection) setDraft((d) => ({ ...d, ...selection }));
        }
      })
      .catch(() => {});
  }, []);
  const patch = (value: Partial<AgentConfig>) =>
    setDraft((d) => ({ ...d, ...value }));
  const models =
    providers?.providers.find((p) => p.provider === draft.provider)?.models ||
    [];
  const toggle = (key: "tools" | "toolkits" | "documentIds", id: string) =>
    patch({
      [key]: (draft[key] as string[]).includes(id)
        ? draft[key].filter((v) => v !== id)
        : [...draft[key], id],
    });
  return (
    <form
      className="agent-builder"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          const result = normalizeAgent(draft);
          if (!result.name.trim() || !result.description.trim()) {
            setTab("prompt");
            throw Error("Add a name and description before saving.");
          }
          await onSave(result);
        } catch (e) {
          setError(
            "Check the agent name, model, and instructions. " +
              ((e as Error).name === "ZodError"
                ? "Instructions need at least 20 characters."
                : (e as Error).message),
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="builder-header">
        <span className="builder-kicker">Employee studio</span>
        <h2 id="modal-title">
          {agent ? "Configure agent" : "Create an agent"}
        </h2>
        <p>Choose its instructions, model, tools, and company knowledge.</p>
      </div>
      <div
        className="builder-tabs"
        role="tablist"
        aria-label="Agent configuration"
      >
        {[
          ["prompt", "Instructions"],
          ["model", "Model"],
          ["tools", "Tools & apps"],
          ["knowledge", "Knowledge"],
        ].map(([id, name]) => (
          <button
            type="button"
            key={id}
            className={tab === id ? "selected" : ""}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="builder-body">
        {tab === "prompt" && (
          <>
            <div className="ai-authoring">
              <h3>Build from a job description</h3>
              <p className="form-hint">
                Describe the role. AI will draft instructions and suggest tools
                for you to review.
              </p>{" "}
              <div className="draft-agent">
                <label>
                  Role and outcome
                  <input
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g. Prepare account briefs using company knowledge and CRM"
                  />
                </label>
                <button
                  className="secondary"
                  type="button"
                  disabled={drafting || goal.length < 10}
                  onClick={async () => {
                    setDrafting(true);
                    setError("");
                    try {
                      const r = await fetch("/api/agents/draft", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          goal,
                          provider: draft.provider,
                          model: draft.model,
                        }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw Error(d.error);
                      patch(d);
                      setError("");
                      setDraftNote(
                        "Draft ready. Review the instructions, suggested tools, and knowledge access before saving.",
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setDrafting(false);
                    }
                  }}
                >
                  {drafting ? "Drafting…" : "Draft employee"}
                </button>
              </div>
            </div>
            <label>
              Name
              <input
                autoFocus
                required
                maxLength={60}
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              Description
              <input
                required
                maxLength={160}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label>
              Instructions
              <textarea
                aria-label="Instructions"
                required
                minLength={20}
                maxLength={16000}
                value={draft.instructions}
                onChange={(e) => patch({ instructions: e.target.value })}
              />
            </label>
            <details className="builder-advanced">
              <summary>Templates & conversation starters</summary>{" "}
              <label>
                Start from a template
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const t = templates[Number(e.target.value)];
                    if (t)
                      patch({
                        name: t.name,
                        description: t.description,
                        instructions: t.instructions,
                        tools: t.tools as AgentConfig["tools"],
                      });
                  }}
                >
                  <option value="" disabled>
                    Select a template
                  </option>
                  {templates.map((t, i) => (
                    <option value={i} key={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={draft.category}
                  onChange={(e) => patch({ category: e.target.value })}
                >
                  {[
                    "General",
                    "Research",
                    "Marketing",
                    "Sales",
                    "Operations",
                    "Engineering",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Conversation starters
                <textarea
                  aria-label="Conversation starters"
                  value={draft.starters.join("\n")}
                  onChange={(e) =>
                    patch({
                      starters: e.target.value
                        .split("\n")
                        .filter(Boolean)
                        .slice(0, 4),
                    })
                  }
                  placeholder="One suggested prompt per line, up to four."
                />
              </label>
            </details>{" "}
          </>
        )}
        {tab === "model" && (
          <>
            <h3>Choose how this employee thinks</h3>
            <p className="form-hint">
              The model runs with your organization's API key. You can change it
              anytime.
            </p>{" "}
            <div className="builder-columns">
              <label>
                Provider
                <select
                  aria-label="Provider"
                  value={draft.provider}
                  onChange={(e) => {
                    const provider = e.target.value as "anthropic" | "openai";
                    patch({
                      provider,
                      model:
                        providers?.providers.find(
                          (p) => p.provider === provider,
                        )?.models[0] ||
                        (provider === "openai"
                          ? "gpt-5.2"
                          : "claude-sonnet-4-6"),
                    });
                  }}
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI</option>
                </select>
              </label>
              <label>
                Model ID
                <input
                  aria-label="Model ID"
                  required
                  list="agent-models"
                  value={draft.model}
                  onChange={(e) => patch({ model: e.target.value })}
                />
                <datalist id="agent-models">
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </label>
            </div>
            <p className="form-hint">
              {providers?.providers.find((p) => p.provider === draft.provider)
                ?.configured
                ? "Provider connected. Choose a model available to your account."
                : "Connect this provider in Settings before running the agent."}
            </p>
            <label>
              Maximum steps per run
              <input
                type="number"
                min={1}
                max={10}
                value={draft.maxSteps}
                onChange={(e) => patch({ maxSteps: Number(e.target.value) })}
              />
            </label>
          </>
        )}
        {tab === "tools" && (
          <>
            <h3>Workspace tools</h3>
            {builtinToolCatalog.map(({ id, name }) => (
              <label className="checkbox-row" key={id}>
                <input
                  type="checkbox"
                  checked={draft.tools.includes(
                    id as AgentConfig["tools"][number],
                  )}
                  onChange={() => toggle("tools", id)}
                />
                <span>{name}</span>
              </label>
            ))}
            <h3>Connected apps</h3>
            <p className="form-hint">
              Select only the apps this agent should access. Each member
              connects their own account in Connections.
            </p>
            <div className="toolkit-picker">
              {toolkitCatalog.map((t) => (
                <label className="checkbox-row" key={t.slug}>
                  <input
                    type="checkbox"
                    checked={draft.toolkits.includes(t.slug)}
                    onChange={() => toggle("toolkits", t.slug)}
                  />
                  <span>{t.name}</span>
                </label>
              ))}
            </div>
            <label>
              External tool permissions
              <select
                value={draft.externalPolicy}
                onChange={(e) =>
                  patch({
                    externalPolicy: e.target
                      .value as AgentConfig["externalPolicy"],
                  })
                }
              >
                <option value="ask">Allow actions, ask before executing</option>
                <option value="read-only">
                  Read-only tools, ask before accessing
                </option>
              </select>
            </label>
          </>
        )}
        {tab === "knowledge" && (
          <>
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
                <option value="all">All organization knowledge</option>
                <option value="selected">Selected documents only</option>
                <option value="none">No company knowledge</option>
              </select>
            </label>
            {draft.knowledgeScope === "selected" && (
              <div className="document-picker">
                {documents.length ? (
                  documents.map((d) => (
                    <label className="checkbox-row" key={d.id}>
                      <input
                        type="checkbox"
                        checked={draft.documentIds.includes(d.id)}
                        onChange={() => toggle("documentIds", d.id)}
                      />
                      <span>{d.name}</span>
                    </label>
                  ))
                ) : (
                  <p className="form-hint">
                    Add documents in Knowledge, then select them here.
                  </p>
                )}
              </div>
            )}
            <p className="form-hint">
              Retrieval always stays inside the active organization. OpenAI
              embeddings enable semantic search; keyword search works without
              them.
            </p>
          </>
        )}
      </div>
      {draftNote && (
        <p className="draft-note" role="status">
          {draftNote}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="builder-footer">
        <span>
          {draft.tools.length} {draft.tools.length === 1 ? "tool" : "tools"} ·{" "}
          {draft.toolkits.length} {draft.toolkits.length === 1 ? "app" : "apps"}
        </span>
        <div className="builder-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          {agent && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onSave(normalizeAgent(draft), true);
                } catch (e) {
                  setError(
                    (e as Error).name === "ZodError"
                      ? "Check the name, model, and instructions before testing."
                      : (e as Error).message,
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save & test
            </button>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : agent ? "Save agent" : "Create agent"}
          </button>
        </div>
      </div>
    </form>
  );
}
