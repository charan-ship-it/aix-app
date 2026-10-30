"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { request } from "@/lib/product-client";
import { toolkitCatalog } from "@/lib/agent-config";
type SkillItem = { id: string; name: string; description: string; version: number; requiredToolkits: string[]; archived?: boolean };
export function AgentSkills({ selected, toolkits = [], onChange }: { selected: string[]; toolkits?: string[]; onChange?: (ids: string[]) => void }) {
  const [items, setItems] = useState<SkillItem[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; request<{items: SkillItem[]}>("/api/skills").then(d => { if(active)setItems(d.items); }).catch(e => {if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);}); return ()=>{active=false;}; }, []);
  const visible = onChange ? items : items.filter(s => selected.includes(s.id));
  return <section className="agent-skills-section">
    <h2>{onChange ? "Add reusable skills" : "Skills"}</h2>
    <p className="settings-note">Skills are shared procedures. Each run saves the versions it uses; attaching a skill never grants access to an app.</p>
    {onChange && <Link href="/skills">Browse and manage the skills library</Link>}
    {loading && <p role="status">Loading skills…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !error && !visible.length && <p className="settings-note">{onChange ? "Your workspace has no published skills yet. Create one in the skills library." : "No skills attached."}</p>}
    <div className="studio-v2-checks">{visible.map(s => <label key={s.id}>
      {onChange && <input type="checkbox" checked={selected.includes(s.id)} disabled={!selected.includes(s.id)&&selected.length>=8} onChange={e=>onChange(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/>}
      <span><strong>{s.name} · v{s.version}</strong><small>{s.description}</small>
      {!!s.requiredToolkits.length && <small>Requires {s.requiredToolkits.map(t=>toolkitCatalog.find(k=>k.slug===t)?.name||t).join(", ")}</small>}
      {onChange && selected.includes(s.id) && s.requiredToolkits.some(t=>!toolkits.includes(t)) && <small className="form-error">Enable the required apps in Tools & apps before saving.</small>}
      </span>
    </label>)}</div>
    {!loading && selected.filter(id=>!items.some(s=>s.id===id)).map(id => <div className="product-context-note" key={id}><p>This agent references an unavailable or archived skill.</p>{onChange && <button type="button" className="secondary" onClick={()=>onChange(selected.filter(s=>s!==id))}>Remove unavailable skill</button>}</div>)}
  </section>;
}
