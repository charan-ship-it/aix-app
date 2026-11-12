"use client";
import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, Loader2 } from "lucide-react";
import type { AgentConfig } from "@/lib/agent-config";
import type { ProductData } from "@/lib/product-client";

export function BuilderPreview({ draft, providers }: { draft: AgentConfig; providers: ProductData["providers"] }) {
  const [prompt, setPrompt] = useState("");
  const [sentPrompt, setSentPrompt] = useState("");
  const [result, setResult] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = providers.some(item => item.provider === draft.provider && item.configured);
  const ready = draft.instructions.trim().length >= 20;
  async function run() {
    if (!prompt.trim() || busy) return;
    setError("");
    if (!ready) { setError("Add at least 20 characters of agent instructions first."); return; }
    if (!configured) { setError("Connect this agent’s model provider in Settings before previewing."); return; }
    const instructions = draft.instructions;
    const sample = prompt.trim();
    setBusy(true);
    try {
      const response = await fetch("/api/agents/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({instructions, prompt: sample, provider: draft.provider, model: draft.model}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not run the preview.");
      setSentPrompt(sample); setResult(data.text); setSnapshot(instructions); setPrompt("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not run the preview."); }
    finally { setBusy(false); }
  }
  return <div className="builder-preview">
    <div className="builder-preview-content" aria-live="polite">
      {!result && <div className="builder-preview-empty"><span className="builder-avatar"><Bot size={20}/></span><h2>Try your agent</h2><p>Give it a sample request to see how its instructions respond.</p></div>}
      {result && <><div className="builder-user-turn"><p>{sentPrompt}</p></div><div className="builder-preview-result"><strong>{draft.name || "Your agent"}</strong><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>{snapshot !== draft.instructions && <p className="builder-model-note">Instructions changed since this preview. Run it again to see the latest version.</p>}</>}
    </div>
    <div className="builder-composer"><p className="builder-model-note">This preview uses instructions and your sample only. Apps, knowledge and built-in tools aren’t available, and the result isn’t saved to chat history.</p>{!configured && <p className="builder-model-note">AI preview needs a connected model. <Link href="/settings?section=models">Set up AI</Link></p>}{error && <p className="builder-error" role="alert">{error}</p>}<form onSubmit={event=>{event.preventDefault();void run();}}><label className="sr-only" htmlFor="builder-preview-prompt">Sample message</label><textarea id="builder-preview-prompt" value={prompt} maxLength={12000} onChange={event=>setPrompt(event.target.value)} placeholder="Try a sample request or paste meeting notes…"/><button type="submit" disabled={busy || !prompt.trim()} aria-label="Run preview">{busy ? <Loader2 size={17} className="spin"/> : <ArrowUp size={17}/>}</button></form></div>
  </div>;
}
