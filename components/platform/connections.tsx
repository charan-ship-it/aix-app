"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Files,
  CalendarDays,
  Hash,
  Notebook,
  GitBranch,
  Building2,
  Contact,
  Search,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
} from "lucide-react";
import { toolkitCatalog } from "@/lib/agent-config";
import { IntegrationLab } from "./integration-lab";
import { MCPConnections } from "./mcp-connections";
const appIcons = {
  gmail: Mail,
  googledrive: Files,
  googlecalendar: CalendarDays,
  slack: Hash,
  notion: Notebook,
  github: GitBranch,
  salesforce: Building2,
  hubspot: Contact,
  outlook: Mail,
  linear: Hash,
  jira: Notebook,
  zoho: Contact,
};
const brandIcons: Record<string, string> = {gmail:"gmail.svg",googlecalendar:"google-calendar.svg",googledrive:"google-drive.svg",outlook:"outlook.svg",linear:"linear-logo.svg",jira:"jira-logo.svg",zoho:"zoho-logo-web.svg",slack:"slack.svg",salesforce:"salesforce.svg",github:"github.svg",notion:"notion.svg",hubspot:"hubspot.svg"};
const STATUS_CACHE_MS = 5 * 60 * 1000;
type CachedStatus = { savedAt: number; configured: boolean; connected: string[] };
function readStatus(key: string | null): CachedStatus | null {
  if (!key) return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!value || typeof value.savedAt !== "number" || Date.now() - value.savedAt < 0 || Date.now() - value.savedAt > STATUS_CACHE_MS || typeof value.configured !== "boolean" || !Array.isArray(value.connected) || !value.connected.every((s: unknown) => typeof s === "string")) return null;
    return value;
  } catch { return null; }
}
export function Connections({ admin, userId, organizationId }: { admin: boolean; userId?: string; organizationId?: string }) {
  const cacheKey = userId && organizationId ? `aix:connection-status:${JSON.stringify([userId, organizationId])}` : null;
  const requestVersion = useRef(0);
  const [testing, setTesting] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "connected">("all");
  const [items, setItems] = useState(
      toolkitCatalog.map((t) => ({ ...t, connected: false })),
    ),
    [configured, setConfigured] = useState<boolean | null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [statusStale, setStatusStale] = useState(false),
    [checkingStatus, setCheckingStatus] = useState(false);
  async function refresh() {
    const version = ++requestVersion.current;
    setCheckingStatus(true);
    try {
      const r = await fetch("/api/connections", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (version !== requestVersion.current) return;
      setItems(d.items);
      setConfigured(d.configured);
      setStatusStale(false);
      setMessage("");
      if (cacheKey) try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), configured: d.configured, connected: d.items.filter((item: { connected: boolean }) => item.connected).map((item: { slug: string }) => item.slug) }));
      } catch { /* Storage may be unavailable; live status still works. */ }
    } catch (e) {
      if (version !== requestVersion.current) return;
      setStatusStale(true);
      setMessage((e as Error).message);
    } finally {
      if (version === requestVersion.current) setCheckingStatus(false);
    }
  }
  useEffect(() => {
    const cached = readStatus(cacheKey);
    if (cached) {
      const connected = new Set(cached.connected);
      setItems(toolkitCatalog.map(t => ({ ...t, connected: connected.has(t.slug) })));
      setConfigured(cached.configured);
      setStatusStale(true);
    }
    refresh();
    const focus = () => refresh();
    const connected = (event: MessageEvent) => {
      if (
        event.origin === location.origin &&
        event.data?.type === "aix-app-connected"
      ) {
        setMessage("Authorization finished. Checking your account…");
        refresh();
      }
    };
    window.addEventListener("focus", focus);
    window.addEventListener("message", connected);
    return () => {
      requestVersion.current++;
      window.removeEventListener("focus", focus);
      window.removeEventListener("message", connected);
    };
  }, [cacheKey]);
  async function connect(slug: string) {
    const popup = window.open(
      "about:blank",
      "aix-connect",
      "width=650,height=780",
    );
    setBusy(slug);
    setMessage("");
    try {
      const r = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: slug }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (popup) popup.location.href = d.url;
      else location.href = d.url;
      setMessage(
        "Complete authorization in the connection window, then refresh the connection status.",
      );
    } catch (e) {
      popup?.close();
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="connections-top-actions"><MCPConnections admin={admin} /></div>
      <div className="connections-intro">
        <div className="connections-intro-icon"><ShieldCheck size={19} aria-hidden="true" /></div>
        <div><strong>Your accounts, your control</strong><p>Connections are private to you in this workspace. Choose which apps each agent can use.</p></div>
        <button className="secondary" onClick={refresh}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>
      </div>
      <div className="connections-catalog-head"><div><h2>Explore apps</h2><p>Connect the tools you already work with.</p></div><label className="connections-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search apps</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search apps" /></label></div>
      <div className="connections-filters" aria-label="Filter apps"><button type="button" className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All apps <span>{items.length}</span></button><button type="button" className={filter === "connected" ? "active" : ""} aria-pressed={filter === "connected"} onClick={() => setFilter("connected")}>Connected <span>{configured === null ? "–" : items.filter(item => item.connected).length}</span></button></div>
      {statusStale && configured !== null && <p className="settings-note" role="status">{checkingStatus ? "Showing the last checked status while refreshing…" : "Showing the last checked status; refresh failed."}</p>}
      {configured === false && (
        <div className="integration-notice">
          <div>
            <strong>App connections are temporarily unavailable</strong>
            <p>
              Please contact AIX support. Your connected accounts and saved agent settings are preserved.
            </p>
          </div>
        </div>
      )}
      <div className="agent-grid integration-grid">
        {items.filter(t => (filter === "all" || t.connected) && `${t.name} ${t.description}`.toLowerCase().includes(query.trim().toLowerCase())).map((t) => {
          const Icon = appIcons[t.slug];
          return (
            <article className="integration-card" key={t.slug}>
              <div className="integration-card-top"><span className="integration-app-icon">{brandIcons[t.slug] ? <img src={`/integrations/${brandIcons[t.slug]}`} data-app-logo={t.slug} alt="" /> : <Icon size={22} aria-hidden="true" />}</span><span className={`integration-state ${t.connected && configured ? "is-connected" : ""}`}><span aria-hidden="true" />{configured === null ? "Checking" : configured === false ? "Unavailable" : t.connected ? "Connected" : "Not connected"}</span></div>
              <h2>{t.name}</h2>
              <p className="integration-description">{t.description}</p>
              <Link
                className="product-starter-link"
                href={`/agents/new?toolkit=${t.slug}`}
                aria-label={`Build an agent with ${t.name}`}
              >
                Build an agent <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
              <div className="integration-actions">
                <button
                  className="secondary"
                  aria-label={`${t.connected ? "Reconnect" : "Connect"} ${t.name}`}
                  disabled={!configured || !!busy}
                  onClick={() => connect(t.slug)}
                >
                  {busy === t.slug
                    ? "Opening…"
                    : t.connected
                      ? "Reconnect"
                      : "Connect"}
                </button>
                <button
                  className="secondary"
                  aria-label={`Explore tools for ${t.name}`}
                  disabled={!configured || !!busy}
                  onClick={() => setTesting(t.slug)}
                >
                  Explore tools
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!items.some(t => (filter === "all" || t.connected) && `${t.name} ${t.description}`.toLowerCase().includes(query.trim().toLowerCase())) && <div className="connections-empty">No apps found. Try another search or filter.</div>}
      {message && (
        <p className="settings-note" role="status">
          {message}
        </p>
      )}
      {testing && (
        <IntegrationLab
          toolkit={testing}
          connected={items.find((t) => t.slug === testing)?.connected || false}
          onClose={() => setTesting("")}
        />
      )}
    </>
  );
}
