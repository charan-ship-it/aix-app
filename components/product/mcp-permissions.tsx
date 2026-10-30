"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AgentConfig } from "@/lib/agent-config";
import type { MCPConnectionSummary } from "@/lib/mcp";
import { request } from "@/lib/product-client";
export function MCPPermissions({
  scopes,
  onChange,
}: {
  scopes: AgentConfig["mcpTools"];
  onChange: (scopes: AgentConfig["mcpTools"]) => void;
}) {
  const [items, setItems] = useState<MCPConnectionSummary[]>([]),
    [tools, setTools] = useState<
      Record<string, { name: string; description?: string }[]>
    >({}),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void request<{ items: MCPConnectionSummary[] }>("/api/connections/mcp")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <h3>MCP tools</h3>
      <p className="studio-v2-hint">
        Choose specific tools from shared workspace servers. MCP calls require
        approval and are unavailable under the read-only policy.{" "}
        <Link href="/connections">Manage MCP connections</Link>
      </p>
      {!items.length && !error && (
        <p className="settings-note">No MCP servers connected yet.</p>
      )}
      {items.map((c) => {
        const scope = scopes.find((s) => s.connectionId === c.id);
        return (
          <details className="studio-tool-scope" key={c.id}>
            <summary>
              {c.name} · {scope?.tools.length || 0} tools selected
              {!c.enabled ? " · disabled" : ""}
            </summary>
            <button
              type="button"
              className="secondary"
              disabled={!c.enabled || !!busy}
              onClick={async () => {
                setBusy(c.id);
                setError("");
                try {
                  const d = await request<{
                    tools: { name: string; description?: string }[];
                  }>("/api/connections/mcp?id=" + c.id);
                  setTools((t) => ({ ...t, [c.id]: d.tools }));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy("");
                }
              }}
            >
              {busy === c.id ? "Discovering…" : "Discover tools"}
            </button>
            <div className="studio-v2-checks">
              {[
                ...new Set([
                  ...(scope?.tools || []),
                  ...(tools[c.id] || []).map((t) => t.name),
                ]),
              ].map((name) => (
                <label key={name}>
                  <input
                    type="checkbox"
                    checked={!!scope?.tools.includes(name)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...(scope?.tools || []), name]
                        : (scope?.tools || []).filter((t) => t !== name);
                      onChange([
                        ...scopes.filter((s) => s.connectionId !== c.id),
                        ...(next.length
                          ? [{ connectionId: c.id, tools: next }]
                          : []),
                      ]);
                    }}
                  />
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {tools[c.id]?.find((t) => t.name === name)?.description}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
      {scopes
        .filter((s) => !items.some((c) => c.id === s.connectionId))
        .map((s) => (
          <p className="form-error" key={s.connectionId}>
            A selected connection is missing.{" "}
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onChange(
                  scopes.filter((c) => c.connectionId !== s.connectionId),
                )
              }
            >
              Remove missing connection
            </button>
          </p>
        ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
