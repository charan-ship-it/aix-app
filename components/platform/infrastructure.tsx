"use client";
import { useEffect, useState } from "react";
export function InfrastructureStatus() {
  const [state, setState] = useState<{
      database: string;
      redis: string;
      worker: string;
      knowledge: { ready: number; queued: number; failed: number };
      storage: string;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    async function refresh() {
      try {
        const r = await fetch("/api/system");
        const d = await r.json();
        if (r.ok) {
          setState(d);
          setError("");
        } else setError(d.error);
      } catch {
        setError("Could not check infrastructure.");
      }
    }
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section className="settings-section">
      <h2>Infrastructure</h2>
      {state ? (
        <>
          <div className="foundation-grid">
            {[
              ["PostgreSQL + pgvector", state.database],
              ["Redis", state.redis],
              ["Background workers", state.worker],
              ["File storage", state.storage],
            ].map(([name, value]) => (
              <div key={name}>
                <span>{name}</span>
                <span className="status-pill">{value}</span>
              </div>
            ))}
          </div>
          <p className="settings-note">
            Knowledge: {state.knowledge.ready} ready, {state.knowledge.queued}{" "}
            queued, {state.knowledge.failed} failed.
          </p>
        </>
      ) : (
        <p className="settings-note">{error || "Checking services…"}</p>
      )}
    </section>
  );
}
