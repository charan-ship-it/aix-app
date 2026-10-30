"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Beaker,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Lightbulb,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { request } from "@/lib/product-client";
import type { Skill } from "@/lib/skills";
import {
  evaluationSuiteSaveSchema,
  type EvaluationCase,
  type EvaluationSuite as Suite,
  type EvaluationOutput as Variant,
  type EvaluationRun as Evaluation,
} from "@/lib/evals";
import type {
  LearningProposal as Proposal,
  RunFeedback as Feedback,
} from "@/lib/learning";
import { ProductModal } from "./modal";
import "./quality-workspace.css";
type EditorCase = EvaluationCase & {
  containsText?: string;
  notContainsText?: string;
};
type SuiteDraft = {
  id?: string;
  revision: number;
  skillId: string;
  name: string;
  cases: EditorCase[];
};
const blankCase = (): EditorCase => ({
  id: crypto.randomUUID(),
  name: "",
  input: "",
  checks: { contains: [], notContains: [] },
});
const lines = (value: string) =>
  value
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean);
function timestamp(value?: string) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
}
function runLabel(run: Evaluation) {
  return run.status === "completed"
    ? run.outcome === "passed"
      ? "Passed"
      : run.outcome === "errored"
        ? "Execution error"
        : "Assertions failed"
    : run.status === "failed"
      ? "Failed to finish"
      : run.status === "running"
        ? "Running"
        : "Queued";
}
function isRunning(run: Evaluation) {
  return run.status === "queued" || run.status === "running";
}
function VariantResult({ name, result }: { name: string; result?: Variant }) {
  return (
    <section className="quality-output">
      <header>
        <h4>{name}</h4>
        {result && (
          <span className={`quality-status is-${result.status}`}>
            {result.status === "errored"
              ? "Execution error"
              : result.status === "passed"
                ? "Passed"
                : "Assertions failed"}
          </span>
        )}
      </header>
      {!result ? (
        <p className="quality-helper">No output has been recorded yet.</p>
      ) : (
        <>
          {result.error && (
            <p role="alert" className="quality-error">
              {result.error}
            </p>
          )}
          <pre>{result.text || "No text output recorded."}</pre>
          <ul>
            {result.assertions.map((assertion, index) => (
              <li
                key={index}
                className={assertion.passed ? "is-passed" : "is-failed"}
              >
                {assertion.passed ? <Check size={13} /> : <X size={13} />}
                <span>
                  {assertion.kind === "contains"
                    ? "Contains"
                    : assertion.kind === "notContains"
                      ? "Does not contain"
                      : "Maximum characters"}
                  : <code>{String(assertion.expected)}</code>
                  {assertion.actual !== undefined
                    ? ` · Actual: ${assertion.actual}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
export function QualityWorkspace({ admin }: { admin: boolean }) {
  const [tab, setTab] = useState<"evaluations" | "improvements">(
    admin ? "evaluations" : "improvements",
  );
  const [skills, setSkills] = useState<Skill[]>([]),
    [suites, setSuites] = useState<Suite[]>([]),
    [runs, setRuns] = useState<Evaluation[]>([]),
    [proposals, setProposals] = useState<Proposal[]>([]),
    [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState<string>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pollPaused, setPollPaused] = useState(false),
    [pollToken, setPollToken] = useState(0);
  const [suiteDraft, setSuiteDraft] = useState<SuiteDraft>(),
    [startOpen, setStartOpen] = useState(false),
    [startSuiteId, setStartSuiteId] = useState(""),
    [provider, setProvider] = useState<"openai" | "anthropic">("openai"),
    [model, setModel] = useState(""),
    [proposalId, setProposalId] = useState("");
  const [inspectedRun, setInspectedRun] = useState<Evaluation>(),
    [inspecting, setInspecting] = useState(false),
    [candidateOpen, setCandidateOpen] = useState(false),
    [feedbackId, setFeedbackId] = useState(""),
    [skillId, setSkillId] = useState(""),
    [instructions, setInstructions] = useState(""),
    [expectedOutput, setExpectedOutput] = useState(""),
    [rationale, setRationale] = useState(""),
    [shareConfirmed, setShareConfirmed] = useState(false);
  const [reviewing, setReviewing] = useState<Proposal>(),
    [reviewEvalId, setReviewEvalId] = useState(""),
    [reviewReason, setReviewReason] = useState(""),
    [proposalFilter, setProposalFilter] = useState("all");
  const inspectionId = useRef<string | undefined>(undefined);
  useEffect(() => {
    inspectionId.current = inspectedRun?.id;
  }, [inspectedRun?.id]);
  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      request<{ items: Skill[] }>("/api/skills"),
      request<{ items: Proposal[] }>("/api/learning/proposals"),
      request<{ items: Feedback[] }>("/api/learning/feedback"),
      ...(admin
        ? [
            request<{ items: Suite[] }>("/api/evals/suites"),
            request<{ items: Evaluation[] }>("/api/evals/runs"),
          ]
        : []),
    ]);
    if (results[0].status === "fulfilled")
      setSkills(results[0].value.items as Skill[]);
    if (results[1].status === "fulfilled")
      setProposals(results[1].value.items as Proposal[]);
    if (results[2].status === "fulfilled")
      setFeedback(results[2].value.items as Feedback[]);
    if (results[3]?.status === "fulfilled")
      setSuites(results[3].value.items as Suite[]);
    if (results[4]?.status === "fulfilled")
      setRuns(results[4].value.items as Evaluation[]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }, [admin]);
  useEffect(() => {
    let active = true;
    void load()
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);
  const activeIds = runs
    .filter(isRunning)
    .map((run) => run.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!admin || !activeIds || pollPaused) return;
    const controller = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function poll() {
      if (controller.signal.aborted) return;
      if (Date.now() - started > 300000) {
        setPollPaused(true);
        return;
      }
      try {
        if (document.visibilityState !== "hidden") {
          const result = await request<{ items: Evaluation[] }>(
            "/api/evals/runs",
            undefined,
            controller.signal,
          );
          if (controller.signal.aborted) return;
          setRuns(result.items);
          const id = inspectionId.current;
          if (id && result.items.some((run) => run.id === id)) {
            const detail = await request<{ run: Evaluation }>(
              `/api/evals/runs/${encodeURIComponent(id)}`,
              undefined,
              controller.signal,
            );
            if (!controller.signal.aborted && inspectionId.current === id)
              setInspectedRun(detail.run);
          }
          failures = 0;
        }
      } catch {
        failures++;
        if (failures >= 3 && !controller.signal.aborted) {
          setPollPaused(true);
          return;
        }
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), 3000);
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [admin, activeIds, pollPaused, pollToken]);
  async function perform(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await operation();
      await load();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The request could not be completed.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  async function refresh() {
    await perform("refresh", async () => {
      setPollPaused(false);
      setPollToken((value) => value + 1);
    });
  }
  function editSuite(suite?: Suite) {
    setError("");
    setSuiteDraft(
      suite
        ? structuredClone(suite)
        : {
            revision: 0,
            skillId: skills.find((skill) => !skill.archived)?.id || "",
            name: "",
            cases: [blankCase()],
          },
    );
  }
  function updateCase(index: number, next: EditorCase) {
    if (suiteDraft)
      setSuiteDraft({
        ...suiteDraft,
        cases: suiteDraft.cases.map((item, position) =>
          position === index ? next : item,
        ),
      });
  }
  function openStart(suite?: Suite, proposal?: Proposal) {
    setError("");
    setStartSuiteId(
      suite?.id ||
        suites.find((item) => !proposal || item.skillId === proposal.skillId)
          ?.id ||
        "",
    );
    setProposalId(proposal?.id || "");
    setStartOpen(true);
  }
  function chooseSkill(id: string) {
    const skill = skills.find((item) => item.id === id);
    setSkillId(id);
    setInstructions(skill?.instructions || "");
    setExpectedOutput(skill?.expectedOutput || "");
    setShareConfirmed(false);
  }
  function openCandidate() {
    setError("");
    setFeedbackId(feedback[0]?.id || "");
    chooseSkill(skills.find((skill) => !skill.archived)?.id || "");
    setRationale("");
    setCandidateOpen(true);
  }
  async function inspectRun(id: string) {
    setError("");
    setInspecting(true);
    try {
      const result = await request<{ run: Evaluation }>(
        `/api/evals/runs/${encodeURIComponent(id)}`,
      );
      setInspectedRun(result.run);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setInspecting(false);
    }
  }
  const selectedSuite = suites.find((suite) => suite.id === startSuiteId);
  const eligibleProposals = proposals.filter(
    (proposal) =>
      proposal.skillId === selectedSuite?.skillId &&
      proposal.status === "proposed",
  );
  const eligibleReviews = runs.filter(
    (run) =>
      reviewing &&
      run.proposalId === reviewing.id &&
      run.candidateHash === reviewing.candidateHash &&
      run.baselineHash === reviewing.baselineHash &&
      run.baselineVersion === reviewing.baselineVersion &&
      run.executionKind === "model" &&
      run.status === "completed" &&
      run.outcome === "passed" &&
      run.candidatePassed &&
      run.noRegressions &&
      skills.some(
        (skill) =>
          skill.id === reviewing.skillId &&
          skill.version === reviewing.baselineVersion &&
          !skill.archived,
      ) &&
      suites.some(
        (suite) =>
          suite.id === run.suiteId && suite.revision === run.suiteRevision,
      ),
  );
  const shownProposals = useMemo(
    () =>
      proposals.filter(
        (proposal) =>
          proposalFilter === "all" || proposal.status === proposalFilter,
      ),
    [proposals, proposalFilter],
  );
  const selectedFeedback = feedback.find((item) => item.id === feedbackId);
  return (
    <section className="quality-v2">
      <header className="product-page-head">
        <div>
          <h1>Quality</h1>
          <p>
            Test reusable skills, review what happened, and improve them with
            evidence.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => void refresh()}
          disabled={!!busy}
        >
          <RefreshCw
            size={14}
            className={busy === "refresh" ? "quality-spin" : ""}
          />
          Refresh
        </button>
      </header>
      <div
        className="quality-tabs"
        role="tablist"
        aria-label="Quality workspace"
      >
        <button
          role="tab"
          aria-selected={tab === "evaluations"}
          onClick={() => setTab("evaluations")}
        >
          <Beaker size={16} />
          Evaluations
        </button>
        <button
          role="tab"
          aria-selected={tab === "improvements"}
          onClick={() => setTab("improvements")}
        >
          <Lightbulb size={16} />
          Improvements
        </button>
      </div>
      <div
        className="quality-body"
        role="tabpanel"
        aria-label={tab === "evaluations" ? "Evaluations" : "Improvements"}
      >
        {error && (
          <div className="quality-error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {notice && (
          <p className="quality-notice" role="status">
            <Check size={15} />
            {notice}
          </p>
        )}
        {tab === "evaluations" ? (
          !admin ? (
            <div className="quality-empty">
              <LockKeyhole size={26} />
              <h2>Evaluations are managed by administrators</h2>
              <p>
                You can save private feedback on your own responses and propose
                a skill improvement in the Improvements tab.
              </p>
              <button
                className="secondary"
                onClick={() => setTab("improvements")}
              >
                Open improvements
              </button>
            </div>
          ) : (
            <>
              <div className="quality-section-head">
                <div>
                  <h2>Evaluation suites</h2>
                  <p>Small, explicit checks for the work a skill should do.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => editSuite()}
                  disabled={!!busy || !skills.some((skill) => !skill.archived)}
                >
                  <Plus size={15} />
                  Create suite
                </button>
              </div>
              {loading ? (
                <p className="quality-helper" role="status">
                  Loading evaluation suites…
                </p>
              ) : !suites.length ? (
                <div className="quality-empty quality-empty-small">
                  <Beaker size={25} />
                  <h3>Define good work before changing a skill</h3>
                  <p>
                    Create one to six test cases. Check for required text,
                    forbidden text, or an output length limit.
                  </p>
                  {!skills.some((skill) => !skill.archived) && (
                    <a href="/skills">Create a reusable skill first</a>
                  )}
                </div>
              ) : (
                <div className="quality-suite-list">
                  {suites.map((suite) => (
                    <article key={suite.id}>
                      <span className="quality-icon">
                        <Beaker size={19} />
                      </span>
                      <div>
                        <h3>{suite.name}</h3>
                        <p>
                          {skills.find((skill) => skill.id === suite.skillId)
                            ?.name || "Skill unavailable"}{" "}
                          · {suite.cases.length}{" "}
                          {suite.cases.length === 1 ? "case" : "cases"} ·
                          Revision {suite.revision}
                        </p>
                      </div>
                      <div className="quality-row-actions">
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => editSuite(suite)}
                        >
                          Edit cases
                        </button>
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => openStart(suite)}
                        >
                          Run evaluation
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="quality-section-head quality-run-head">
                <div>
                  <h2>Evaluation runs</h2>
                  <p>
                    Recorded model outputs and assertion results. No external
                    tools are used.
                  </p>
                </div>
                {suites.length > 0 && (
                  <button
                    className="secondary"
                    onClick={() => openStart()}
                    disabled={!!busy}
                  >
                    New evaluation
                  </button>
                )}
              </div>
              {pollPaused && activeIds && (
                <p className="quality-helper quality-poll-note">
                  Live updates are paused. Your evaluations continue in the
                  background.{" "}
                  <button onClick={() => void refresh()}>Refresh status</button>
                </p>
              )}
              {!loading && !runs.length ? (
                <div className="quality-empty quality-empty-small">
                  <Clock3 size={23} />
                  <h3>No evaluations run yet</h3>
                  <p>
                    Run a suite against the published skill, or compare it with
                    a proposed candidate.
                  </p>
                </div>
              ) : (
                <div className="quality-runs">
                  {runs.map((run) => (
                    <button
                      key={run.id}
                      className="quality-run-row"
                      disabled={inspecting}
                      onClick={() => void inspectRun(run.id)}
                    >
                      <span
                        className={`quality-status is-${run.status === "completed" ? run.outcome : run.status}`}
                      >
                        {isRunning(run) && (
                          <Loader2 size={12} className="quality-spin" />
                        )}
                        {runLabel(run)}
                      </span>
                      <span className="quality-run-name">
                        <strong>
                          {run.suite?.name ||
                            suites.find((suite) => suite.id === run.suiteId)
                              ?.name ||
                            "Evaluation"}
                        </strong>
                        <small>
                          {run.baseline?.name || "Skill"} v{run.baselineVersion}{" "}
                          ·{" "}
                          {run.proposalId
                            ? "Baseline and candidate"
                            : "Baseline only"}
                        </small>
                      </span>
                      <span className="quality-run-model">
                        {run.model}
                        <small>{timestamp(run.createdAt)}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )
        ) : (
          <>
            <div className="quality-section-head">
              <div>
                <h2>Skill improvements</h2>
                <p>
                  {admin
                    ? "Review explicitly shared candidates and their evaluation evidence."
                    : "Draft a candidate from your private feedback, then choose what to share for review."}
                </p>
              </div>
              <button
                className="primary"
                onClick={openCandidate}
                disabled={
                  !!busy ||
                  !feedback.length ||
                  !skills.some((skill) => !skill.archived)
                }
              >
                <Plus size={15} />
                Propose improvement
              </button>
            </div>
            <div className="quality-privacy">
              <LockKeyhole size={17} />
              <p>
                Your response feedback stays private. A submitted proposal
                shares only the candidate instructions, expected output, and
                rationale you confirm. Publication requires an administrator and
                a passing evaluation of that exact candidate.
              </p>
            </div>
            {!feedback.length && !loading && (
              <p className="quality-helper">
                To draft a candidate, first save feedback using the Feedback
                button on one of your completed responses.
              </p>
            )}
            <div className="quality-proposal-filter">
              <label>
                Show
                <select
                  value={proposalFilter}
                  onChange={(event) => setProposalFilter(event.target.value)}
                >
                  <option value="all">All proposals</option>
                  <option value="proposed">Awaiting review</option>
                  <option value="published">Published</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
            </div>
            {loading ? (
              <p className="quality-helper" role="status">
                Loading proposals…
              </p>
            ) : !shownProposals.length ? (
              <div className="quality-empty">
                <Lightbulb size={26} />
                <h2>
                  {proposals.length
                    ? "No proposals match this filter"
                    : "Make one useful improvement at a time"}
                </h2>
                <p>
                  Use feedback to explain what should change. Review a
                  candidate, test its behavior, and publish only after the
                  evidence is ready.
                </p>
              </div>
            ) : (
              <div className="quality-proposals">
                {shownProposals.map((proposal) => (
                  <article key={proposal.id}>
                    <div className="quality-proposal-top">
                      <span className={`quality-status is-${proposal.status}`}>
                        {proposal.status === "proposed"
                          ? "Awaiting review"
                          : proposal.status === "published"
                            ? `Published${proposal.publishedVersion ? ` as v${proposal.publishedVersion}` : ""}`
                            : "Rejected"}
                      </span>
                      <small>{timestamp(proposal.createdAt)}</small>
                    </div>
                    <h3>{proposal.baseline.name}</h3>
                    <p>
                      {proposal.sharedRationale ||
                        "No shared rationale provided."}
                    </p>
                    <div className="quality-proposal-meta">
                      Based on version {proposal.baselineVersion}
                      {proposal.reviewReason ? (
                        <span>Review: {proposal.reviewReason}</span>
                      ) : null}
                    </div>
                    <footer>
                      <button
                        className="secondary"
                        onClick={() => {
                          setReviewing(proposal);
                          setReviewEvalId("");
                          setReviewReason("");
                          setError("");
                        }}
                      >
                        Review candidate
                      </button>
                      {admin && proposal.status === "proposed" && (
                        <button
                          className="secondary"
                          onClick={() => {
                            setTab("evaluations");
                            openStart(undefined, proposal);
                          }}
                          disabled={
                            !suites.some(
                              (suite) => suite.skillId === proposal.skillId,
                            )
                          }
                        >
                          Evaluate candidate
                        </button>
                      )}
                    </footer>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {suiteDraft && (
        <ProductModal
          title={
            suiteDraft.id ? "Edit evaluation suite" : "Create evaluation suite"
          }
          onClose={() => !busy && setSuiteDraft(undefined)}
          wide
        >
          <form
            className="quality-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("suite", async () => {
                if (
                  !suiteDraft.cases.every(
                    (item) =>
                      item.checks.contains.length ||
                      item.checks.notContains.length ||
                      item.checks.maxChars !== undefined,
                  )
                )
                  throw Error("Add at least one assertion to every test case.");
                const saved = evaluationSuiteSaveSchema.safeParse({
                  id: suiteDraft.id,
                  expectedRevision: suiteDraft.revision,
                  skillId: suiteDraft.skillId,
                  name: suiteDraft.name,
                  cases: suiteDraft.cases,
                });
                if (!saved.success)
                  throw Error(
                    saved.error.issues
                      .map(
                        (issue) =>
                          issue.path.join(" · ") + ": " + issue.message,
                      )
                      .join("; "),
                  );
                await request("/api/evals/suites", saved.data);
                setSuiteDraft(undefined);
                setNotice("Evaluation suite saved.");
              });
            }}
          >
            <div className="quality-form-grid">
              <label className="quality-field">
                Suite name
                <input
                  required
                  maxLength={100}
                  value={suiteDraft.name}
                  onChange={(event) =>
                    setSuiteDraft({ ...suiteDraft, name: event.target.value })
                  }
                  placeholder="e.g. Follow-up evidence and format"
                />
              </label>
              <label className="quality-field">
                Skill
                <select
                  required
                  value={suiteDraft.skillId}
                  disabled={!!suiteDraft.id}
                  onChange={(event) =>
                    setSuiteDraft({
                      ...suiteDraft,
                      skillId: event.target.value,
                    })
                  }
                >
                  <option value="">Choose a skill</option>
                  {skills
                    .filter(
                      (skill) =>
                        !skill.archived || skill.id === suiteDraft.skillId,
                    )
                    .map((skill) => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name} · v{skill.version}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <p className="quality-helper">
              Use synthetic examples you are comfortable sending to the selected
              model provider. These tests run the skill’s instructions without
              company sources or app tools.
            </p>
            <div className="quality-case-editor">
              {suiteDraft.cases.map((item, index) => (
                <fieldset key={item.id}>
                  <legend>Case {index + 1}</legend>
                  <div className="quality-case-name">
                    <label className="quality-field">
                      Case name
                      <input
                        required
                        maxLength={100}
                        value={item.name}
                        onChange={(event) =>
                          updateCase(index, {
                            ...item,
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="quality-icon-button"
                      aria-label={`Remove case ${index + 1}`}
                      disabled={suiteDraft.cases.length <= 1}
                      onClick={() =>
                        setSuiteDraft({
                          ...suiteDraft,
                          cases: suiteDraft.cases.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <label className="quality-field">
                    Input
                    <textarea
                      required
                      rows={3}
                      maxLength={8000}
                      value={item.input}
                      onChange={(event) =>
                        updateCase(index, {
                          ...item,
                          input: event.target.value,
                        })
                      }
                      placeholder="The request this skill should handle"
                    />
                  </label>
                  <div className="quality-form-grid">
                    <label className="quality-field">
                      Must contain
                      <textarea
                        rows={2}
                        value={
                          item.containsText ?? item.checks.contains.join("\n")
                        }
                        onChange={(event) =>
                          updateCase(index, {
                            ...item,
                            containsText: event.target.value,
                            checks: {
                              ...item.checks,
                              contains: lines(event.target.value),
                            },
                          })
                        }
                        placeholder="One required phrase per line"
                      />
                    </label>
                    <label className="quality-field">
                      Must not contain
                      <textarea
                        rows={2}
                        value={
                          item.notContainsText ??
                          item.checks.notContains.join("\n")
                        }
                        onChange={(event) =>
                          updateCase(index, {
                            ...item,
                            notContainsText: event.target.value,
                            checks: {
                              ...item.checks,
                              notContains: lines(event.target.value),
                            },
                          })
                        }
                        placeholder="One forbidden phrase per line"
                      />
                    </label>
                  </div>
                  <label className="quality-field quality-max-chars">
                    Maximum characters <small>Optional</small>
                    <input
                      type="number"
                      min={1}
                      max={20000}
                      value={item.checks.maxChars ?? ""}
                      onChange={(event) =>
                        updateCase(index, {
                          ...item,
                          checks: {
                            ...item.checks,
                            maxChars: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </label>
                </fieldset>
              ))}
            </div>
            <button
              type="button"
              className="secondary"
              disabled={suiteDraft.cases.length >= 6}
              onClick={() =>
                setSuiteDraft({
                  ...suiteDraft,
                  cases: [...suiteDraft.cases, blankCase()],
                })
              }
            >
              <Plus size={14} />
              Add case ({suiteDraft.cases.length}/6)
            </button>
            {error && (
              <p role="alert" className="quality-error">
                {error}
              </p>
            )}
            <div className="product-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={!!busy}
                onClick={() => setSuiteDraft(undefined)}
              >
                Cancel
              </button>
              <button className="primary" disabled={!!busy}>
                {busy === "suite" ? "Saving…" : "Save suite"}
              </button>
            </div>
          </form>
        </ProductModal>
      )}
      {startOpen && (
        <ProductModal
          title="Run an evaluation"
          onClose={() => !busy && setStartOpen(false)}
        >
          <form
            className="quality-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("run", async () => {
                const result = await request<{ run: Evaluation }>(
                  "/api/evals/runs",
                  {
                    suiteId: startSuiteId,
                    provider,
                    model: model.trim(),
                    ...(proposalId ? { proposalId } : {}),
                  },
                );
                setStartOpen(false);
                setInspectedRun(result.run);
                setPollPaused(false);
                setPollToken((value) => value + 1);
                setNotice(
                  "Evaluation queued. Its real outputs will appear here as they are recorded.",
                );
              });
            }}
          >
            <label className="quality-field">
              Evaluation suite
              <select
                required
                value={startSuiteId}
                onChange={(event) => {
                  setStartSuiteId(event.target.value);
                  setProposalId("");
                }}
              >
                <option value="">Choose a suite</option>
                {suites.map((suite) => (
                  <option value={suite.id} key={suite.id}>
                    {suite.name} · {suite.cases.length} cases
                  </option>
                ))}
              </select>
            </label>
            <label className="quality-field">
              Compare with
              <select
                value={proposalId}
                onChange={(event) => setProposalId(event.target.value)}
              >
                <option value="">Published baseline only</option>
                {eligibleProposals.map((proposal) => (
                  <option key={proposal.id} value={proposal.id}>
                    Candidate · {timestamp(proposal.createdAt)} ·{" "}
                    {proposal.sharedRationale.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <div className="quality-form-grid">
              <label className="quality-field">
                Model provider
                <select
                  value={provider}
                  onChange={(event) =>
                    setProvider(event.target.value as "openai" | "anthropic")
                  }
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
              <label className="quality-field">
                Model ID
                <input
                  required
                  maxLength={100}
                  pattern="[a-zA-Z0-9._:-]+"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="A model available to your account"
                />
              </label>
            </div>
            <p className="quality-helper">
              Uses the selected model provider’s saved organization key. Each
              case generates a baseline response
              {proposalId ? " and a candidate response" : ""}, then applies your
              explicit assertions. No external tools or company sources are
              available to the evaluation.
            </p>
            {error && (
              <p role="alert" className="quality-error">
                {error}
              </p>
            )}
            <div className="product-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={!!busy}
                onClick={() => setStartOpen(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={!!busy || !startSuiteId}>
                {busy === "run" ? "Queuing…" : "Run evaluation"}
              </button>
            </div>
          </form>
        </ProductModal>
      )}
      {candidateOpen && (
        <ProductModal
          title="Propose a skill improvement"
          onClose={() => !busy && setCandidateOpen(false)}
          wide
        >
          <form
            className="quality-form"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("proposal", async () => {
                await request("/api/learning/proposals", {
                  feedbackId,
                  skillId,
                  instructions,
                  expectedOutput,
                  sharedRationale: rationale,
                  confirmShare: shareConfirmed,
                });
                setCandidateOpen(false);
                setNotice(
                  "Candidate shared for review. The published skill has not changed.",
                );
              });
            }}
          >
            <label className="quality-field">
              Your private feedback
              <select
                required
                value={feedbackId}
                onChange={(event) => {
                  setFeedbackId(event.target.value);
                  setShareConfirmed(false);
                }}
              >
                <option value="">Choose feedback from your own work</option>
                {feedback.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.rating === "useful" ? "Useful" : "Needs work"} ·{" "}
                    {timestamp(item.updatedAt || item.createdAt)}
                    {item.correction
                      ? ` · ${item.correction.slice(0, 80)}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedFeedback?.correction && (
              <div className="quality-private-context">
                <LockKeyhole size={14} />
                <div>
                  <strong>
                    Private context · not included in the proposal
                  </strong>
                  <p>{selectedFeedback.correction}</p>
                </div>
              </div>
            )}
            <label className="quality-field">
              Skill to improve
              <select
                required
                value={skillId}
                onChange={(event) => chooseSkill(event.target.value)}
              >
                <option value="">Choose a skill</option>
                {skills
                  .filter((skill) => !skill.archived)
                  .map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name} · v{skill.version}
                    </option>
                  ))}
              </select>
            </label>
            <label className="quality-field">
              Candidate instructions
              <textarea
                required
                minLength={20}
                maxLength={6000}
                rows={9}
                value={instructions}
                onChange={(event) => {
                  setInstructions(event.target.value);
                  setShareConfirmed(false);
                }}
              />
            </label>
            <label className="quality-field">
              Expected output
              <textarea
                maxLength={2000}
                rows={3}
                value={expectedOutput}
                onChange={(event) => {
                  setExpectedOutput(event.target.value);
                  setShareConfirmed(false);
                }}
              />
            </label>
            <label className="quality-field">
              Shared rationale
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={3}
                value={rationale}
                onChange={(event) => {
                  setRationale(event.target.value);
                  setShareConfirmed(false);
                }}
                placeholder="Explain the intended change without copying private conversations or feedback."
              />
            </label>
            <p className="quality-helper">
              The skill’s name, description and required apps stay the same.
              This candidate cannot add permissions or update the published
              skill on its own.
            </p>
            <label className="quality-confirm">
              <input
                type="checkbox"
                required
                checked={shareConfirmed}
                onChange={(event) => setShareConfirmed(event.target.checked)}
              />
              <span>
                I reviewed these instructions, expected output and rationale,
                and choose to share them with organization administrators for
                evaluation and review.
              </span>
            </label>
            {error && (
              <p role="alert" className="quality-error">
                {error}
              </p>
            )}
            <div className="product-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={!!busy}
                onClick={() => setCandidateOpen(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={!!busy || !shareConfirmed}>
                {busy === "proposal"
                  ? "Sharing…"
                  : "Share candidate for review"}
              </button>
            </div>
          </form>
        </ProductModal>
      )}
      {inspectedRun && (
        <ProductModal
          title={inspectedRun.suite?.name || "Evaluation results"}
          onClose={() => setInspectedRun(undefined)}
          wide
        >
          <div className="quality-form">
            <div className="quality-result-summary">
              <span
                className={`quality-status is-${inspectedRun.status === "completed" ? inspectedRun.outcome : inspectedRun.status}`}
              >
                {runLabel(inspectedRun)}
              </span>
              <span>
                {inspectedRun.provider} · {inspectedRun.model}
              </span>
              <span>Baseline v{inspectedRun.baselineVersion}</span>
            </div>
            {inspectedRun.error && (
              <p className="quality-error" role="alert">
                {inspectedRun.error}
              </p>
            )}
            {!inspectedRun.results?.length ? (
              <div className="quality-empty quality-empty-small">
                {isRunning(inspectedRun) ? (
                  <>
                    <Loader2 size={22} className="quality-spin" />
                    <p>
                      Waiting for recorded model outputs. This evaluation
                      continues if you close this view.
                    </p>
                  </>
                ) : (
                  <p>
                    No case outputs were recorded. Review the execution error
                    before trying again.
                  </p>
                )}
              </div>
            ) : (
              inspectedRun.results.map((result, index) => (
                <details
                  className="quality-case-result"
                  key={result.caseId}
                  open={index === 0}
                >
                  <summary>
                    <ChevronDown size={15} />
                    {inspectedRun.suite?.cases.find(
                      (item) => item.id === result.caseId,
                    )?.name || `Case ${index + 1}`}
                    <span>
                      {result.baseline.status === "passed"
                        ? "Baseline passed"
                        : result.baseline.status === "errored"
                          ? "Baseline error"
                          : "Baseline failed"}
                      {result.candidate
                        ? ` · Candidate ${result.candidate.status}`
                        : ""}
                    </span>
                  </summary>
                  <div className="quality-result-input">
                    <strong>Test input</strong>
                    <pre>{result.input}</pre>
                  </div>
                  <div
                    className={`quality-result-variants ${result.candidate ? "has-candidate" : ""}`}
                  >
                    <VariantResult
                      name="Published baseline"
                      result={result.baseline}
                    />
                    {inspectedRun.candidate && (
                      <VariantResult
                        name="Proposed candidate"
                        result={result.candidate}
                      />
                    )}
                  </div>
                </details>
              ))
            )}
            <p className="quality-helper">
              These results describe the saved cases and model settings for this
              run. A passing result does not change a published skill.
            </p>
            <div className="product-modal-actions">
              <button
                className="secondary"
                onClick={() => setInspectedRun(undefined)}
              >
                Close
              </button>
            </div>
          </div>
        </ProductModal>
      )}
      {reviewing && (
        <ProductModal
          title={`${reviewing.baseline.name} · candidate review`}
          onClose={() => !busy && setReviewing(undefined)}
          wide
        >
          <div className="quality-form">
            <div className="quality-result-summary">
              <span className={`quality-status is-${reviewing.status}`}>
                {reviewing.status === "proposed"
                  ? "Awaiting review"
                  : reviewing.status}
              </span>
              <span>Baseline version {reviewing.baselineVersion}</span>
            </div>
            <h3 className="quality-subhead">Shared rationale</h3>
            <p className="quality-review-rationale">
              {reviewing.sharedRationale || "No rationale provided."}
            </p>
            <div className="quality-compare">
              <details>
                <summary>Published baseline instructions</summary>
                <pre>{reviewing.baseline.instructions}</pre>
                <p>
                  <strong>Expected output:</strong>{" "}
                  {reviewing.baseline.expectedOutput || "Not specified"}
                </p>
              </details>
              <details open>
                <summary>Candidate instructions</summary>
                <pre>{reviewing.candidate.instructions}</pre>
                <p>
                  <strong>Expected output:</strong>{" "}
                  {reviewing.candidate.expectedOutput || "Not specified"}
                </p>
              </details>
            </div>
            {reviewing.reviewReason && (
              <p className="quality-helper">
                Review note: {reviewing.reviewReason}
              </p>
            )}
            {reviewing.status === "published" && (
              <p className="quality-notice">
                <ShieldCheck size={16} />
                Published as version {reviewing.publishedVersion}. Previous runs
                retain their saved skill versions.
              </p>
            )}
            {admin && reviewing.status === "proposed" && (
              <section className="quality-publish-review">
                <h3>Publication evidence</h3>
                {eligibleReviews.length ? (
                  <label className="quality-field">
                    Passing evaluation for this exact candidate
                    <select
                      required
                      value={reviewEvalId}
                      onChange={(event) => setReviewEvalId(event.target.value)}
                    >
                      <option value="">Choose evaluation evidence</option>
                      {eligibleReviews.map((run) => (
                        <option value={run.id} key={run.id}>
                          {run.suite?.name ||
                            suites.find((suite) => suite.id === run.suiteId)
                              ?.name ||
                            "Evaluation"}{" "}
                          · {timestamp(run.createdAt)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="quality-blocker">
                    Publication is blocked. Run a real evaluation of this exact
                    candidate with all candidate assertions passing and no
                    regressions. The server also checks that the skill and suite
                    are still current.
                  </p>
                )}
                <label className="quality-field">
                  Review reason
                  <textarea
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    minLength={3}
                    maxLength={1000}
                    rows={3}
                    placeholder="Required when rejecting. Explain what should change."
                  />
                </label>
              </section>
            )}
            {error && (
              <p role="alert" className="quality-error">
                {error}
              </p>
            )}
            <div className="product-modal-actions">
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() => setReviewing(undefined)}
              >
                Close
              </button>
              {admin && reviewing.status === "proposed" && (
                <>
                  <button
                    className="secondary"
                    disabled={!!busy || reviewReason.trim().length < 3}
                    onClick={() =>
                      void perform("review", async () => {
                        await request(
                          `/api/learning/proposals/${reviewing.id}/review`,
                          { action: "reject", reason: reviewReason },
                        );
                        setReviewing(undefined);
                        setNotice(
                          "Candidate rejected with your review reason.",
                        );
                      })
                    }
                  >
                    Reject candidate
                  </button>
                  <button
                    className="primary"
                    disabled={!!busy || !reviewEvalId}
                    onClick={() =>
                      void perform("review", async () => {
                        await request(
                          `/api/learning/proposals/${reviewing.id}/review`,
                          {
                            action: "publish",
                            evaluationId: reviewEvalId,
                            expectedCandidateHash: reviewing.candidateHash,
                          },
                        );
                        setReviewing(undefined);
                        setNotice(
                          "Evaluated candidate published as a new skill version.",
                        );
                      })
                    }
                  >
                    {busy === "review"
                      ? "Saving…"
                      : "Publish evaluated candidate"}
                  </button>
                </>
              )}
            </div>
          </div>
        </ProductModal>
      )}
    </section>
  );
}
