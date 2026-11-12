"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Moon, Sun } from "lucide-react";
import { ProviderSettings } from "@/components/platform/provider-settings";
import { TeamSettings } from "@/components/platform/organizations";
import { InfrastructureStatus } from "@/components/platform/infrastructure";
import { Activity, Schedules } from "@/components/platform/activity";
import type { AgentConfig } from "@/lib/agent-config";
export function SettingsView({
  section,
  admin,
  agents,
  onChange,
}: {
  section: string;
  admin: boolean;
  agents: AgentConfig[];
  onChange: () => void;
}) {
  const router = useRouter();
  const titles: Record<string, [string, string]> = {
    models: [
      "Model connections",
      "Connect the accounts your agents use. Keys are stored securely for your organization.",
    ],
    team: [
      "Members & invitations",
      "Manage the people who can work in your organization.",
    ],
    appearance: [
      "Appearance",
      "Choose how your workspace looks on this device.",
    ],
    timezone: ["Time zone", "Set the time zone your agents use for dates and calendar work in this workspace."],
    activity: ["Runs & schedules", "Review your runs and recurring work."],
    system: [
      "Infrastructure",
      "Health and configuration of your workspace services.",
    ],
  };
  const currentSection = titles[section] ? section : "models";
  const info = titles[currentSection];
  return (
    <>
      <header className="product-page-head"><div><h1>{info[0]}</h1><p>{info[1]}</p></div></header>
      <div className="product-page-scroll settings-page">
        {section === "timezone" ? (
          <TimezoneSettings />
        ) : section === "team" ? (
          <TeamSettings />
        ) : section === "system" ? (
          <InfrastructureStatus />
        ) : section === "appearance" ? (
          <Appearance />
        ) : section === "activity" ? (
          <>
            <Activity
              agents={agents}
              onOpen={(c) => router.push("/conversation/" + c.id)}
            />
            <Schedules agents={agents} />
          </>
        ) : (
          <>
            <ProviderSettings admin={admin} onChange={onChange} />
            <div className="product-context-note">
              <strong>What to connect first</strong>
              <p>
                OpenAI or Anthropic enables conversations and agent drafting.
                OpenAI also enables semantic embeddings. App connections are managed by AIX; each member authorizes their own accounts.
              </p>
              <Link href="/connections">Manage app connections</Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}
function TimezoneSettings() {
  const [timezone, setTimezone] = useState("");
  const [message, setMessage] = useState("Loading your setting…");
  const [busy, setBusy] = useState(true);
  useEffect(() => { let active = true; fetch("/api/personal-timezone").then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { if (active) { setTimezone(data.timezone || ""); setMessage(data.timezone ? "" : "No time zone saved yet. Your agent will ask when it needs one."); } }).catch(() => { if (active) setMessage("Could not load your time zone. Try refreshing."); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, []);
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function save() {
    setBusy(true); setMessage("");
    try { const r = await fetch("/api/personal-timezone", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({timezone})}); const data = await r.json(); if (!r.ok) throw new Error(data.error || "Unable to save."); setTimezone(data.timezone); setMessage("Time zone saved for you in this workspace."); } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save."); } finally { setBusy(false); }
  }
  return <section className="product-form-section timezone-settings"><h2>Your time zone</h2><p>Agents use this setting to interpret dates and calendar requests. It does not change other members’ settings.</p><div className="timezone-field"><label htmlFor="personal-timezone">IANA time zone</label><input id="personal-timezone" value={timezone} onChange={e => setTimezone(e.target.value)} placeholder="e.g. Asia/Kolkata" disabled={busy} /></div><div className="timezone-actions"><button className="secondary" type="button" onClick={() => setTimezone(detected)} disabled={busy || !detected}>Use device time zone{detected ? ` (${detected})` : ""}</button><button className="primary" type="button" onClick={save} disabled={busy || !timezone.trim()}>{busy && !message ? "Saving…" : "Save"}</button></div>{message && <p className="timezone-message" role="status">{message}</p>}</section>;
}
function Appearance() {
  const [theme, setTheme] = useState("dark");
  useEffect(
    () =>
      setTheme(
        localStorage.getItem("aix-theme") === "light" ? "light" : "dark",
      ),
    [],
  );
  return (
    <section className="product-form-section">
      <h2>Color theme</h2>
      <p>Your organization and agent settings stay the same.</p>
      <div className="product-theme-options">
        {[
          ["light", "Light", Sun],
          ["dark", "Dark", Moon],
        ].map(([id, label, Icon]) => {
          const I = Icon as typeof Sun;
          return (
            <button
              key={id as string}
              className={theme === id ? "selected" : ""}
              onClick={() => {
                setTheme(id as string);
                localStorage.setItem("aix-theme", id as string);
                document.documentElement.dataset.theme = id as string;
                window.dispatchEvent(new Event("aix-theme-change"));
              }}
            >
              <I size={22} />
              <span>{label as string}</span>
              {theme === id && <Check size={16} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
