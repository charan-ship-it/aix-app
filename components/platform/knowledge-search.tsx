"use client";
import { useState } from "react";
export function KnowledgeSearch() {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<{ name: string; content: string }[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="knowledge-search">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/knowledge/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error);
            setItems(d.items);
            if (!d.items.length)
              setMessage(
                "No matching passages. Check indexing status or try another query.",
              );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          <span className="sr-only">Search knowledge</span>
          <input
            aria-label="Search knowledge"
            placeholder="Search indexed organization knowledge…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="secondary" disabled={busy || !query.trim()}>
          {busy ? "Searching…" : "Search knowledge"}
        </button>
      </form>
      {items.map((r, i) => (
        <article className="search-passage" key={i}>
          <strong>{r.name}</strong>
          <p>{r.content}</p>
        </article>
      ))}
      {message && (
        <p className="settings-note" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
