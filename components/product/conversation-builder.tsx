"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { ArrowUp, Bot, ChevronDown, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { agentSchema, builtinToolCatalog, builtinToolLabel, normalizeAgent, toolkitCatalog, type AgentConfig } from "@/lib/agent-config";
import type { Document } from "@/lib/workspace";
import { connectedDefault } from "@/lib/employee-models";
import type { ProductData } from "@/lib/product-client";
import { BuilderIntegrations } from "./builder-integrations";
import { BuilderPreview } from "./builder-preview";
import { agentTemplates } from "./agent-studio";
import "./conversation-builder.css";

type Turn = { role: "user" | "assistant"; text: string };
const draftSchema = agentSchema.extend({ name: z.string().max(60), instructions: z.string().max(16000) });
export function ConversationBuilder({ organizationId, userId, providers, documents, onSave, initialToolkit }: { organizationId: string; userId: string; providers: ProductData["providers"]; documents: Document[]; onSave: (agent: AgentConfig, test?: boolean) => Promise<void>; initialToolkit?: string }) {
  const key = `aix-conversation-builder:${organizationId}:${userId}`;
  const starterApp = toolkitCatalog.find(app => app.slug === initialToolkit);
  const connection = connectedDefault(providers);
  const [draft, setDraft] = useState<AgentConfig>(() => draftSchema.parse({ id: crypto.randomUUID(), name: "", description: "", instructions: "", provider: connection?.provider || "anthropic", model: connection?.model || "claude-sonnet-4-6", category: "General", icon: "sparkles", color: "orange", tools: [], toolkits: [], knowledgeScope: "none" }));
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [suggestions, setSuggestions] = useState<{tools: string[]; apps: string[]}>({tools: [], apps: []});
  const [proposal, setProposal] = useState<{agent: AgentConfig; tools: string[]; apps: string[]} | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [sideTab, setSideTab] = useState<"build" | "preview">("build");
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        const parsed = draftSchema.safeParse(data.draft);
        if (parsed.success) { setDraft(parsed.data); if (Array.isArray(data.turns)) setTurns(data.turns.filter((t: Turn) => (t.role === "user" || t.role === "assistant") && typeof t.text === "string").slice(-20)); if (data.suggestions) setSuggestions(data.suggestions); if (typeof data.message === "string") setMessage(data.message.slice(0, 4000)); const proposed = agentSchema.safeParse(data.proposal?.agent); if (proposed.success && Array.isArray(data.proposal?.tools) && Array.isArray(data.proposal?.apps)) setProposal({agent:proposed.data,tools:data.proposal.tools.filter((value: unknown) => typeof value === "string"),apps:data.proposal.apps.filter((value: unknown) => typeof value === "string")}); }
      }
      const handoffKey = `aix-agent-chat-goal:${organizationId}:${userId}`;
      const handoff = sessionStorage.getItem(handoffKey);
      if (handoff !== null) { setMessage(handoff); sessionStorage.removeItem(handoffKey); }
    } catch { /* A malformed or unavailable local draft can be replaced. */ }
    setLoaded(true);
  }, [key, organizationId, userId]);
  useEffect(() => { if (loaded && !saved) { try { sessionStorage.setItem(key, JSON.stringify({ draft, turns, suggestions, message, proposal })); } catch { /* editing still works without storage */ } } }, [draft, turns, suggestions, message, proposal, loaded, saved, key]);
  const patch = (values: Partial<AgentConfig>) => setDraft(current => ({ ...current, ...values }));
  async function generate() {
    const text = message.trim();
    if (text.length < 10 || busy) return;
    if (!connection) { setError("Connect a model to draft with AI. You can still fill in the agent details yourself."); return; }
    setBusy(true); setError("");
    try {
      const history = [...turns.filter(t => t.role === "user").map(t => t.text), text].join("\n\nAdditional direction: ").slice(-8000);
      const response = await fetch("/api/agents/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: history, ...connection }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not draft this agent.");
      const proposed = normalizeAgent({ ...draft, ...result, provider: connection.provider, model: connection.model, tools: draft.tools, toolkits: draft.toolkits, toolPermissions: draft.toolPermissions, knowledgeScope: draft.knowledgeScope, documentIds: draft.documentIds, mcpTools: draft.mcpTools, skillIds: draft.skillIds });
      setProposal({agent:proposed, tools:Array.isArray(result.tools) ? result.tools : [], apps:Array.isArray(result.toolkits) ? result.toolkits : []});
      setTurns(current => [...current, { role: "user", text }, { role: "assistant", text: "I’ve prepared a suggestion. Review it below, then apply or discard it. Your existing settings and access have not changed." }]);
      setMessage("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not draft this agent."); }
    finally { setBusy(false); }
  }
  async function save(test: boolean) {
    setError("");
    const parsed = agentSchema.safeParse({ ...draft, starters: draft.starters.map(value => value.trim()).filter(Boolean) });
    if (!parsed.success) { setError("Add an agent name and at least 20 characters of instructions before saving."); return; }
    setBusy(true);
    try { await onSave(parsed.data, test); setSaved(true); sessionStorage.removeItem(key); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save your agent."); }
    finally { setBusy(false); }
  }
  return <section className="builder-chat" aria-label="Create an agent">
    <header className="builder-chat-header"><div><h1>Create an agent</h1><p>Describe the job, then shape the details together. This draft stays in this browser session.</p>{starterApp && <p>Starting with {starterApp.name}? Choose the tools this agent needs under Apps and integrations.</p>}</div><Link href="/agents">Close</Link></header>
    <div className="builder-chat-columns">
      <div className="builder-chat-details">
        <div className="builder-details-inner">
          <section className="builder-section">
            <details className="builder-disclosure"><summary><span><strong>Start with a template</strong><small>Optional starting points for your agent</small></span><ChevronDown size={16}/></summary><div className="builder-disclosure-content"><p>Applying a template replaces the name, description, instructions, prompts and built-in tools in this draft. Review them before creating your agent.</p>{agentTemplates.map(template => <div className="builder-template" key={template.name}><div><strong>{template.name}</strong><p>{template.description}</p></div><button type="button" className="builder-subtle-button" onClick={() => patch({ ...template, delegateAgentIds: template.delegateAgentIds || [] })}>Use template</button></div>)}</div></details>
          </section>
          <section className="builder-section builder-role">
            <div className="builder-section-intro"><div><h2>Instructions</h2><p>Give your agent a role and explain how it should work.</p></div><span className="builder-model-chip">{connection ? connection.model : "No model connected"}</span></div>
            <label className="builder-instruction-label"><span className="sr-only">Instructions</span><textarea value={draft.instructions} maxLength={16000} onChange={e => patch({instructions:e.target.value})} placeholder="Describe your agent’s role, responsibilities, and how you want it to respond." /></label>
          </section>
          <section className="builder-section">
            <div className="builder-section-intro"><div><h2>Suggested prompts</h2><p>Give people a few ideas for how to start a conversation.</p></div><button className="builder-subtle-button" type="button" disabled={draft.starters.length >= 4} onClick={() => patch({starters:[...draft.starters, ""]})}><Plus size={15}/> Add prompt</button></div>
            {draft.starters.map((starter, index) => <div className="builder-starter" key={index}><label className="sr-only" htmlFor={`builder-starter-${index}`}>Suggested prompt {index + 1}</label><input id={`builder-starter-${index}`} value={starter} maxLength={300} onChange={e => patch({starters:draft.starters.map((value, i) => i === index ? e.target.value : value)})} placeholder="e.g. Summarize these meeting notes"/><button type="button" aria-label={`Remove suggested prompt ${index + 1}`} onClick={() => patch({starters:draft.starters.filter((_, i) => i !== index)})}><Trash2 size={15}/></button></div>)}
          </section>
          <section className="builder-section">
            <div className="builder-section-intro"><div><h2>Data and access</h2><p>Choose the knowledge this agent can use. Only selected sources are included.</p></div></div>
            <details className="builder-disclosure"><summary><span><strong>Knowledge sources</strong><small>{draft.documentIds.length ? `${draft.documentIds.length} selected` : "No sources selected"}</small></span><ChevronDown size={16}/></summary><div className="builder-disclosure-content"><p>Enable Knowledge search in capabilities to use these sources.</p>{documents.length ? documents.map(doc => <label className="builder-access-option" key={doc.id}><input type="checkbox" checked={draft.documentIds.includes(doc.id)} onChange={e => { const ids = e.target.checked ? [...draft.documentIds, doc.id] : draft.documentIds.filter(id => id !== doc.id); patch({documentIds:ids, knowledgeScope:ids.length ? "selected" : "none"}); }}/><span>{doc.name}</span></label>) : <p>No knowledge sources available yet.</p>}</div></details>
          </section>
          <section className="builder-section">
            <div className="builder-section-intro"><div><h2>Capabilities</h2><p>Choose the tools this agent needs to do its job.</p></div></div>
            {(suggestions.tools.length > 0 || suggestions.apps.length > 0) && <p className="builder-suggestions">Suggested for review: {[...suggestions.tools.map(builtinToolLabel), ...suggestions.apps].join(", ")}. Suggestions are not enabled.</p>}
            <details className="builder-disclosure"><summary><span><strong>Built-in tools</strong><small>{draft.tools.length ? `${draft.tools.length} enabled` : "No tools enabled"}</small></span><ChevronDown size={16}/></summary><div className="builder-disclosure-content">{builtinToolCatalog.map(tool => <label className="builder-access-option" key={tool.id}><input type="checkbox" checked={draft.tools.includes(tool.id)} onChange={e => patch({tools:e.target.checked ? [...draft.tools, tool.id] : draft.tools.filter(id => id !== tool.id)})}/><span><strong>{tool.name}</strong><small>{tool.description}</small></span></label>)}</div></details>
          </section>
          <section className="builder-section">
            <div className="builder-section-intro"><div><h2>Apps and integrations</h2><p>Connect your accounts and choose which tools this agent can use.</p></div></div>
            <details className="builder-disclosure builder-app-disclosure"><summary><span><strong>Apps and integrations</strong><small>{draft.toolkits.length || draft.mcpTools.length ? `${draft.toolkits.length} apps · ${draft.mcpTools.length} MCP servers` : "Connect accounts and choose tools"}</small></span><ChevronDown size={16}/></summary><div className="builder-disclosure-content"><BuilderIntegrations draft={draft} onChange={patch}/></div></details>
          </section>
          <section className="builder-section builder-identity">
            <div className="builder-section-intro"><div><h2>Identity</h2><p>Help people recognize what this agent does.</p></div></div>
            <div className="builder-identity-row"><span className="builder-avatar"><Bot size={20}/></span><label>Name<input value={draft.name} maxLength={60} onChange={e => patch({name:e.target.value})} placeholder="e.g. Meeting follow-up" /></label></div>
            <label>Description<input value={draft.description} maxLength={160} onChange={e => patch({description:e.target.value})} placeholder="What does this agent help with?" /></label>
          </section>
        </div>
        <footer><span>Draft · {connection ? "AI connected" : "AI not connected"}</span><button disabled={busy || !!proposal} onClick={() => void save(true)}>Create &amp; start chat</button></footer>
      </div>
      <div className="builder-chat-side"><div className="builder-side-title" role="tablist" aria-label="Agent builder panels"><button type="button" role="tab" aria-selected={sideTab === "build"} onClick={() => setSideTab("build")}><Sparkles size={15}/> Build together</button><button type="button" role="tab" aria-selected={sideTab === "preview"} onClick={() => setSideTab("preview")}><Bot size={15}/> Preview</button></div><div className="builder-side-content" hidden={sideTab !== "build"}><div className="builder-messages" aria-live="polite"><div className="builder-assistant"><span className="builder-bubble-icon"><Sparkles size={15}/></span><div><strong>Let’s create your agent</strong><p>What job should it do? Tell me who it helps, what information it needs, and what a good result looks like.</p></div></div>{turns.map((turn, i) => <div key={i} className={turn.role === "user" ? "builder-user-turn" : "builder-assistant"}>{turn.role === "assistant" && <span className="builder-bubble-icon"><Sparkles size={15}/></span>}<p>{turn.text}</p></div>)}{proposal && <article className="builder-proposal"><div className="builder-proposal-head"><Sparkles size={16}/><strong>Suggested agent</strong></div><p><strong>{proposal.agent.name}</strong><br/>{proposal.agent.description}</p><details><summary>Review suggested instructions</summary><p className="builder-proposal-instructions">{proposal.agent.instructions}</p></details>{(proposal.tools.length > 0 || proposal.apps.length > 0) && <p>Suggested capabilities: {[...proposal.tools.map(builtinToolLabel),...proposal.apps].join(", ")}. These won’t be enabled automatically.</p>}<div className="builder-proposal-actions"><button type="button" onClick={()=>setProposal(null)}>Discard</button><button type="button" onClick={()=>{patch({name:proposal.agent.name,description:proposal.agent.description,instructions:proposal.agent.instructions,starters:proposal.agent.starters});setSuggestions({tools:proposal.tools,apps:proposal.apps});setProposal(null);}}>Apply suggestion</button></div></article>}{busy && <p role="status"><Loader2 size={16} className="spin"/> Working…</p>}</div><div className="builder-composer">{!connection && <p className="builder-model-note">AI drafting needs a connected model. <Link href="/settings?section=models">Set up AI</Link></p>}{error && <p className="builder-error" role="alert">{error}</p>}<form onSubmit={e => {e.preventDefault(); void generate();}}><label className="sr-only" htmlFor="builder-message">Describe your agent</label><textarea id="builder-message" value={message} maxLength={4000} onChange={e => setMessage(e.target.value)} placeholder="Describe the job or request a change…"/><button type="submit" disabled={busy || !!proposal || message.trim().length < 10 || !connection} aria-label="Draft agent"><ArrowUp size={17}/></button></form><small>Review suggestions before applying them. Selected access stays unchanged.</small></div></div><div className="builder-side-content" hidden={sideTab !== "preview"}><BuilderPreview draft={draft} providers={providers}/></div></div>
    </div>
  </section>;
}
