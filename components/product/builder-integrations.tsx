"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { toolkitCatalog, type AgentConfig } from "@/lib/agent-config";
import type { IntegrationTool } from "@/lib/integration-tests";
import { MCPPermissions } from "./mcp-permissions";
import { setBuilderAppTool } from "@/lib/builder-app-scope";
import { protectedMailTool, supportedMailTool } from "@/lib/email-tool-policy";

type ConnectionState = { configured: boolean; items: Array<{slug: string; connected: boolean}> };
export function BuilderIntegrations({ draft, onChange }: { draft: AgentConfig; onChange: (changes: Partial<AgentConfig>) => void }) {
  const [status, setStatus] = useState<ConnectionState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [searches, setSearches] = useState<Record<string,string>>({});
  const [tools, setTools] = useState<Record<string,IntegrationTool[]>>({});
  const [toolErrors, setToolErrors] = useState<Record<string,string>>({});
  const refresh = useCallback(async () => {
    try { const response = await fetch('/api/connections', {cache:'no-store'}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not check connections.'); setStatus(data); setError(''); }
    catch (e) { setStatus(null); setError(e instanceof Error ? e.message : 'Could not check connections.'); }
  }, []);
  useEffect(() => { void refresh(); const focus = () => void refresh(); const message = (event: MessageEvent) => { if (event.origin === location.origin && event.data?.type === 'aix-app-connected') void refresh(); }; window.addEventListener('focus', focus); window.addEventListener('message', message); return () => { window.removeEventListener('focus', focus); window.removeEventListener('message', message); }; }, [refresh]);
  async function connect(slug:string) {
    const popup = window.open('about:blank', 'aix-connect', 'width=650,height=780');
    setBusy(`connect:${slug}`); setError('');
    try { const response = await fetch('/api/connections', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toolkit:slug})}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not start connection.'); if (popup) popup.location.href = data.url; else location.href = data.url; }
    catch (e) { popup?.close(); setError(e instanceof Error ? e.message : 'Could not start connection.'); }
    finally { setBusy(''); }
  }
  async function loadTools(slug:string) {
    setBusy(`tools:${slug}`); setToolErrors(current => ({...current,[slug]:''}));
    try { const response = await fetch(`/api/connections/tools?toolkit=${encodeURIComponent(slug)}&search=${encodeURIComponent(searches[slug] || '')}`, {cache:'no-store'}); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load tools.'); setTools(current => ({...current,[slug]:data.items})); }
    catch (e) { setToolErrors(current => ({...current,[slug]: e instanceof Error ? e.message : 'Could not load tools.'})); }
    finally { setBusy(''); }
  }
  function toggleTool(slug:string, tool:string, checked:boolean) {
    onChange(setBuilderAppTool(draft, slug, tool, checked));
  }
  function removeApp(slug:string) { const permissions = {...draft.toolPermissions}; delete permissions[slug]; onChange({toolkits:draft.toolkits.filter(value => value !== slug),toolPermissions:permissions}); }
  const apps = toolkitCatalog.filter(app => `${app.name} ${app.description}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="builder-integrations">
    <p>Choose specific app tools for this agent. Each person uses their own connected account; external actions require approval.</p><p>For email privacy, only Gmail Fetch emails is currently available. Authentication-related messages and some content may be omitted; other Gmail and Outlook tools are temporarily unavailable.</p>
    {error && <p role="alert" className="builder-integration-error">{error} <button type="button" onClick={() => void refresh()}>Retry</button></p>}
    {status && !status.configured && <p className="builder-integration-notice">App connections aren’t available in this workspace yet. Contact your workspace administrator.</p>}
    <label className="builder-app-search"><Search size={15} aria-hidden="true"/><span className="sr-only">Search apps</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search apps"/></label>
    <div className="builder-app-list">{apps.map(app => {
      const selected = draft.toolPermissions[app.slug] || [];
      const enabled = draft.toolkits.includes(app.slug);
      const allTools = enabled && !selected.length;
      const connected = status?.items.find(item=>item.slug === app.slug)?.connected;
      return <details className="builder-app" key={app.slug} onToggle={event => {if (event.currentTarget.open && !tools[app.slug] && status?.configured && !toolErrors[app.slug]) void loadTools(app.slug);}}>
        <summary><span className="builder-app-mark">{app.name.slice(0,1)}</span><span className="builder-app-title"><strong>{app.name}</strong><small>{status === null ? 'Status unavailable' : connected ? 'Connected' : 'Not connected'}{enabled ? ` · ${allTools ? 'All tools allowed' : `${selected.length} tools selected`}` : ''}</small></span><ChevronDown size={15}/></summary>
        <div className="builder-app-content"><p>{app.description}</p><div className="builder-app-actions">{status?.configured && !connected && <button type="button" className="builder-subtle-button" disabled={!!busy} onClick={()=>void connect(app.slug)}>{busy === `connect:${app.slug}` ? 'Connecting…' : 'Connect account'}</button>}{enabled && <button type="button" className="builder-text-button" onClick={()=>removeApp(app.slug)}>Remove app from agent</button>}</div>
          {allTools && <p className="builder-integration-notice">All tools in this app are currently permitted. Remove the app and select individual tools below to restrict access.</p>}
          {status?.configured && <><div className="builder-tool-search"><input aria-label={`Search ${app.name} tools`} value={searches[app.slug] || ''} onChange={e=>setSearches(current=>({...current,[app.slug]:e.target.value}))} placeholder="Find a tool"/><button type="button" disabled={!!busy} onClick={()=>void loadTools(app.slug)}>Search</button></div>{busy === `tools:${app.slug}` && <p role="status"><Loader2 size={14} className="spin"/> Loading tools…</p>}{toolErrors[app.slug] && <p role="alert" className="builder-integration-error">{toolErrors[app.slug]} <button type="button" onClick={()=>void loadTools(app.slug)}>Retry</button></p>}{tools[app.slug] && !tools[app.slug].length && <p>No tools found. Try another search.</p>}{tools[app.slug] && tools[app.slug].length >= 50 && <p>Showing up to 50 tools. Search to find others.</p>}
          {[...new Set([...selected,...(tools[app.slug] || []).map(tool=>tool.slug)])].map(slug => {const tool = tools[app.slug]?.find(item=>item.slug === slug); return <label className="builder-access-option" key={slug}><input type="checkbox" checked={selected.includes(slug)} disabled={allTools || (protectedMailTool(slug) && !supportedMailTool(slug) && !selected.includes(slug)) || (!selected.includes(slug) && draft.toolkits.length >= 12 && !enabled)} onChange={event=>toggleTool(app.slug,slug,event.target.checked)}/><span><strong>{tool?.name || slug}</strong><small>{protectedMailTool(slug) && !supportedMailTool(slug) ? "Temporarily unavailable while privacy handling is verified." : tool?.description || slug}</small></span></label>;})}</>}
        </div>
      </details>;
    })}</div>
    {!apps.length && <p>No apps match this search.</p>}
    <p className="builder-section-note"><Link href="/connections" target="_blank" rel="noreferrer">Manage connections</Link> · Selecting a tool does not connect an account.</p>
    <details className="builder-disclosure builder-mcp"><summary><span><strong>MCP servers</strong><small>{draft.mcpTools.length ? `${draft.mcpTools.length} servers selected` : 'Choose tools from workspace servers'}</small></span><ChevronDown size={16}/></summary><div className="builder-disclosure-content"><MCPPermissions scopes={draft.mcpTools} onChange={mcpTools=>onChange({mcpTools})}/></div></details>
  </div>;
}
