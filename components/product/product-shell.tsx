"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Box,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Users,
  LogOut,
  Bot,
  Menu,
  Inbox,
  Sun,
  Moon,
} from "lucide-react";
import type { Chat } from "@/lib/workspace";
import type { Pod } from "@/lib/pods";
import { OrganizationPicker } from "@/components/platform/organizations";
import { authClient } from "@/lib/auth-client";
import { SettingsNavigation } from "./settings-navigation";
export type ProductUser = {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: string;
};
export function ProductShell({
  user,
  pods,
  chats,
  activePodId,
  onSearch,
  children,
}: {
  user: ProductUser;
  pods: Pod[];
  chats: Chat[];
  activePodId?: string;
  onSearch: () => void;
  children: React.ReactNode;
}) {
  const path = usePathname(),
    query = useSearchParams();
  const settingsMode = ["/settings", "/connections", "/spaces", "/my-work", "/skills", "/quality"].includes(path) || path === "/" && query.get("guide") === "1";
  const admin = ["owner", "admin"].includes(user.role);
  const [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [theme, setTheme] = useState("dark"),
    [themeReady, setThemeReady] = useState(false),
    [podsOpen, setPodsOpen] = useState(!!activePodId),
    [chatsOpen, setChatsOpen] = useState(true),
    [profileOpen, setProfileOpen] = useState(false);
  const profileMenu = useRef<HTMLDetailsElement>(null), profileSummary = useRef<HTMLElement>(null);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setTheme(localStorage.getItem("aix-theme") === "light" ? "light" : "dark");
    setThemeReady(true);
    setCollapsed(localStorage.getItem("aix-product-sidebar") === "collapsed");
  }, []);
  useEffect(() => {
    const update = () =>
      setTheme(
        localStorage.getItem("aix-theme") === "light" ? "light" : "dark",
      );
    window.addEventListener("aix-theme-change", update);
    return () => window.removeEventListener("aix-theme-change", update);
  }, []);
  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("aix-theme", theme);
  }, [theme, themeReady]);
  useEffect(() => { setMobile(false); setProfileOpen(false); }, [path, query]);
  useEffect(() => {
    if (!profileOpen) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !profileMenu.current?.contains(event.target)) setProfileOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [profileOpen]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearch();
      }
      if (e.key === "Escape") {
        if (mobile) { setMobile(false); setProfileOpen(false); mobileToggle.current?.focus(); }
        else if (profileOpen) { setProfileOpen(false); profileSummary.current?.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onSearch, profileOpen, mobile]);
  const recent = chats
    .filter((c) => !c.podId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);
  useEffect(() => { if (activePodId) setPodsOpen(true); }, [activePodId]);
  return (
    <div
      className={
        "product-shell " +
        (collapsed ? "rail-collapsed" : "") +
        " " +
        (mobile ? "mobile-open" : "")
      }
    >
      <a className="skip-link" href="#product-main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="product-rail-scrim"
          onClick={() => { setMobile(false); mobileToggle.current?.focus(); }}
          aria-label="Close navigation"
        />
      )}
      <aside className="product-rail" id="aix-sidebar" aria-label="Workspace navigation">
        <div className="product-brand-row">
          <Link
            className="product-brand"
            href="/"
            aria-label="AI Xccelerate home"
          >
            <img
              src={
                theme === "dark"
                  ? "/brand/aix-icon-dark.png"
                  : "/brand/aix-icon.png"
              }
              alt=""
            />
            <span>AI Xccelerate</span>
          </Link>
          <button
            className="product-icon-button rail-toggle"
            onClick={() =>
              setCollapsed((v) => {
                localStorage.setItem(
                  "aix-product-sidebar",
                  v ? "open" : "collapsed",
                );
                return !v;
              })
            }
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            aria-controls="aix-sidebar"
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>
        <div className="product-rail-scroll">
          {settingsMode ? <SettingsNavigation admin={admin} /> : <>
          <nav className="product-nav product-primary-nav" aria-label="Main navigation">
            <Link href="/conversation/new" aria-label="New chat" title="New chat" className={path === "/conversation/new" || path === "/" && query.get("guide") !== "1" ? "selected product-new-chat" : "product-new-chat"}><Plus size={18} /><span>New chat</span></Link>
            <button onClick={onSearch} aria-label="Search workspace" title="Search workspace"><Search size={17} /><span>Search</span><kbd>⌘ K</kbd></button>
            <Link href="/conversations" aria-label="Chats" title="Chats" className={path === "/conversations" ? "selected" : ""}><MessageSquare size={17} /><span>Chats</span></Link>
            <Link href="/agents" aria-label="Agents" title="Agents" className={path.startsWith("/agents") ? "selected" : ""}><Bot size={17} /><span>Agents</span></Link>
            <Link href="/inbox" aria-label="Work inbox" title="Work inbox" className={path === "/inbox" || path.startsWith("/work/") ? "selected" : ""}><Inbox size={17} /><span>Work inbox</span></Link>
          </nav>
          <div className="product-nav-section">
            <button onClick={() => setPodsOpen(!podsOpen)} aria-expanded={podsOpen}>{podsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>Projects</span></button>
            <Link href="/pods?create=1" aria-label="Create project"><Plus size={14} /></Link>
          </div>
          {podsOpen && <div className="product-nav-list">
            {pods.filter(p => !p.archived).slice(0, 6).map(p => <Link className={activePodId === p.id ? "selected" : ""} key={p.id} href={"/pods/" + p.id}><Box size={16} /><span>{p.name}</span></Link>)}
            <Link className="product-nav-empty" href={pods.some(p => !p.archived) ? "/pods" : "/pods?create=1"}>{pods.some(p => !p.archived) ? "All projects" : "Create your first project"}</Link>
          </div>}
          <div className="product-nav-section"><button onClick={() => setChatsOpen(!chatsOpen)} aria-expanded={chatsOpen}>{chatsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>Recent chats</span></button></div>
          {chatsOpen && <div className="product-nav-list conversations">
            {recent.map(c => <Link key={c.id} className={path === "/conversation/" + c.id ? "selected" : ""} href={"/conversation/" + c.id}><span>{c.title}</span></Link>)}
            {!recent.length && <p className="product-nav-hint">Your chats will appear here.</p>}
          </div>}
          </>}
        </div>
        <footer className="product-rail-footer">
          <details className="product-user-menu" ref={profileMenu} open={profileOpen} onToggle={event => setProfileOpen(event.currentTarget.open)}>
            <summary ref={profileSummary} aria-label="Profile and settings" title="Profile and settings" aria-expanded={profileOpen}>
              <span className="product-user-avatar">
                {user.name
                  .split(" ")
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                {user.name}
                <small>{user.organizationName}</small>
              </span>
              <ChevronDown size={13} />
            </summary>
            <div className="product-user-popover">
              <div className="product-profile-header"><span className="product-user-avatar">{user.name.split(" ").map(s => s[0]).slice(0,2).join("")}</span><div><strong>{user.name}</strong><small>{user.organizationName}</small></div><span className="product-profile-role">{user.role}</span></div>
              <div className="product-profile-theme"><span>Appearance</span><div role="group" aria-label="Appearance"><button type="button" aria-label="Light appearance" aria-pressed={theme === "light"} onClick={() => { localStorage.setItem("aix-theme", "light"); setTheme("light"); window.dispatchEvent(new Event("aix-theme-change")); }}><Sun size={14} /> Light</button><button type="button" aria-label="Dark appearance" aria-pressed={theme === "dark"} onClick={() => { localStorage.setItem("aix-theme", "dark"); setTheme("dark"); window.dispatchEvent(new Event("aix-theme-change")); }}><Moon size={14} /> Dark</button></div></div>
              <div className="product-profile-workspace"><strong>Workspace</strong><OrganizationPicker /></div>
              <nav className="product-profile-links" aria-label="Profile tools" onClick={() => setProfileOpen(false)}>
                <Link href="/settings?section=appearance"><Settings2 size={16} /><span>Settings</span></Link>
                {admin && <Link href="/settings?section=team"><Users size={16} /><span>Invite members</span></Link>}
              </nav>
              <button
                onClick={async () => {
                  await authClient.signOut();
                  location.href = "/sign-in";
                }}
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          </details>
        </footer>
      </aside>
      <main className="product-main" id="product-main">
        <header className="product-mobile-header">
          <button
            className="product-icon-button"
            ref={mobileToggle}
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
            aria-expanded={mobile}
            aria-controls="aix-sidebar"
          >
            <Menu size={20} />
          </button>
          <Link href="/">AI Xccelerate</Link>
          <button
            className="product-icon-button"
            onClick={onSearch}
            aria-label="Search workspace"
          >
            <Search size={18} />
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}
