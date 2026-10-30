"use client";
import { useEffect, useState } from "react";
import { Check, MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import { request } from "@/lib/product-client";
import type { RunFeedback as SavedFeedback } from "@/lib/learning";
import { ProductModal } from "./modal";
import "./quality-workspace.css";
export function RunFeedback({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false),
    [saved, setSaved] = useState<SavedFeedback | null>(null),
    [rating, setRating] = useState<"useful" | "needs-work">("useful"),
    [correction, setCorrection] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setOpen(false);
    setSaved(null);
  }, [runId]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void request<{ feedback: SavedFeedback | null }>(
      `/api/learning/feedback?runId=${encodeURIComponent(runId)}`,
      undefined,
      controller.signal,
    )
      .then(({ feedback }) => {
        setSaved(feedback);
        setRating(feedback?.rating || "useful");
        setCorrection(feedback?.correction || "");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, runId]);
  return (
    <div className="quality-feedback">
      <button
        className="quality-feedback-trigger"
        onClick={() => setOpen(true)}
        aria-label="Give feedback on this response"
      >
        {saved ? <Check size={13} /> : <MessageSquare size={13} />}{" "}
        {saved ? "Feedback saved" : "Feedback"}
      </button>
      {open && (
        <ProductModal
          title="Feedback on this response"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <form
            className="quality-feedback-form"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              void request<{ feedback: SavedFeedback }>(
                "/api/learning/feedback",
                { runId, rating, correction },
              )
                .then((result) => {
                  setSaved(result.feedback);
                  setOpen(false);
                })
                .catch((error) => setError(error.message))
                .finally(() => setBusy(false));
            }}
          >
            <p className="quality-helper">
              Your rating and notes stay private. In Quality, you can choose a
              skill improvement to share with your organization.
            </p>
            {loading ? (
              <p role="status" className="quality-helper">
                Loading your feedback…
              </p>
            ) : (
              <>
                <fieldset className="quality-feedback-rating" disabled={busy}>
                  <legend>Was this response useful?</legend>
                  <label className={rating === "useful" ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name={`rating-${runId}`}
                      value="useful"
                      checked={rating === "useful"}
                      onChange={() => setRating("useful")}
                    />
                    <ThumbsUp size={15} />
                    Useful
                  </label>
                  <label
                    className={rating === "needs-work" ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name={`rating-${runId}`}
                      value="needs-work"
                      checked={rating === "needs-work"}
                      onChange={() => setRating("needs-work")}
                    />
                    <ThumbsDown size={15} />
                    Needs work
                  </label>
                </fieldset>
                <label className="quality-field">
                  What should stay or change?
                  <textarea
                    value={correction}
                    onChange={(event) => setCorrection(event.target.value)}
                    maxLength={3000}
                    rows={5}
                    placeholder="Describe the issue or the behavior you want to keep. Add only the details you want to save."
                  />
                  <small>
                    {correction.length.toLocaleString()} / 3,000 characters
                  </small>
                </label>
                <p className="quality-helper">
                  This saves your text with a reference to the run. It does not
                  automatically copy the response or change an agent’s
                  instructions.
                </p>
              </>
            )}
            {error && (
              <p className="quality-error" role="alert">
                {error}
              </p>
            )}
            <div className="product-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy || loading}>
                {busy ? "Saving…" : "Save private feedback"}
              </button>
            </div>
          </form>
        </ProductModal>
      )}
    </div>
  );
}
