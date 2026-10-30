"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCheck,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { request } from "@/lib/product-client";
import {
  inWorkFilter,
  workStatus,
  type WorkFilter,
  type WorkInboxData,
  type WorkInboxItem,
} from "@/lib/work-inbox";
import "./work-inbox.css";
const filters: [WorkFilter, string][] = [
  ["attention", "Needs you"],
  ["working", "Working"],
  ["finished", "Finished"],
  ["all", "All work"],
];
export function WorkInbox() {
  const [data, setData] = useState<WorkInboxData>(),
    [filter, setFilter] = useState<WorkFilter>("attention"),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  async function refresh(signal?: AbortSignal) {
    try {
      const next = await request<WorkInboxData>(
        "/api/inbox",
        undefined,
        signal,
      );
      setData(next);
      setError("");
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh(controller.signal);
    }, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  async function markReviewed(item: WorkInboxItem) {
    setBusy(item.id);
    setError("");
    try {
      await request("/api/inbox", { id: item.id, updatedAt: item.updatedAt });
      setNotice("Marked reviewed. Its history is preserved.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const items = data?.items || [];
  const visible = items.filter(
    (i) =>
      inWorkFilter(i, filter) &&
      `${i.title} ${i.agentName} ${i.podName || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <header className="product-page-head">
        <div>
          <h1>Work inbox</h1>
          <p>
            Decisions, blockers, and results from your agents—all in one place.
          </p>
        </div>
        <button className="secondary" onClick={() => refresh()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>
      <div className="product-page-scroll work-inbox">
        <div className="work-inbox-toolbar">
          <nav aria-label="Work status">
            {filters.map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "active" : ""}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
                <span>{items.filter((i) => inWorkFilter(i, id)).length}</span>
              </button>
            ))}
          </nav>
          <input
            aria-label="Search your work"
            placeholder="Search work, agent, or project"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {notice && (
          <p role="status" className="work-inbox-notice">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!data && !error ? (
          <div className="product-loading">
            <Loader2 size={20} /> Loading your work…
          </div>
        ) : visible.length ? (
          <div className="work-inbox-list">
            {visible.map((item) => (
              <article key={item.id} className="work-inbox-row">
                <div
                  className={`work-inbox-status work-inbox-status-${item.status}`}
                >
                  {item.status === "awaiting_approval" ? (
                    <ShieldCheck size={16} aria-hidden="true" />
                  ) : item.status === "completed" ? (
                    <CheckCheck size={16} aria-hidden="true" />
                  ) : (
                    <Inbox size={16} aria-hidden="true" />
                  )}
                  <span>{workStatus(item.status)}</span>
                </div>
                <div className="work-inbox-content">
                  <Link
                    className="work-inbox-title"
                    href={`/work/${encodeURIComponent(item.id)}`}
                  >
                    {item.title}
                  </Link>
                  <p>
                    {item.agentName}
                    {item.podName ? (
                      <>
                        {" "}
                        in{" "}
                        <Link href={`/pods/${encodeURIComponent(item.podId!)}`}>
                          {item.podName}
                        </Link>
                      </>
                    ) : (
                      " · Personal conversation"
                    )}
                  </p>
                  {item.error && (
                    <p className="work-inbox-error">{item.error}</p>
                  )}
                  {item.pendingCount > 0 && (
                    <small>
                      {item.pendingCount} action
                      {item.pendingCount === 1 ? "" : "s"} waiting for your
                      decision
                    </small>
                  )}
                  <small>
                    {new Date(item.updatedAt).toLocaleString()}
                    {item.reviewed ? " · Reviewed" : ""}
                  </small>
                </div>
                <div className="work-inbox-actions">
                  <Link
                    className={
                      item.status === "awaiting_approval"
                        ? "primary"
                        : "secondary"
                    }
                    href={`/work/${encodeURIComponent(item.id)}`}
                  >
                    {item.status === "awaiting_approval"
                      ? "Review actions"
                      : "View work"}
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                  <Link
                    className="secondary"
                    href={`/conversation/${encodeURIComponent(item.chatId)}`}
                  >
                    Conversation
                  </Link>
                  {["failed", "completed", "cancelled"].includes(item.status) &&
                    !item.reviewed && (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() => markReviewed(item)}
                      >
                        Mark reviewed
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="work-inbox-empty">
            <Inbox size={28} />
            <h2>
              {query
                ? "No matching work"
                : filter === "attention"
                  ? "Nothing needs your attention"
                  : filter === "working"
                    ? "No work running right now"
                    : "Your work will appear here"}
            </h2>
            <p>
              {query
                ? "Try an agent name, project, or another status."
                : "Start with an outcome. Your agents’ decisions and results will return here, including work started on a schedule."}
            </p>
            <div>
              <Link className="primary" href="/conversation/new">
                Start a conversation
              </Link>
              <Link className="secondary" href="/agents">
                Choose an agent
              </Link>
            </div>
          </div>
        )}
        {data && (
          <p className="work-inbox-footnote">
            Up to {data.limit} recent work items, with approvals and blockers
            first. Only your own work in projects you can still access is shown.
            Marking reviewed never retries a task.
          </p>
        )}
      </div>
    </>
  );
}
