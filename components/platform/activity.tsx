"use client";
import { useEffect, useState } from "react";
import type { Agent, Chat } from "@/lib/workspace";
export function Activity({
  agents,
  onOpen,
  agentId,
  podId,
}: {
  agentId?: string;
  podId?: string;
  agents: Agent[];
  onOpen: (chat: Chat) => void;
}) {
  const [items, setItems] = useState<
      { id: string; agentId: string; status: string; createdAt: string }[]
    >([]),
    [message, setMessage] = useState("");
  async function refresh() {
    try {
      const r = await fetch(
        "/api/runs" +
          (podId
            ? "?podId=" + podId
            : agentId
              ? "?agentId=" + encodeURIComponent(agentId)
              : ""),
      );
      const d = await r.json();
      if (r.ok) {
        setItems(d.items);
        setMessage("");
      } else setMessage(d.error);
    } catch {
      setMessage("Could not load runs. Check your connection and refresh.");
    }
  }
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="settings-section">
      <div className="section-line">
        <h2>Recent runs</h2>
        <button onClick={refresh}>Refresh</button>
      </div>
      {items.length ? (
        items.map((r) => (
          <button
            className="run-row"
            key={r.id}
            onClick={async () => {
              const res = await fetch("/api/runs/" + r.id);
              const d = await res.json();
              if (res.ok && d.chat) onOpen(d.chat);
              else setMessage(d.error || "Conversation not available.");
            }}
          >
            <span>
              <strong>
                {agents.find((a) => a.id === r.agentId)?.name || "Agent"}
              </strong>
              <small>{new Date(r.createdAt).toLocaleString()}</small>
            </span>
            <span className={"status-pill run-status-" + r.status}>
              {r.status.replaceAll("_", " ")}
            </span>
          </button>
        ))
      ) : (
        <p className="settings-note">Your agent runs will appear here.</p>
      )}
      {message && <p className="form-error">{message}</p>}
    </section>
  );
}
function describeSchedule(pattern: string) {
  const [minute, hour, , , day] = pattern.split(" ");
  const time = String(hour).padStart(2, "0") + ":" + minute.padStart(2, "0");
  return hour === "*"
    ? "Hourly at minute " + minute
    : day === "1"
      ? "Mondays at " + time
      : "Daily at " + time;
}
export function Schedules({
  agents,
  agentId,
}: {
  agents: Agent[];
  agentId?: string;
}) {
  const [items, setItems] = useState<
      {
        id: string;
        agentId: string;
        name: string;
        pattern: string;
        timezone: string;
      }[]
    >([]),
    [open, setOpen] = useState(false),
    [draft, setDraft] = useState({
      name: "",
      agentId: agents[0]?.id || "",
      prompt: "",
      frequency: "daily",
      time: "09:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const r = await fetch(
        "/api/schedules" +
          (agentId ? "?agentId=" + encodeURIComponent(agentId) : ""),
      );
      const d = await r.json();
      if (r.ok) setItems(d.items);
      else setMessage(d.error);
    } catch {
      setMessage(
        "Could not load schedules. Check your connection and refresh.",
      );
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  return (
    <section className="settings-section">
      <div className="section-line">
        <div>
          <h2>Schedules</h2>
          <p>Run agents in the background at a set time.</p>
        </div>
        <button onClick={() => setOpen(!open)}>
          {open ? "Close" : "New schedule"}
        </button>
      </div>
      {open && (
        <form
          className="schedule-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/schedules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(draft),
              });
              const d = await r.json();
              if (r.ok) {
                setOpen(false);
                setMessage(
                  "Schedule created. Runs will appear in your conversations.",
                );
                refresh();
              } else setMessage(d.error);
            } catch {
              setMessage(
                "Could not save this schedule. Check your connection and try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Schedule name
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Agent
            <select
              value={draft.agentId}
              onChange={(e) => setDraft({ ...draft, agentId: e.target.value })}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prompt
            <textarea
              aria-label="Prompt"
              required
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              placeholder="What should this agent do on each run?"
            />
          </label>
          <div className="builder-columns">
            <label>
              Frequency
              <select
                value={draft.frequency}
                onChange={(e) =>
                  setDraft({ ...draft, frequency: e.target.value })
                }
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Every Monday</option>
              </select>
            </label>
            <label>
              Time
              <input
                type="time"
                required
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              />
            </label>
          </div>
          <label>
            Timezone
            <input
              required
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Create schedule"}
          </button>
        </form>
      )}
      {items.map((s) => (
        <div className="setting-row" key={s.id}>
          <div>
            <strong>{s.name}</strong>
            <p>
              {agents.find((a) => a.id === s.agentId)?.name} ·{" "}
              {describeSchedule(s.pattern)} · {s.timezone}
            </p>
          </div>
          <button
            className="secondary"
            onClick={async () => {
              const r = await fetch("/api/schedules", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: s.id }),
              });
              if (r.ok) refresh();
              else setMessage("Could not remove schedule.");
            }}
          >
            Remove
          </button>
        </div>
      ))}
      {!items.length && !open && (
        <p className="settings-note">
          No scheduled agents yet. Scheduled runs use your organization’s model
          connection. External tool calls still require your approval.
        </p>
      )}
      {message && (
        <p className="settings-note" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
