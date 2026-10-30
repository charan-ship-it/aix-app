"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { request } from "@/lib/product-client";
import type { MCPConnection, MCPConnectionSummary } from "@/lib/mcp";
import { ProductModal } from "@/components/product/modal";
type MCPTool = { name: string; description?: string; inputSchema: unknown };
export function MCPConnections({ admin }: { admin: boolean }) {
  const [items, setItems] = useState<MCPConnectionSummary[]>([]),
    [editing, setEditing] = useState<MCPConnection>(),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tools, setTools] = useState<{ name: string; items: MCPTool[] }>();
  async function refresh() {
    try {
      setItems(
        (
          await request<{ items: MCPConnectionSummary[] }>(
            "/api/connections/mcp",
          )
        ).items,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function save(connection: MCPConnection, includeToken = false) {
    setBusy(true);
    setError("");
    try {
      await request("/api/connections/mcp", {
        connection,
        ...(includeToken && token ? { token } : {}),
      });
      setEditing(undefined);
      setToken("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mcp-connections">
      <div className="connection-toolbar">
        <div>
          <h2>MCP servers</h2>
          <p className="settings-note">
            Connect once for your organization. Choose specific server tools in
            each agent. Every MCP call requires approval.
          </p>
        </div>
        {admin && (
          <button
            className="secondary"
            onClick={() => {
              setToken("");
              setError("");
              setEditing({
                id: crypto.randomUUID(),
                name: "",
                url: "",
                enabled: true,
              });
            }}
          >
            <Plus size={15} /> Add MCP server
          </button>
        )}
      </div>
      {!items.length && (
        <div className="product-context-note">
          <strong>Bring your own tools</strong>
          <p>
            Add a public HTTPS MCP endpoint and optional bearer token. The app
            checks its handshake and discovers real tools before saving. Tokens
            are encrypted; access is shared within your organization.
          </p>
        </div>
      )}
      {items.map((c) => (
        <article className="mcp-connection-row" key={c.id}>
          <div>
            <strong>{c.name}</strong>
            <p>{c.url}</p>
            <small>
              {c.enabled ? "Enabled" : "Disabled"} ·{" "}
              {c.hasToken ? "Token stored securely" : "No token"}
            </small>
          </div>
          <div className="product-head-actions">
            <button
              className="secondary"
              disabled={busy || !c.enabled}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await request<{ tools: MCPTool[] }>(
                    "/api/connections/mcp?id=" + c.id,
                  );
                  setTools({ name: c.name, items: r.tools });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={14} /> Check & discover
            </button>
            {admin && (
              <>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditing(c);
                    setToken("");
                    setError("");
                  }}
                >
                  Edit
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => save({ ...c, enabled: !c.enabled })}
                >
                  {c.enabled ? "Disable" : "Enable"}
                </button>
              </>
            )}
          </div>
        </article>
      ))}
      {error && !editing && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing && (
        <ProductModal
          title="MCP connection"
          onClose={() => {
            if (!busy) setEditing(undefined);
          }}
        >
          <form
            className="product-modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              void save(editing, true);
            }}
          >
            <label>
              Connection name
              <input
                required
                maxLength={80}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Public HTTPS endpoint
              <input
                required
                type="url"
                value={editing.url}
                placeholder="https://tools.example.com/mcp"
                onChange={(e) =>
                  setEditing({ ...editing, url: e.target.value })
                }
              />
            </label>
            <label>
              Bearer token (optional)
              <input
                type="password"
                autoComplete="new-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  items.some((c) => c.id === editing.id && c.hasToken)
                    ? "Leave blank to keep stored token"
                    : "Enter token if required"
                }
              />
            </label>
            <p className="settings-note">
              Workspace members may use tools from this account. Use Composio
              for each member’s personal app authorization. OAuth-only MCP
              servers need a bearer token supported by that server.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="product-modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Checking server…" : "Check & save connection"}
              </button>
            </div>
          </form>
        </ProductModal>
      )}
      {tools && (
        <ProductModal
          title={`${tools.name} · discovered tools`}
          onClose={() => setTools(undefined)}
          wide
        >
          <div className="product-modal-body">
            <p>
              Handshake completed. Select tools in an agent’s Tools & apps tab
              to use them.
            </p>
            {tools.items.map((t) => (
              <details key={t.name}>
                <summary>{t.name}</summary>
                <p>{t.description}</p>
                <pre>{JSON.stringify(t.inputSchema, null, 2)}</pre>
              </details>
            ))}
          </div>
        </ProductModal>
      )}
    </section>
  );
}
