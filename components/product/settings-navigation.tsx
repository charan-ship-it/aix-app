"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Sun, Plug, BookOpen, Users, ListChecks, Activity, Server, House, Clock } from "lucide-react";

/** Settings groups point to the existing working pages; they do not add duplicate feature state. */
export function SettingsNavigation({ admin }: { admin: boolean }) {
  const path = usePathname(), query = useSearchParams();
  const section = query.get("section") || "models";
  const groups = [
    { label: "General", items: [
      { label: "Time zone", href: "/settings?section=timezone", Icon: Clock, active: path === "/settings" && section === "timezone" },
      { label: "Appearance", href: "/settings?section=appearance", Icon: Sun, active: path === "/settings" && section === "appearance" },
      { label: "Getting started", href: "/?guide=1", Icon: House, active: path === "/" && query.get("guide") === "1" },
    ] },
    { label: "Connections & context", items: [
      { label: "Model connections", href: "/settings?section=models", Icon: Plug, active: path === "/settings" && section === "models" },
      { label: "App connections", href: "/connections", Icon: Plug, active: path === "/connections" },
      { label: "Knowledge", href: "/spaces", Icon: BookOpen, active: path === "/spaces" },
    ] },
    { label: "Work tools", items: [
      { label: "My tasks", href: "/my-work", Icon: ListChecks, active: path === "/my-work" },
      { label: "Skills", href: "/skills", Icon: BookOpen, active: path === "/skills" },
      { label: "Learning & evals", href: "/quality", Icon: Activity, active: path === "/quality" },
      { label: "Runs & schedules", href: "/settings?section=activity", Icon: Activity, active: path === "/settings" && section === "activity" },
    ] },
    { label: "Workspace", items: [
      { label: "Members & invitations", href: "/settings?section=team", Icon: Users, active: path === "/settings" && section === "team" },
      ...(admin ? [{ label: "Infrastructure", href: "/settings?section=system", Icon: Server, active: path === "/settings" && section === "system" }] : []),
    ] },
  ];
  return <div className="settings-rail">
    <Link className="settings-rail-back" href="/" aria-label="Back to chat" title="Back to chat"><ArrowLeft size={17} /><span>Back to chat</span></Link>
    <h2 className="settings-rail-title">Settings</h2>
    <nav aria-label="Settings sections">{groups.map(group => <div className="product-nav settings-rail-group" key={group.label}>
      <h3>{group.label}</h3>
      {group.items.map(({ href, label, Icon, active }) => <Link key={href} href={href} className={active ? "selected" : ""} aria-current={active ? "page" : undefined} aria-label={label} title={label}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>)}
    </div>)}</nav>
  </div>;
}
