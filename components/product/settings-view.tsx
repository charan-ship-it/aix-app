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
    activity: ["Runs & schedules", "Review your runs and recurring work."],
    system: [
      "Infrastructure",
      "Health and configuration of your workspace services.",
    ],
  };
  const info = titles[section] || titles.models;
  return (
    <>
      <header className="product-page-head">
        <div>
          <h1>{info[0]}</h1>
          <p>{info[1]}</p>
        </div>
      </header>
      <div className="product-page-scroll settings-page">
        {section === "team" ? (
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
