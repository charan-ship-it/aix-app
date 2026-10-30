"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentConfig } from "@/lib/agent-config";
import type { IntegrationTool } from "@/lib/integration-tests";
import { request } from "@/lib/product-client";
export function ToolPermissions({
  toolkit,
  selected,
  onChange,
}: {
  toolkit: string;
  selected: string[];
  onChange: (slugs: string[] | undefined) => void;
}) {
  const [items, setItems] = useState<IntegrationTool[]>([]),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(query = "") {
    setBusy(true);
    setError("");
    try {
      const d = await request<{ items: IntegrationTool[] }>(
        `/api/connections/tools?toolkit=${toolkit}&search=${encodeURIComponent(query)}`,
      );
      setItems(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [toolkit]);
  return (
    <div className="studio-tool-scope">
      <label>
        Tool access
        <select
          value={selected.length ? "selected" : "all"}
          onChange={(e) => {
            if (e.target.value === "all") onChange(undefined);
            else if (items[0]) onChange([items[0].slug]);
          }}
        >
          <option value="all">
            All tools in this app (subject to action policy)
          </option>
          <option value="selected" disabled={!items.length}>
            Only selected tools
          </option>
        </select>
      </label>
      <div className="integration-tool-search">
        <input
          aria-label={`Search ${toolkit} tools`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a specific tool"
        />
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => load(search)}
        >
          {busy ? "Loading…" : "Search"}
        </button>
      </div>
      {error && (
        <p className="form-error">
          {error} <Link href="/connections">Check app connections</Link>
        </p>
      )}
      {!!selected.length && (
        <>
          <p className="settings-note">
            {selected.length} tools allowed. Keep at least one selected. Search
            results show up to 50 tools.
          </p>
          <div className="studio-v2-checks">
            {[...new Set([...selected, ...items.map((t) => t.slug)])].map(
              (slug) => (
                <label key={slug}>
                  <input
                    type="checkbox"
                    checked={selected.includes(slug)}
                    disabled={selected.length === 1 && selected[0] === slug}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, slug]
                          : selected.filter((t) => t !== slug),
                      )
                    }
                  />
                  <span>
                    <strong>
                      {items.find((t) => t.slug === slug)?.name || slug}
                    </strong>
                    <small>{slug}</small>
                  </span>
                </label>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
export function WorkflowEditor({
  steps,
  onChange,
}: {
  steps: AgentConfig["workflow"];
  onChange: (steps: AgentConfig["workflow"]) => void;
}) {
  return (
    <>
      <div className="studio-v2-section">
        <h2>Define the agent’s workflow</h2>
        <p>
          The agent receives these steps as ordered instructions and uses its
          permitted tools. Approval requests pause the run. Schedules trigger
          the same instructions.
        </p>
      </div>
      {steps.map((s, i) => (
        <section className="studio-workflow-step" key={i}>
          <div className="product-head-actions">
            <strong>Step {i + 1}</strong>
            <button
              className="secondary"
              type="button"
              disabled={i === 0}
              onClick={() => {
                const next = [...steps];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              Move up
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => onChange(steps.filter((_, n) => n !== i))}
            >
              Remove
            </button>
          </div>
          <label>
            Step name
            <input
              value={s.title}
              maxLength={100}
              onChange={(e) =>
                onChange(
                  steps.map((v, n) =>
                    n === i ? { ...v, title: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
          <label>
            What should happen?
            <textarea
              rows={4}
              value={s.instructions}
              maxLength={2000}
              placeholder="Describe the inputs, permitted tools, expected result, and what to do if information is missing."
              onChange={(e) =>
                onChange(
                  steps.map((v, n) =>
                    n === i ? { ...v, instructions: e.target.value } : v,
                  ),
                )
              }
            />
          </label>
        </section>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={steps.length >= 20}
        onClick={() =>
          onChange([
            ...steps,
            { title: `Step ${steps.length + 1}`, instructions: "" },
          ])
        }
      >
        Add workflow step
      </button>
      <p className="studio-v2-hint">
        These are instructions for an agent run. External actions still require
        approval; steps are not separate deployed jobs.
      </p>
    </>
  );
}
