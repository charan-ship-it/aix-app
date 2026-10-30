"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, ChevronRight, Folder, Loader2, Lock, MessageSquare, Plus, RefreshCw, Search, X } from "lucide-react";
import type { AgentConfig } from "@/lib/agent-config";
import type { Pod } from "@/lib/pods";
import type { ConversationIndexItem, ConversationIndexPage } from "@/lib/conversation-index";
import { conversationHref, request } from "@/lib/product-client";
import "./conversations-index.css";

export function ConversationsIndex({ agents, pods, modelConnected }: {
  agents: AgentConfig[];
  pods: Pod[];
  modelConnected: boolean;
}) {
  const routeParams = useSearchParams();
  const debouncedQuery = routeParams.get("q") || "";
  const agentId = routeParams.get("agentId") || "";
  const podId = routeParams.get("podId") || "";
  const [query, setQuery] = useState(debouncedQuery);
  const [items, setItems] = useState<ConversationIndexItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const pageRequest = useRef<AbortController | null>(null);

  useEffect(() => setQuery(debouncedQuery), [debouncedQuery]);
  useEffect(() => {
    if (query.trim() === debouncedQuery) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");
      // Next's native history integration updates useSearchParams without reloading.
      window.history.replaceState(null, "", `/conversations${next.size ? `?${next}` : ""}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);

  const params = new URLSearchParams({ limit: "25" });
  if (debouncedQuery) params.set("q", debouncedQuery);
  if (agentId) params.set("agentId", agentId);
  if (podId) params.set("podId", podId);
  const queryString = params.toString();
  const changingQuery = query.trim() !== debouncedQuery;
  const filtered = !!(query.trim() || agentId || podId);

  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    pageRequest.current?.abort();
    setLoading(true);
    setLoadingMore(false);
    setError("");
    setItems([]);
    setCursor(null);
    void request<ConversationIndexPage>(`/api/conversations?${queryString}`, undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setCursor(result.nextCursor);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Conversations could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      pageRequest.current?.abort();
    };
  }, [queryString, revision]);

  async function loadMore() {
    if (!cursor || loading || loadingMore || changingQuery) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    const currentGeneration = generation.current;
    setLoadingMore(true);
    setError("");
    try {
      const pageParams = new URLSearchParams(queryString);
      pageParams.set("cursor", cursor);
      const result = await request<ConversationIndexPage>(`/api/conversations?${pageParams}`, undefined, controller.signal);
      if (controller.signal.aborted || currentGeneration !== generation.current) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !seen.has(item.id))];
      });
      setCursor(result.nextCursor);
    } catch (cause) {
      if (!controller.signal.aborted && currentGeneration === generation.current)
        setError(cause instanceof Error ? cause.message : "More conversations could not be loaded.");
    } finally {
      if (!controller.signal.aborted && currentGeneration === generation.current) setLoadingMore(false);
    }
  }

  function clearFilters() {
    setQuery("");
    window.history.pushState(null, "", "/conversations");
  }
  function changeFilter(name: "agentId" | "podId", value: string) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(name, value);
    else next.delete(name);
    if (query.trim()) next.set("q", query.trim());
    else next.delete("q");
    window.history.pushState(null, "", `/conversations${next.size ? `?${next}` : ""}`);
  }

  return (
    <section className="conversations-v2">
      <header className="product-page-head">
        <div>
          <h1>Conversations</h1>
          <p>Return to your work across agents and projects.</p>
        </div>
        <div className="conversations-v2-actions">
          <button className="secondary" disabled={loading || loadingMore} onClick={() => setRevision((value) => value + 1)} aria-label="Refresh conversations">
            <RefreshCw size={15} />
          </button>
          <Link className="primary" href="/conversation/new"><Plus size={15} />New conversation</Link>
        </div>
      </header>
      <div className="conversations-v2-filters" aria-label="Filter conversations">
        <label className="product-search-field">
          <Search size={16} />
          <input aria-label="Search conversation titles" placeholder="Search conversation titles…" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="conversations-v2-select">
          <span>Agent</span>
          <select aria-label="Filter by agent" value={agentId} onChange={(event) => changeFilter("agentId", event.target.value)}>
            <option value="">All agents</option>
            {agentId && !agents.some((agent) => agent.id === agentId) && <option value={agentId}>Unavailable agent</option>}
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.archived ? " (archived)" : ""}</option>)}
          </select>
        </label>
        <label className="conversations-v2-select">
          <span>Project</span>
          <select aria-label="Filter by project" value={podId} onChange={(event) => changeFilter("podId", event.target.value)}>
            <option value="">All projects</option>
            {podId && !pods.some((pod) => pod.id === podId) && <option value={podId}>Unavailable project</option>}
            {pods.map((pod) => <option key={pod.id} value={pod.id}>{pod.name}{pod.archived ? " (archived)" : ""}</option>)}
          </select>
        </label>
        {filtered && <button className="conversations-v2-clear" onClick={clearFilters}><X size={14} />Clear filters</button>}
      </div>
      <div className="conversations-v2-body" aria-busy={loading || loadingMore}>
        <p className="conversations-v2-privacy"><Lock size={13} />Only your conversations, including those in projects you can currently access.</p>
        {error && <div className="conversations-v2-error" role="alert"><span>{error}</span><button className="secondary" onClick={() => items.length ? void loadMore() : setRevision((value) => value + 1)} disabled={loadingMore}>Try again</button></div>}
        {loading ? <div className="conversations-v2-loading" role="status"><Loader2 size={19} className="conversations-v2-spinner" />Loading conversations…</div> : items.length ? (
          <>
            <p className="conversations-v2-count" aria-live="polite">{items.length} conversation{items.length === 1 ? "" : "s"} shown{cursor ? " · More available" : ""}</p>
            <div className="conversations-v2-list">
              {items.map((item) => <Link key={item.id} href={conversationHref(item)} className="conversations-v2-row">
                <span className="conversations-v2-avatar"><MessageSquare size={19} /></span>
                <div className="conversations-v2-description">
                  <strong>{item.title || "Untitled conversation"}</strong>
                  <div className="conversations-v2-meta"><span>{item.agentName}</span>{item.podId && <span><Folder size={12} />{item.podName || "Project"}</span>}<span>{item.messageCount} message{item.messageCount === 1 ? "" : "s"}</span></div>
                </div>
                <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time>
                <ChevronRight size={16} className="conversations-v2-chevron" />
              </Link>)}
            </div>
            {cursor && <div className="conversations-v2-more"><button className="secondary" disabled={loadingMore || changingQuery} onClick={() => void loadMore()}>{loadingMore ? <><Loader2 size={14} className="conversations-v2-spinner" />Loading…</> : "Load more conversations"}</button></div>}
          </>
        ) : !error && (
          <div className="product-empty conversations-v2-empty">
            {filtered ? <Search size={29} /> : <MessageSquare size={29} />}
            <h2>{filtered ? "No conversations match" : "Your saved conversations will appear here"}</h2>
            <p>{filtered ? "Try another title, agent or project." : "Start a conversation with an agent, then come back here to pick up where you left off. Chats in Codex remain in Codex and are not added to this history."}</p>
            {filtered ? <button className="secondary" onClick={clearFilters}>Clear filters</button> : <Link className="primary" href="/conversation/new">Start a conversation<ArrowUpRight size={14} /></Link>}
            {!filtered && !modelConnected && <div className="conversations-v2-model"><strong>A model connection is still needed</strong><p>Requests stopped before a model run do not appear as completed conversations.</p><Link href="/settings?section=models">View model connections<ArrowUpRight size={13} /></Link></div>}
          </div>
        )}
      </div>
    </section>
  );
}
