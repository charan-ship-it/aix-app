"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
import {
  integrationScenarios,
  type IntegrationTool,
  type IntegrationTestResult,
} from "@/lib/integration-tests";
import { toolkitCatalog } from "@/lib/agent-config";
import { request } from "@/lib/product-client";
import { ProductModal } from "@/components/product/modal";
export function IntegrationLab({
  toolkit,
  connected,
  onClose,
}: {
  toolkit: string;
  connected: boolean;
  onClose: () => void;
}) {
  const [tools, setTools] = useState<IntegrationTool[]>([]),
    [selected, setSelected] = useState<IntegrationTool>(),
    [search, setSearch] = useState(""),
    [input, setInput] = useState("{}"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [result, setResult] = useState<IntegrationTestResult>(),
    [history, setHistory] = useState<IntegrationTestResult[]>([]);
  const name = toolkitCatalog.find((t) => t.slug === toolkit)?.name || toolkit;
  const scenario = integrationScenarios[toolkit];
  async function load(query = "") {
    setLoading(true);
    setError("");
    try {
      const d = await request<{ items: IntegrationTool[] }>(
        `/api/connections/tools?toolkit=${toolkit}&readOnly=1&search=${encodeURIComponent(query)}`,
      );
      setTools(d.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void request<{ items: IntegrationTestResult[] }>("/api/connections/tests")
      .then((d) => setHistory(d.items.filter((t) => t.toolkit === toolkit)))
      .catch((e) => setError(e.message));
  }, [toolkit]);
  async function run() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const args = JSON.parse(input);
      if (!args || Array.isArray(args) || typeof args !== "object")
        throw Error("Inputs must be a JSON object.");
      const r = await request<IntegrationTestResult>("/api/connections/tests", {
        id: crypto.randomUUID(),
        toolkit,
        tool: selected.slug,
        arguments: args,
        confirmed: true,
      });
      setResult(r);
      setHistory((h) => [r, ...h].slice(0, 30));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ProductModal
      title={`Test ${name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="product-modal-body integration-lab">
        <div className="product-context-note">
          <strong>{scenario?.title}</strong>
          <p>
            {scenario?.query}. Choose an actual tool below and supply its
            required inputs. This check calls your connected account directly;
            no model is required.
          </p>
        </div>
        {!connected && (
          <p className="form-error">
            Connect your {name} account before running a check. You can browse
            tools first.
          </p>
        )}
        <form
          className="integration-tool-search"
          onSubmit={(e) => {
            e.preventDefault();
            void load(search);
          }}
        >
          <label>
            Find a read-only tool
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tool names or a task"
            />
          </label>
          <button className="secondary" disabled={loading || busy}>
            Search
          </button>
        </form>
        {loading ? (
          <p role="status">
            <Loader2 size={16} /> Loading tools from Composio…
          </p>
        ) : (
          <label>
            Available read-only tools
            <select
              disabled={busy}
              value={selected?.slug || ""}
              onChange={(e) => {
                setSelected(tools.find((t) => t.slug === e.target.value));
                setResult(undefined);
                setInput("{}");
              }}
            >
              <option value="">Choose a tool</option>
              {tools.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!loading && !tools.length && !error && (
          <p>No matching read-only tools. Try another search.</p>
        )}
        {selected && (
          <>
            <p>{selected.description}</p>
            <details>
              <summary>Tool input schema · {selected.slug}</summary>
              <pre>{JSON.stringify(selected.inputParameters, null, 2)}</pre>
            </details>
            <label>
              Tool inputs (JSON)
              <textarea
                rows={7}
                spellCheck={false}
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
              />
            </label>
            <p className="settings-note">
              This sends the inputs to {name} using your account. Results are
              private to your membership. Actions that modify data are tested in
              agent conversations with approval.
            </p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="product-modal-actions">
          <button className="secondary" disabled={busy} onClick={onClose}>
            Close
          </button>
          <button
            className="primary"
            disabled={!connected || !selected || busy}
            onClick={run}
          >
            {busy ? <Loader2 size={15} /> : <FlaskConical size={15} />}{" "}
            {busy ? "Calling your app…" : "Run live read-only check"}
          </button>
        </div>
        {result && (
          <section aria-live="polite">
            <h3>
              {result.status === "passed" ? <CheckCircle2 size={16} /> : null}{" "}
              {result.status === "passed"
                ? "Live call completed"
                : "Live check failed"}
            </h3>
            {result.error && <p>{result.error}</p>}
            <pre>{JSON.stringify(result.output, null, 2)}</pre>
          </section>
        )}
        {!!history.length && (
          <details>
            <summary>Previous checks ({history.length})</summary>
            {history.map((h) => (
              <div key={h.id}>
                <strong>
                  {h.tool} · {h.status}
                </strong>
                <p>
                  {new Date(h.startedAt).toLocaleString()}
                  {h.error ? ` · ${h.error}` : ""}
                </p>
                {h.output !== undefined && (
                  <pre>{JSON.stringify(h.output, null, 2)}</pre>
                )}
              </div>
            ))}
          </details>
        )}
      </div>
    </ProductModal>
  );
}
