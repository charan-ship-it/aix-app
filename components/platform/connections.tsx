"use client";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { toolkitCatalog } from "@/lib/agent-config";
import { IntegrationLab } from "./integration-lab";
import { integrationScenarios } from "@/lib/integration-tests";
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
export function Connections({ onSettings: _onSettings }: { onSettings: () => void }) {
  const [testing, setTesting] = useState("");
  const [items, setItems] = useState(
      toolkitCatalog.map((t) => ({ ...t, connected: false })),
    ),
    [configured, setConfigured] = useState<boolean | null>(null),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  async function refresh() {
    try {
      const r = await fetch("/api/connections");
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setItems(d.items);
      setConfigured(d.configured);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
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
      window.removeEventListener("focus", focus);
      window.removeEventListener("message", connected);
    };
  }, []);
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
      <div className="connection-toolbar">
        <p className="settings-note">
          Accounts are private to your membership in this organization. Agents
          only receive the apps enabled in their configuration.
        </p>
        <button className="secondary" onClick={refresh}>
          Refresh status
        </button>
      </div>
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
        {items.map((t) => {
          const Icon = appIcons[t.slug];
          return (
            <article className="integration-card" key={t.slug}>
              <span className="agent-icon">
                <Icon size={19} />
              </span>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <p className="settings-note">
                Check: {integrationScenarios[t.slug].title.toLowerCase()}
              </p>
              <Link
                className="product-starter-link"
                href={`/agents/new?toolkit=${t.slug}`}
              >
                Build an agent with {t.name} →
              </Link>
              <div className="integration-actions">
                <span className="status-pill">
                  {t.connected ? "Connected" : "Not connected"}
                </span>
                <button
                  className="secondary"
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
                  disabled={!configured || !!busy}
                  onClick={() => setTesting(t.slug)}
                >
                  Browse & test tools
                </button>
              </div>
            </article>
          );
        })}
      </div>
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
