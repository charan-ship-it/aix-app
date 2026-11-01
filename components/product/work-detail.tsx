"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  GitBranch,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Square,
  Wrench,
} from "lucide-react";
import type { WorkDetail as WorkDetailData } from "@/lib/work-detail";
import { workStatus } from "@/lib/work-inbox";
import "./work-detail.css";

const RunInteraction = dynamic(() => import("./run-interaction"), { ssr: false });

const liveStatuses = new Set(["queued", "running", "awaiting_approval"]);
const terminalStatuses = new Set(["completed", "failed", "cancelled"]);
const statusDescriptions: Record<string, string> = {
  queued:
    "This request is saved and waiting for a worker. You can leave this page and return.",
  running:
    "The agent is working. Tool evidence and the saved result appear here as they become available.",
  awaiting_approval:
    "Work is paused for your decision. Review the requested actions below.",
  completed:
    "This run has finished. Review its saved result before using it or continuing the conversation.",
  failed:
    "This run stopped with an error. Review the details and continue in the conversation when you’re ready.",
  cancelled:
    "This run was stopped. Any saved output and tool evidence remain available below.",
};
function toolName(value: string) {
  const label = value.toLowerCase().replaceAll("_", " ");
  return value === "extract_transcript_actions"
    ? "Extract transcript action items"
    : label.charAt(0).toUpperCase() + label.slice(1);
}
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString();
}
function technical(value: unknown) {
  if (value === undefined) return "No details recorded.";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function WorkDetail({ runId }: { runId: string }) {
  const [data, setData] = useState<WorkDetailData>();
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);
  const requestNumber = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastStatus = useRef("");
  const applyInteractionSnapshot = useCallback((next: WorkDetailData) => {
    if (next.id !== runId) return;
    setData(next);
    lastStatus.current = next.status;
  }, [runId]);
  const clearInteractionSource = useCallback(() => {
    setData(undefined);
    lastStatus.current = "";
    setError("This work is no longer available. Refresh to check your current access.");
  }, []);

  const load = useCallback(async () => {
    clearTimeout(timer.current);
    controller.current?.abort();
    const current = ++requestNumber.current;
    const epoch = generation.current;
    const request = new AbortController();
    controller.current = request;
    setRefreshing(true);
    try {
      const response = await fetch(`/api/work/${encodeURIComponent(runId)}`, {
        cache: "no-store",
        signal: request.signal,
      });
      const next = await response.json();
      if (!response.ok)
        throw new Error(next.error || "This work item is unavailable.");
      if (
        request.signal.aborted ||
        epoch !== generation.current ||
        current !== requestNumber.current
      )
        return;
      setData(next);
      setError("");
      lastStatus.current = next.status;
    } catch (cause) {
      if (
        request.signal.aborted ||
        epoch !== generation.current ||
        current !== requestNumber.current
      )
        return;
      // Fail closed: inaccessible or unverified cached content must not remain on screen.
      setData(undefined);
      lastStatus.current = "";
      setError(
        cause instanceof Error
          ? cause.message
          : "This work item could not be loaded.",
      );
    } finally {
      if (
        !request.signal.aborted &&
        epoch === generation.current &&
        current === requestNumber.current
      ) {
        setRefreshing(false);
        if (
          liveStatuses.has(lastStatus.current) &&
          document.visibilityState === "visible"
        )
          timer.current = setTimeout(() => void load(), 5000);
      }
    }
  }, [runId]);

  useEffect(() => {
    generation.current++;
    setData(undefined);
    setError("");
    setActionError("");
    setNotice("");
    setBusy("");
    lastStatus.current = "";
    void load();
    const visibility = () => {
      if (document.visibilityState === "visible") void load();
      else clearTimeout(timer.current);
    };
    const focus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      requestNumber.current++;
      controller.current?.abort();
      actionController.current?.abort();
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", focus);
    };
  }, [load]);

  async function act(kind: "approve" | "deny" | "cancel" | "review") {
    if (!data || busy) return;
    const epoch = generation.current;
    const request = new AbortController();
    actionController.current = request;
    setBusy(kind);
    setActionError("");
    setNotice("");
    const isDecision = kind === "approve" || kind === "deny";
    if (isDecision && !data.approvalPreviewComplete) {
      setBusy("");
      return;
    }
    const url =
      kind === "review"
        ? "/api/inbox"
        : `/api/runs/${encodeURIComponent(data.id)}/${isDecision ? "approve" : "cancel"}`;
    const body = isDecision
      ? {
          approved: kind === "approve",
          expectedApprovalIds: data.pending.map((item) => item.id),
        }
      : kind === "review"
        ? { id: data.id, updatedAt: data.updatedAt }
        : {};
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: request.signal,
      });
      const result = await response.json();
      if (request.signal.aborted || epoch !== generation.current) return;
      if (!response.ok)
        throw new Error(
          result.error ||
            "The action could not be saved. Refresh and try again.",
        );
      setNotice(
        isDecision
          ? kind === "approve"
            ? "Actions approved. The worker will continue this run."
            : "Actions denied. The agent will receive your decision."
          : kind === "review"
            ? "Marked reviewed. This does not rerun the task."
            : "Stop requested. Completed external actions are not undone.",
      );
      await load();
    } catch (cause) {
      if (request.signal.aborted || epoch !== generation.current) return;
      setActionError(
        cause instanceof Error
          ? cause.message
          : "The action could not be saved.",
      );
      await load();
    } finally {
      if (!request.signal.aborted && epoch === generation.current) setBusy("");
    }
  }

  return (
    <>
      <header className="product-page-head work-detail-head">
        <div>
          <Link className="work-detail-back" href="/inbox">
            <ArrowLeft size={14} aria-hidden="true" /> Work inbox
          </Link>
          <h1>Work details</h1>
        </div>
        <button
          className="secondary"
          disabled={refreshing || !!busy}
          onClick={() => void load()}
        >
          <RefreshCw
            size={14}
            className={refreshing ? "spin" : undefined}
            aria-hidden="true"
          />
          {refreshing ? "Checking…" : "Refresh"}
        </button>
      </header>
      <div className="product-page-scroll work-detail-scroll">
        {error ? (
          <div className="work-detail-unavailable" role="alert">
            <h2>This work is unavailable</h2>
            <p>{error}</p>
            <p>
              Only your own work in projects you can still access can be opened.
            </p>
            <Link className="secondary" href="/inbox">
              Return to your work
            </Link>
          </div>
        ) : !data ? (
          <div className="product-loading" role="status">
            <Loader2 size={22} className="spin" /> Opening this work item…
          </div>
        ) : (
          <div className="work-detail">
            <div className="work-detail-title">
              <span
                role="status"
                className={`work-detail-status status-${data.status}`}
              >
                <span aria-hidden="true" />
                {workStatus(data.status)}
              </span>
              <h2>{data.conversation.title}</h2>
              <p>
                {statusDescriptions[data.status] ||
                  "The status shown here comes from the saved run."}
              </p>
            </div>
            {notice && (
              <p className="work-detail-notice" role="status">
                {notice}
              </p>
            )}
            {actionError && (
              <p className="work-detail-action-error" role="alert">
                {actionError}
              </p>
            )}
            <div className="work-detail-grid">
              <div className="work-detail-story">
                <section
                  className="work-detail-section"
                  aria-labelledby="work-request-title"
                >
                  <div className="work-detail-section-heading">
                    <span className="work-detail-step">1</span>
                    <h3 id="work-request-title">Your request</h3>
                  </div>
                  {data.request.source === "unavailable" ? (
                    <p className="work-detail-muted">
                      The original request could not be reliably matched to this
                      run. Open its conversation for the available context.
                    </p>
                  ) : (
                    <p className="work-detail-request">
                      {data.request.content}
                    </p>
                  )}
                </section>
                <section
                  className="work-detail-section"
                  aria-labelledby="work-progress-title"
                >
                  <div className="work-detail-section-heading">
                    <span className="work-detail-step">2</span>
                    <h3 id="work-progress-title">Progress and decisions</h3>
                  </div>
                  <RunInteraction work={data} onSnapshot={applyInteractionSnapshot} onUnavailable={clearInteractionSource} />
                  {data.error && (
                    <div className="work-detail-blocker">
                      <strong>
                        {data.status === "cancelled"
                          ? "This run was stopped"
                          : "This run needs attention"}
                      </strong>
                      <p>{data.error}</p>
                      {data.status !== "cancelled" &&
                        data.conversation.canContinue && (
                          <Link
                            href={`/conversation/${encodeURIComponent(data.conversation.id)}`}
                          >
                            Resolve in the conversation{" "}
                            <ArrowUpRight size={13} aria-hidden="true" />
                          </Link>
                        )}
                    </div>
                  )}
                  {data.status === "awaiting_approval" && (
                    <div className="work-detail-approval">
                      <h4>
                        <ShieldCheck size={18} aria-hidden="true" /> Review
                        requested actions
                      </h4>
                      <p>
                        Review every action and its recorded inputs. Your
                        decision applies to{" "}
                        {data.pending.length === 1
                          ? "the action shown"
                          : `all ${data.pending.length} actions shown`}
                        .{" "}
                        {data.evidenceRedacted
                          ? "Some credential fields are hidden."
                          : ""}
                      </p>
                      {data.pending.map((item) => (
                        <details open key={item.id}>
                          <summary>{toolName(item.tool)}</summary>
                          <pre>{technical(item.input)}</pre>
                        </details>
                      ))}
                      {!data.approvalPreviewComplete && (
                        <p className="work-detail-result-label">
                          The action preview is incomplete. Approval is
                          unavailable here; open the conversation to inspect the
                          pending work.
                        </p>
                      )}
                      {!data.pending.length ? (
                        <p>
                          No pending actions are available. Refresh to check
                          whether this run has changed.
                        </p>
                      ) : (
                        <div className="work-detail-actions">
                          <button
                            className="primary"
                            disabled={
                              !!busy ||
                              refreshing ||
                              !data.approvalPreviewComplete
                            }
                            onClick={() => void act("approve")}
                          >
                            {busy === "approve"
                              ? "Approving…"
                              : `Approve ${data.pending.length === 1 ? "action" : "all actions"}`}
                          </button>
                          <button
                            className="secondary"
                            disabled={
                              !!busy ||
                              refreshing ||
                              !data.approvalPreviewComplete
                            }
                            onClick={() => void act("deny")}
                          >
                            {busy === "deny" ? "Saving…" : "Deny actions"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {data.evidenceTruncated && (
                    <p className="work-detail-muted">
                      Some recorded evidence exceeds the display limits. This
                      view shows a shortened preview.
                    </p>
                  )}
                  {data.trace.length ? (
                    <div className="work-detail-tools">
                      {data.trace.map((item, index) => (
                        <details key={`${item.tool}-${index}`}>
                          <summary>
                            <Wrench size={14} aria-hidden="true" />
                            <span>{toolName(item.tool)}</span>
                            <small>{item.status}</small>
                            <ChevronRight size={14} aria-hidden="true" />
                          </summary>
                          <div className="work-detail-tool-content">
                            <p>
                              Technical evidence recorded by this run. This is
                              tool output, not a separate verified result.
                            </p>
                            <h4>Input</h4>
                            <pre>{technical(item.input)}</pre>
                            {item.output !== undefined && (
                              <>
                                <h4>Output</h4>
                                <pre>{technical(item.output)}</pre>
                              </>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="work-detail-muted">
                      {liveStatuses.has(data.status)
                        ? "No tool activity has been recorded yet."
                        : "No tool calls were recorded for this run."}
                    </p>
                  )}
                  {liveStatuses.has(data.status) && (
                    <div className="work-detail-live">
                      <span>
                        {data.status === "awaiting_approval"
                          ? "Paused until you decide."
                          : "Updates automatically while this page is visible."}
                      </span>
                      <button
                        className="secondary"
                        disabled={!!busy || refreshing}
                        onClick={() => void act("cancel")}
                      >
                        <Square size={12} aria-hidden="true" />
                        {busy === "cancel" ? "Stopping…" : "Stop run"}
                      </button>
                    </div>
                  )}
                </section>
                <section
                  className="work-detail-section work-detail-result"
                  aria-labelledby="work-result-title"
                >
                  <div className="work-detail-section-heading">
                    <span className="work-detail-step">3</span>
                    <h3 id="work-result-title">Saved result</h3>
                    {data.reviewed && (
                      <span className="work-detail-reviewed">
                        <CheckCheck size={14} aria-hidden="true" /> Reviewed
                      </span>
                    )}
                  </div>
                  {data.result ? (
                    <>
                      {data.result.demo && (
                        <p className="work-detail-result-label">
                          Demo output — not a live model result.
                        </p>
                      )}
                      {data.result.error && (
                        <p className="work-detail-result-label">
                          This saved message reports an error.
                        </p>
                      )}
                      <div className="work-detail-markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            img: ({ alt }) => (
                              <span>
                                {alt
                                  ? `[Image omitted: ${alt}]`
                                  : "[Image omitted]"}
                              </span>
                            ),
                            a: ({ children, ...props }) => (
                              <a
                                {...props}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {data.result.content}
                        </ReactMarkdown>
                      </div>
                      {data.result.sources.length > 0 && (
                        <details className="work-detail-sources">
                          <summary>
                            Recorded sources ({data.result.sources.length})
                          </summary>
                          <ul>
                            {data.result.sources.map((source, index) => (
                              <li key={index}>{source}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  ) : (
                    <p className="work-detail-muted">
                      {data.status === "completed"
                        ? "No saved assistant result could be matched to this run. Check the conversation for context."
                        : liveStatuses.has(data.status)
                          ? "The result will appear here when the agent saves a response."
                          : "This run has no saved assistant result."}
                    </p>
                  )}
                  <div className="work-detail-result-actions">
                    {data.conversation.canContinue ? (
                      <Link
                        className="primary"
                        href={`/conversation/${encodeURIComponent(data.conversation.id)}`}
                      >
                        Continue conversation{" "}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </Link>
                    ) : (
                      <p className="work-detail-muted">
                        This agent or project is unavailable for new work. The
                        saved run remains readable here.
                      </p>
                    )}
                    {terminalStatuses.has(data.status) && !data.reviewed && (
                      <button
                        className="secondary"
                        disabled={!!busy || refreshing}
                        onClick={() => void act("review")}
                      >
                        <CheckCheck size={14} aria-hidden="true" />
                        {busy === "review" ? "Saving…" : "Mark reviewed"}
                      </button>
                    )}
                  </div>
                  <p className="work-detail-muted work-detail-review-note">
                    Reviewing records that you’ve seen this run. It doesn’t
                    approve actions or start another run.
                  </p>
                </section>
              </div>
              <aside className="work-detail-context" aria-label="Work context">
                <div className="work-detail-context-group">
                  <h3>About this work</h3>
                  <dl>
                    <div>
                      <dt>Agent</dt>
                      <dd>{data.agent.name}</dd>
                    </div>
                    <div>
                      <dt>Visibility</dt>
                      <dd>
                        <Lock size={12} aria-hidden="true" /> Private to you
                      </dd>
                    </div>
                    {data.conversation.pod && (
                      <div>
                        <dt>Project</dt>
                        <dd>
                          <Link
                            href={`/pods/${encodeURIComponent(data.conversation.pod.id)}`}
                          >
                            {data.conversation.pod.name}
                          </Link>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Started</dt>
                      <dd>{timestamp(data.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{timestamp(data.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>
                {(data.parent || data.children.length > 0) && (
                  <div className="work-detail-context-group">
                    <h3>
                      <GitBranch size={15} aria-hidden="true" /> Connected work
                    </h3>
                    {data.parent && (
                      <Link
                        className="work-detail-related"
                        href={`/work/${encodeURIComponent(data.parent.id)}`}
                      >
                        <span>
                          <small>Coordinated by</small>
                          {data.parent.agentName}
                        </span>
                        <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    )}
                    {data.children.map((item) => (
                      <Link
                        className="work-detail-related"
                        key={item.id}
                        href={`/work/${encodeURIComponent(item.id)}`}
                      >
                        <span>
                          {item.agentName}
                          <small>{workStatus(item.status)}</small>
                        </span>
                        <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                )}
                {data.usage && (
                  <details className="work-detail-usage">
                    <summary>Usage details</summary>
                    <p>
                      {data.usage.input.toLocaleString()} input tokens
                      <br />
                      {data.usage.output.toLocaleString()} output tokens
                    </p>
                  </details>
                )}
              </aside>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
