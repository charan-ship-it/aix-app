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
import { ProductModal } from "./modal";
import "./work-inbox.css";
type Review = {
  id: string;
  status: string;
  chat?: { id: string; title: string };
  pending: { id: string; tool: string; input: unknown }[];
  error?: string;
};
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
    [busy, setBusy] = useState(""),
    [review, setReview] = useState<Review>();
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
  async function openReview(item: WorkInboxItem) {
    setBusy(item.id);
    setError("");
    try {
      const result = await request<Review>(`/api/runs/${item.id}`);
      if (result.status !== "awaiting_approval")
        throw Error("This item changed. Refresh to see its current status.");
      setReview(result);
    } catch (e) {
      setError((e as Error).message);
      void refresh();
    } finally {
      setBusy("");
    }
  }
  async function decide(approved: boolean) {
    if (!review) return;
    setBusy(review.id);
    setError("");
    try {
      await request(`/api/runs/${review.id}/approve`, {
        approved,
        expectedApprovalIds: review.pending.map((p) => p.id),
      });
      setReview(undefined);
      setNotice(
        approved
          ? "Actions approved. The run will continue in its conversation."
          : "Actions denied. The agent will receive your decision.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
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
        {error && !review && (
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
                    <ShieldCheck size={16} />
                  ) : item.status === "completed" ? (
                    <CheckCheck size={16} />
                  ) : (
                    <Inbox size={16} />
                  )}
                  <span>{workStatus(item.status)}</span>
                </div>
                <div className="work-inbox-content">
                  <Link
                    className="work-inbox-title"
                    href={`/conversation/${item.chatId}`}
                  >
                    {item.title}
                  </Link>
                  <p>
                    {item.agentName}
                    {item.podName ? (
                      <>
                        {" "}
                        in{" "}
                        <Link href={`/pods/${item.podId}`}>{item.podName}</Link>
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
                  {item.status === "awaiting_approval" ? (
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() => openReview(item)}
                    >
                      {busy === item.id ? "Opening…" : "Review actions"}
                    </button>
                  ) : (
                    <Link
                      className="secondary"
                      href={`/conversation/${item.chatId}`}
                    >
                      {item.status === "failed"
                        ? "Resolve in conversation"
                        : "Open conversation"}
                      <ArrowUpRight size={13} />
                    </Link>
                  )}
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
      {review && (
        <ProductModal
          title="Review requested actions"
          onClose={() => {
            if (!busy) setReview(undefined);
          }}
          wide
        >
          <div className="product-modal-body work-review">
            <p>
              Review every action and its exact inputs before deciding. Your
              decision applies to all {review.pending.length} actions shown
              below.
            </p>
            {review.pending.map((p) => (
              <section key={p.id}>
                <h3>{p.tool}</h3>
                <pre>{JSON.stringify(p.input, null, 2)}</pre>
              </section>
            ))}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Link
              href={`/conversation/${review.chat?.id}`}
              className="product-starter-link"
            >
              Read the full conversation
            </Link>
            <div className="product-modal-actions">
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() => setReview(undefined)}
              >
                Back
              </button>
              <button
                className="secondary"
                disabled={!!busy || !review.pending.length}
                onClick={() => decide(false)}
              >
                Deny these actions
              </button>
              <button
                className="primary"
                disabled={!!busy || !review.pending.length}
                onClick={() => decide(true)}
              >
                {busy ? "Saving decision…" : "Approve these actions"}
              </button>
            </div>
          </div>
        </ProductModal>
      )}
    </>
  );
}
