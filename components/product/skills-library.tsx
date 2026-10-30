"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, History, Plus } from "lucide-react";
import { request } from "@/lib/product-client";
import { toolkitCatalog } from "@/lib/agent-config";
import { skillTemplates, type Skill, type SkillContent } from "@/lib/skills";
import { ProductModal } from "./modal";
import "./skills-library.css";

type Draft = SkillContent & { id?: string; expectedVersion: number };
const blank = (): Draft => ({ name: "", description: "", instructions: "", expectedOutput: "", requiredToolkits: [], expectedVersion: 0 });
export function SkillsLibrary({ admin }: { admin: boolean }) {
  const [items, setItems] = useState<Skill[]>([]), [draft, setDraft] = useState<Draft>(),
    [versions, setVersions] = useState<{ name: string; items: (Skill & { publishedBy: string })[] }>(),
    [archived, setArchived] = useState(false), [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function refresh() {
    setLoading(true);
    try { const d = await request<{ items: Skill[] }>("/api/skills?archived=1"); setItems(d.items); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function publish() {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const { skill } = await request<{ skill: Skill }>("/api/skills", { action: "save", skill: draft });
      setDraft(undefined); setNotice(`${skill.name} · version ${skill.version} published.`); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function toggleArchive(skill: Skill) {
    setBusy(true); setError("");
    try {
      await request("/api/skills", { action: "archive", id: skill.id, expectedVersion: skill.version, archived: !skill.archived });
      setNotice(skill.archived ? "Skill restored." : "Skill archived. Existing agents must remove it before their next run."); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function history(skill: Skill) {
    setBusy(true); setError("");
    try { const d = await request<{ items: (Skill & { publishedBy: string })[] }>(`/api/skills/${skill.id}/versions`); setVersions({ name: skill.name, items: d.items }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const filtered = items.filter((skill) => (archived || !skill.archived) && `${skill.name} ${skill.description}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <header className="product-page-head"><div><h1>Skills</h1><p>Useful procedures your agents can reuse, with a version you can review.</p></div>{admin && <button className="primary" onClick={() => { setError(""); setDraft(blank()); }}><Plus size={15} /> Create skill</button>}</header>
    <div className="product-page-scroll">
      <div className="skills-toolbar"><input aria-label="Search skills" placeholder="Find a skill" value={search} onChange={(e) => setSearch(e.target.value)} /><label><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Include archived</label></div>
      <div className="skills-context"><BookOpen size={19} /><p>Select skills in an agent’s editor. Publishing a new version applies to future runs; active runs retain their saved instructions. Skills use the agent’s existing permissions and never grant access to an app.</p></div>
      {notice && <p className="settings-note" role="status">{notice}</p>}
      {error && !draft && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p className="settings-note" role="status">Loading skills…</p> : filtered.length ? <div className="skills-list">{filtered.map((skill) => <article className="skill-library-row" key={skill.id}>
        <div className="skill-library-icon"><BookOpen size={19} /></div>
        <div><div className="skill-library-title"><h2>{skill.name}</h2><span>v{skill.version}{skill.archived ? " · Archived" : ""}</span></div><p>{skill.description || "A reusable procedure for your agents."}</p><div className="product-tags">{skill.requiredToolkits.map((slug) => <span key={slug}>{toolkitCatalog.find((toolkit) => toolkit.slug === slug)?.name || slug} required</span>)}</div></div>
        <div className="skill-library-actions"><button className="secondary" disabled={busy} onClick={() => { setError(""); setDraft({ ...skill, expectedVersion: skill.version }); }}>{admin ? "Edit skill" : "View skill"}</button><button className="secondary" disabled={busy} onClick={() => void history(skill)}><History size={14} /> Versions</button>{admin && <button className="skill-library-archive" disabled={busy} onClick={() => void toggleArchive(skill)}>{skill.archived ? "Restore" : "Archive"}</button>}</div>
      </article>)}</div> : <div className="skills-empty"><BookOpen size={28} /><h2>{items.length ? "No matching skills" : "Make good work repeatable"}</h2><p>{items.length ? "Try another search or include archived skills." : "Save a procedure once, then select it for the agents that need it."}</p></div>}
      {admin && <section className="skill-template-section"><h2>Start with a useful procedure</h2><div className="skill-template-grid">{skillTemplates.map((template) => <button key={template.name} onClick={() => { setError(""); setDraft({ ...template, expectedVersion: 0 }); }}><strong>{template.name}</strong><span>{template.description}</span><small>Review template →</small></button>)}</div></section>}
    </div>
    {draft && <ProductModal title={draft.id ? (admin ? "Edit skill" : "Skill details") : "Create a skill"} onClose={() => { if (!busy) setDraft(undefined); }} wide>
      <form className="product-modal-body" onSubmit={(e) => { e.preventDefault(); void publish(); }}>
        <label>Name<input required disabled={!admin || busy} maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Description<input disabled={!admin || busy} maxLength={240} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <label>Procedure<textarea required disabled={!admin || busy} minLength={20} maxLength={6000} rows={8} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} /></label>
        <label>Expected output<textarea disabled={!admin || busy} maxLength={2000} rows={3} value={draft.expectedOutput} onChange={(e) => setDraft({ ...draft, expectedOutput: e.target.value })} /></label>
        <fieldset className="skill-required-apps" disabled={!admin || busy}><legend>Required apps</legend><p className="settings-note">The agent must already have these apps enabled. This skill does not connect an account or add tools.</p><div>{toolkitCatalog.map((toolkit) => <label key={toolkit.slug}><input type="checkbox" checked={draft.requiredToolkits.includes(toolkit.slug)} onChange={(e) => setDraft({ ...draft, requiredToolkits: e.target.checked ? [...draft.requiredToolkits, toolkit.slug] : draft.requiredToolkits.filter((slug) => slug !== toolkit.slug) })} />{toolkit.name}</label>)}</div></fieldset>
        <p className="settings-note">{draft.id ? `Publishing saves version ${draft.expectedVersion + 1}. Earlier versions remain available for review.` : "Publishing makes this skill available to members of your organization."}</p>
        {error && <p className="form-error" role="alert">{error} {error.includes("evaluation coverage") && <Link href="/quality">Open Learning & evals</Link>}</p>}
        <div className="product-modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setDraft(undefined)}>{admin ? "Cancel" : "Close"}</button>{admin && <button className="primary" disabled={busy}>{busy ? "Publishing…" : "Publish skill"}</button>}</div>
      </form>
    </ProductModal>}
    {versions && <ProductModal title={`${versions.name} · versions`} onClose={() => setVersions(undefined)} wide><div className="product-modal-body">{versions.items.map((version) => <details className="skill-version" key={version.version}><summary>Version {version.version}{version.archived ? " · Archived" : ""} · {new Date(version.updatedAt).toLocaleString()}</summary><p className="settings-note">Published by {version.publishedBy}</p><h3>{version.name}</h3><p>{version.description}</p><pre>{version.instructions}</pre>{version.expectedOutput && <p><strong>Expected output:</strong> {version.expectedOutput}</p>}</details>)}</div></ProductModal>}
  </>;
}
