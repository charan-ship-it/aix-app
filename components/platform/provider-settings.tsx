"use client";
import { useState, useEffect } from "react";
export type ProviderStatus = {
  provider: "anthropic" | "openai" | "composio";
  configured: boolean;
  source: string;
  lastFour?: string;
  models: string[];
};
export type ProviderSettingsData = {
  providers: ProviderStatus[];
  secureStorage: boolean;
};
export function ProviderSettings({
  onChange,
  admin,
}: {
  onChange: () => void;
  admin: boolean;
}) {
  const [settings, setSettings] = useState<ProviderSettingsData | null>(null),
    [keys, setKeys] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [removeProvider, setRemoveProvider] = useState("");
  async function refresh() {
    try {
      const r = await fetch("/api/settings");
      const d = await r.json();
      if (r.ok) setSettings(d);
      else setMessage(d.error);
    } catch {
      setMessage(
        "Could not load model settings. Check your connection and reopen this page.",
      );
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  async function mutate(provider: string, remove = false) {
    setBusy(provider);
    setMessage("");
    try {
      const r = await fetch("/api/settings", {
        method: remove ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(!remove ? { apiKey: keys[provider] } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSettings(d);
      setRemoveProvider("");
      setKeys((k) => ({ ...k, [provider]: "" }));
      setMessage(remove ? "API key removed." : "API key verified and saved.");
      onChange();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="settings-section">
      <h2>Model connections</h2>
      <p className="settings-note">
        API keys are encrypted in your organization’s database and used only on
        the server. Provider usage is billed to these accounts.
      </p>
      {(["anthropic", "openai"] as const).map((provider) => {
        const status = settings?.providers.find((p) => p.provider === provider);
        return (
          <form
            className="provider-form"
            key={provider}
            onSubmit={(e) => {
              e.preventDefault();
              mutate(provider);
            }}
          >
            <div className="setting-row">
              <div>
                <strong>
                  {provider === "anthropic"
                    ? "Anthropic Claude"
                    : provider === "openai"
                      ? "OpenAI"
                      : "Composio"}
                </strong>
                <p>
                  {provider === "openai"
                      ? "Run OpenAI agents and generate embeddings for semantic RAG."
                      : "Run Claude agents with your instructions and tools."}
                </p>
              </div>
              <span className="status-pill">
                {status?.configured
                  ? status.lastFour
                    ? "Connected · …" + status.lastFour
                    : "Server connection"
                  : settings
                    ? "Not connected"
                    : "Checking…"}
              </span>
            </div>
            {admin && (
              <div className="provider-key-row">
                <label>
                  <span className="sr-only">{provider} API key</span>
                  <input
                    aria-label={provider + " API key"}
                    type="password"
                    value={keys[provider] || ""}
                    onChange={(e) =>
                      setKeys((k) => ({ ...k, [provider]: e.target.value }))
                    }
                    placeholder={
                      status?.configured ? "Replace API key" : "Enter API key"
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button
                  className="primary"
                  disabled={
                    !!busy || !keys[provider] || !settings?.secureStorage
                  }
                >
                  {busy === provider ? "Checking…" : "Verify & save"}
                </button>
                {status?.source === "personal" && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setRemoveProvider(provider)}
                    disabled={!!busy}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
            {removeProvider === provider && (
              <div className="key-removal" role="alert">
                <p>
                  Remove this organization's{" "}
                  {provider === "anthropic"
                    ? "Claude"
                    : provider === "openai"
                      ? "OpenAI"
                      : "Composio"}{" "}
                  key? Employees using it will need a new connection.
                </p>
                <div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setRemoveProvider("")}
                  >
                    Keep key
                  </button>
                  <button
                    type="button"
                    className="danger"
                    disabled={!!busy}
                    onClick={() => mutate(provider, true)}
                  >
                    Remove key
                  </button>
                </div>
              </div>
            )}
            {!!status?.models.length && (
              <p className="settings-note">
                {status.models.length} model IDs available for your agent
                builder.
              </p>
            )}
          </form>
        );
      })}
      {!admin && (
        <p className="settings-note">
          Ask your organization owner or admin to configure these keys.
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
