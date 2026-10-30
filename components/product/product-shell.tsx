"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Box,
  ChevronDown,
  ChevronRight,
  Layers3,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Sun,
  Moon,
  Users,
  Plug,
  Activity,
  Server,
  LogOut,
  Bot,
  BookOpen,
  Menu,
  House,
  Inbox,
  ListChecks,
} from "lucide-react";
import type { Chat } from "@/lib/workspace";
import type { Pod } from "@/lib/pods";
import { OrganizationPicker } from "@/components/platform/organizations";
import { authClient } from "@/lib/auth-client";
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
  const mode = path.startsWith("/settings")
    ? "admin"
    : path === "/spaces" || path === "/connections"
      ? "spaces"
      : "work";
  const section = query.get("section") || "models";
  const [mobile, setMobile] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [theme, setTheme] = useState("dark"),
    [themeReady, setThemeReady] = useState(false),
    [podsOpen, setPodsOpen] = useState(true),
    [chatsOpen, setChatsOpen] = useState(true);
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
  useEffect(() => setMobile(false), [path, query]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onSearch();
      }
      if (e.key === "Escape") setMobile(false);
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onSearch]);
  const recent = chats
    .filter((c) => !c.podId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 16);
  const settings = [
    ["models", "Model connections", Plug],
    ["team", "Members & invitations", Users],
    ["appearance", "Appearance", Sun],
    ["activity", "Runs & schedules", Activity],
    ["system", "Infrastructure", Server],
  ] as const;
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
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className="product-rail">
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
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>
        <div className="product-modes" aria-label="Workspace areas">
          <Link
            className={mode === "work" ? "active" : ""}
            href="/"
            title="Work"
          >
            <Layers3 size={16} />
            <span>Work</span>
          </Link>
          <Link
            className={mode === "spaces" ? "active" : ""}
            href="/spaces"
            title="Spaces"
          >
            <BookOpen size={16} />
            <span>Spaces</span>
          </Link>
          <Link
            className={mode === "admin" ? "active" : ""}
            href="/settings"
            title="Admin"
          >
            <Settings2 size={16} />
            <span>Admin</span>
          </Link>
        </div>
        <div className="product-rail-scroll">
          {mode === "work" ? (
            <>
              <nav className="product-nav">
                <Link href="/" className={path === "/" ? "selected" : ""}><House size={17} /><span>Home</span></Link>
                <Link
                  className={
                    path === "/conversation/new"
                      ? "selected"
                      : ""
                  }
                  href="/conversation/new"
                >
                  <MessageSquare size={17} />
                  <span>New conversation</span>
                  <kbd>C</kbd>
                </Link>
                <button onClick={onSearch}>
                  <Search size={17} />
                  <span>Search workspace</span>
                  <kbd>⌘ K</kbd>
                </button>
                <Link href="/conversations" className={path === "/conversations" ? "selected" : ""}>
                  <MessageSquare size={17} /><span>All conversations</span>
                </Link>
                <Link href="/my-work" className={path === "/my-work" ? "selected" : ""}>
                  <ListChecks size={17} /><span>My work</span>
                </Link>
                <Link href="/quality" className={path === "/quality" ? "selected" : ""}>
                  <Activity size={17} /><span>Learning & evals</span>
                </Link>
                <Link href="/skills" className={path === "/skills" ? "selected" : ""}>
                  <BookOpen size={17} /><span>Skills</span>
                </Link>
                <Link
                  href="/inbox"
                  className={path === "/inbox" ? "selected" : ""}
                >
                  <Inbox size={17} />
                  <span>Work inbox</span>
                </Link>
                <div className="product-nav-with-action">
                  <Link
                    className={path.startsWith("/agents") ? "selected" : ""}
                    href="/agents"
                  >
                    <Bot size={17} />
                    <span>Agents</span>
                  </Link>
                  <Link
                    href="/agents/new"
                    aria-label="Create agent"
                    className="product-nav-add"
                  >
                    <Plus size={15} />
                  </Link>
                </div>
              </nav>
              <div className="product-nav-section">
                <button
                  onClick={() => setPodsOpen(!podsOpen)}
                  aria-expanded={podsOpen}
                >
                  {podsOpen ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                  <span>Pods</span>
                </button>
                <Link href="/pods?create=1" aria-label="Create Pod">
                  <Plus size={14} />
                </Link>
                <Link href="/pods" aria-label="Browse Pods">
                  <Box size={14} />
                </Link>
              </div>
              {podsOpen && (
                <div className="product-nav-list">
                  {pods
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <Link
                        className={activePodId === p.id ? "selected" : ""}
                        key={p.id}
                        href={"/pods/" + p.id}
                      >
                        <Box size={16} />
                        <span>{p.name}</span>
                      </Link>
                    ))}
                  {!pods.filter((p) => !p.archived).length && (
                    <Link className="product-nav-empty" href="/pods?create=1">
                      Create a home for your project
                    </Link>
                  )}
                </div>
              )}
              <div className="product-nav-section">
                <button
                  onClick={() => setChatsOpen(!chatsOpen)}
                  aria-expanded={chatsOpen}
                >
                  {chatsOpen ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                  <span>Conversations</span>
                </button>
              </div>
              {chatsOpen && (
                <div className="product-nav-list conversations">
                  {recent.length > 0 && <small>Recent</small>}
                  {recent.map((c) => (
                    <Link
                      key={c.id}
                      className={
                        path === "/conversation/" + c.id ? "selected" : ""
                      }
                      href={"/conversation/" + c.id}
                    >
                      <MessageSquare size={15} />
                      <span>{c.title}</span>
                    </Link>
                  ))}
                  {!recent.length && (
                    <p className="product-nav-hint">
                      Your conversations will appear here.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : mode === "spaces" ? (
            <>
              <p className="product-area-description">
                Bring your company context and apps into your agents’ work.
              </p>
              <nav className="product-nav">
                <Link
                  className={path === "/spaces" ? "selected" : ""}
                  href="/spaces"
                >
                  <BookOpen size={17} />
                  <span>Company knowledge</span>
                </Link>
                <Link
                  className={path === "/connections" ? "selected" : ""}
                  href="/connections"
                >
                  <Plug size={17} />
                  <span>App connections</span>
                </Link>
              </nav>
              <Link className="product-back-link" href="/">
                <ArrowLeft size={15} />
                Back to Work
              </Link>
            </>
          ) : (
            <>
              <p className="product-area-description">
                Manage {user.organizationName}.
              </p>
              <nav className="product-nav">
                {settings.map(([id, label, Icon]) => (
                  <Link
                    className={section === id ? "selected" : ""}
                    href={"/settings?section=" + id}
                    key={id}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
              <Link className="product-back-link" href="/">
                <ArrowLeft size={15} />
                Back to Work
              </Link>
            </>
          )}
        </div>
        <footer className="product-rail-footer">
          <button
            className="product-icon-button"
            aria-label={
              theme === "dark"
                ? "Switch to light appearance"
                : "Switch to dark appearance"
            }
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <details className="product-user-menu">
            <summary>
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
              <strong>Workspace</strong>
              <OrganizationPicker />
              <Link href="/settings?section=team">
                <Users size={15} />
                Manage members
              </Link>
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
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
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
