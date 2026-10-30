"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Box,
  ChevronRight,
  Lock,
  Plus,
  Search,
  Users,
} from "lucide-react";
import type { AgentConfig } from "@/lib/agent-config";
import type { Pod } from "@/lib/pods";
import { agents as builtins } from "@/lib/workspace";
import { AgentIcon } from "@/app/workspace";
export function AgentCatalog({
  agents,
  onArchive,
}: {
  agents: AgentConfig[];
  onArchive: (agent: AgentConfig, archived: boolean) => Promise<void>;
}) {
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const items = useMemo(
    () =>
      agents.filter(
        (a) =>
          (filter === "archived" ? a.archived : !a.archived) &&
          (filter === "workspace"
            ? !builtins.some((b) => b.id === a.id)
            : filter === "builtins"
              ? builtins.some((b) => b.id === a.id)
              : true) &&
          [a.name, a.description, a.category]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [agents, filter, search],
  );
  return (
    <>
      <header className="product-page-head">
        <div>
          <h1>Agents</h1>
          <p>
            Specialists with a role, instructions, and the tools to do their
            job.
          </p>
        </div>
        <Link className="primary" href="/agents/new">
          <Plus size={16} />
          Create agent
        </Link>
      </header>
      <div className="product-page-scroll">
        <div className="product-catalog-toolbar">
          <div className="product-filter-tabs" aria-label="Agent filters">
            {[
              ["all", "All agents"],
              ["workspace", "Workspace"],
              ["builtins", "Built-in"],
              ["archived", "Archived"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "active" : ""}
                onClick={() => setFilter(id)}
                aria-pressed={filter === id}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="product-search-field">
            <Search size={16} />
            <input
              aria-label="Search agents"
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="product-agent-list">
          {items.map((a) => (
            <article key={a.id}>
              <Link href={"/agents/" + a.id} className="product-agent-row">
                <AgentIcon agent={a} />
                <div>
                  <h2>{a.name}</h2>
                  <p>{a.description}</p>
                </div>
                <span className="product-category">{a.category}</span>
                <span className="product-origin">
                  {builtins.some((b) => b.id === a.id)
                    ? "By AI Xccelerate"
                    : "Workspace"}
                </span>
                <ChevronRight size={16} />
              </Link>
              {a.archived && (
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(a.id);
                    try {
                      await onArchive(a, false);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === a.id ? "Restoring…" : "Restore"}
                </button>
              )}
            </article>
          ))}
        </div>
        {!items.length && (
          <div className="product-empty">
            <Search size={27} />
            <h2>
              {search
                ? "No agents match your search"
                : filter === "archived"
                  ? "No archived agents"
                  : "Create an agent for your team"}
            </h2>
            <p>
              {search
                ? "Try a different name or category."
                : filter === "archived"
                  ? "Agents you archive stay here, ready to restore."
                  : "Start with a job description, a template, or your own instructions."}
            </p>
            {!search && filter !== "archived" && (
              <Link className="primary" href="/agents/new">
                Create agent
              </Link>
            )}
          </div>
        )}
        <div className="product-context-note">
          <strong>Agents do the work. Pods keep the project context.</strong>
          <p>
            You can use an agent in a new conversation or choose it inside a
            project Pod.
          </p>
          <Link href="/pods">
            Explore Pods <ArrowUpRight size={13} />
          </Link>
        </div>
      </div>
    </>
  );
}
export function PodCatalog({
  pods,
  agents,
  onCreate,
  onArchive,
}: {
  pods: Pod[];
  agents: AgentConfig[];
  onCreate: () => void;
  onArchive: (pod: Pod, archived: boolean) => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  const items = pods.filter(
    (p) =>
      !!p.archived === archived &&
      [p.name, p.description]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <header className="product-page-head">
        <div>
          <h1>Pods</h1>
          <p>A home for each project’s conversations, files, and tasks.</p>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={16} />
          Create Pod
        </button>
      </header>
      <div className="product-page-scroll">
        <div className="product-catalog-toolbar">
          <div className="product-filter-tabs">
            <button
              className={!archived ? "active" : ""}
              onClick={() => setArchived(false)}
            >
              Active
            </button>
            <button
              className={archived ? "active" : ""}
              onClick={() => setArchived(true)}
            >
              Archived
            </button>
          </div>
          <label className="product-search-field">
            <Search size={16} />
            <input
              aria-label="Search Pods"
              placeholder="Search Pods…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="product-pod-list">
          {items.map((p) => (
            <article key={p.id}>
              <Link href={"/pods/" + p.id}>
                <span className="product-pod-icon">
                  <Box size={23} />
                </span>
                <div>
                  <h2>{p.name}</h2>
                  <p>{p.description || "No description added yet."}</p>
                  <small>
                    {p.access === "private" ? (
                      <Lock size={12} />
                    ) : (
                      <Users size={12} />
                    )}{" "}
                    {p.access === "private" ? "Private" : "Organization"}
                    <span>
                      Default agent:{" "}
                      {agents.find((a) => a.id === p.defaultAgentId)?.name ||
                        "Unavailable"}
                    </span>
                  </small>
                </div>
                <ChevronRight size={16} />
              </Link>
              {archived && (
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy(p.id);
                    try {
                      await onArchive(p, false);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  Restore Pod
                </button>
              )}
            </article>
          ))}
        </div>
        {!items.length && (
          <div className="product-empty">
            <Box size={30} />
            <h2>
              {search
                ? "No matching Pods"
                : archived
                  ? "No archived Pods"
                  : "Give your project a home"}
            </h2>
            <p>
              {search
                ? "Try a different project name."
                : archived
                  ? "Archived projects can be restored here."
                  : "Create a Pod, add the files your agents need, and turn a goal into tasks."}
            </p>
            {!archived && !search && (
              <button className="primary" onClick={onCreate}>
                Create your first Pod
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
