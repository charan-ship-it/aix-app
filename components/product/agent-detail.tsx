"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Archive,
  ArrowUpRight,
  ChevronRight,
} from "lucide-react";
import { AgentIcon } from "@/app/workspace";
import type { Chat } from "@/lib/workspace";
import { builtinToolLabel, toolkitCatalog, type AgentConfig } from "@/lib/agent-config";
import { conversationHref } from "@/lib/product-client";
import { Activity, Schedules } from "@/components/platform/activity";
import { AgentSkills } from "./agent-skills";
import { ProductModal } from "./modal";
export function AgentDetail({
  agent,
  chats,
  onArchive,
}: {
  agent: AgentConfig;
  chats: Chat[];
  onArchive: (a: AgentConfig, archived: boolean) => Promise<void>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("info"),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <header className="product-page-head">
        <div className="product-agent-heading">
          <AgentIcon agent={agent} />
          <div>
            <Link className="product-back-inline" href="/agents">
              Agents
            </Link>
            <h1>{agent.name}</h1>
          </div>
        </div>
        <div className="product-head-actions">
          <Link
            className="secondary"
            href={"/agents/" + agent.id + "/settings"}
          >
            Edit agent
          </Link>
          {agent.archived ? (
            <button className="primary" onClick={() => onArchive(agent, false)}>
              Restore agent
            </button>
          ) : (
            <Link
              className="primary"
              href={"/conversation/new?agent=" + agent.id}
            >
              <MessageSquare size={15} />
              Use agent
            </Link>
          )}
        </div>
      </header>
      <nav className="product-context-tabs" aria-label="Agent details">
        {[
          ["info", "Info"],
          ["activity", "Activity"],
          ["schedules", "Schedules"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="product-page-scroll agent-detail-scroll">
        {tab === "info" ? (
          <>
            <div className="product-agent-intro">
              <h2>What this agent does</h2>
              <p>{agent.description}</p>
            </div>
            <div className="product-agent-info-grid">
              <section>
                <h2>Instructions</h2>
                <p className="product-instructions">{agent.instructions}</p>
                {!!agent.skillIds?.length && <AgentSkills selected={agent.skillIds} />}
                {!!agent.workflow.length && (
                  <section className="product-agent-workflow" aria-label="Agent workflow">
                    <h2>Workflow</h2>
                    <ol>
                      {agent.workflow.map((step, index) => (
                        <li key={index}>
                          <strong>{step.title}</strong>
                          <p>{step.instructions}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                {!!agent.starters.length && (
                  <>
                    <h2>Try asking</h2>
                    {agent.starters.map((s) => (
                      <Link
                        className="product-starter-link"
                        key={s}
                        href={"/conversation/new?agent=" + agent.id}
                      >
                        {s}
                        <ArrowUpRight size={13} />
                      </Link>
                    ))}
                  </>
                )}
              </section>
              <aside>
                <h2>Capabilities</h2>
                <dl>
                  <dt>Model</dt>
                  <dd>{agent.model}</dd>
                  <dt>Category</dt>
                  <dd>{agent.category}</dd>
                  <dt>Knowledge</dt>
                  <dd>
                    {agent.knowledgeScope === "all"
                      ? "Company knowledge"
                      : agent.knowledgeScope === "none"
                        ? "Disabled"
                        : agent.documentIds.length + " selected sources"}
                  </dd>
                  <dt>External actions</dt>
                  <dd>
                    {agent.externalPolicy === "ask"
                      ? "Approval required"
                      : "Read only"}
                  </dd>
                </dl>
                <h3>Tools</h3>
                <div className="product-tags">
                  {agent.tools.map((t) => (
                    <span key={t}>{builtinToolLabel(t)}</span>
                  ))}
                  {agent.toolkits.map((t) => (
                    <span key={t}>
                      {toolkitCatalog.find((a) => a.slug === t)?.name || t}
                    </span>
                  ))}
                  {!agent.tools.length && !agent.toolkits.length && (
                    <p>No tools enabled.</p>
                  )}
                </div>
                {!!agent.mcpTools.length && (
                  <>
                    <h3>MCP tools · approval required</h3>
                    <div className="product-tags">
                      {agent.mcpTools.flatMap((scope) => scope.tools.map((name) => (
                        <span key={scope.connectionId + name}>{name.replaceAll("_", " ")}</span>
                      )))}
                    </div>
                  </>
                )}
                <div className="product-context-note">
                  <p>
                    Use this agent in any conversation. Project files and goals
                    belong in a Pod.
                  </p>
                  <Link href="/pods">Browse Pods</Link>
                </div>
              </aside>
            </div>
            <section className="product-agent-recent">
              <h2>Your recent conversations</h2>
              <p className="settings-note">Recent direct chats with this agent. The full history also includes conversations in projects you can access.</p>
              <Link href={`/conversations?agentId=${encodeURIComponent(agent.id)}`}>
                <MessageSquare size={16} />
                View all conversations
                <ChevronRight size={14} />
              </Link>
              {chats.slice(0, 5).map((c) => (
                <Link key={c.id} href={conversationHref(c)}>
                  <MessageSquare size={16} />
                  {c.title}
                  <ChevronRight size={14} />
                </Link>
              ))}
              {!chats.length && (
                <p className="settings-note">
                  No direct conversations yet. Start a chat or check the full history for project conversations.
                </p>
              )}
            </section>
            <div className="product-archive-line">
              <button className="secondary" onClick={() => setConfirm(true)}>
                <Archive size={14} />
                Archive agent
              </button>
              <p>
                Preserve its configuration and remove it from active choices.
              </p>
            </div>
          </>
        ) : tab === "activity" ? (
          <Activity
            agents={[agent]}
            agentId={agent.id}
            onOpen={(c) => router.push(conversationHref(c))}
          />
        ) : (
          <Schedules agents={[agent]} agentId={agent.id} />
        )}
      </div>
      {confirm && (
        <ProductModal
          title="Archive this agent?"
          onClose={() => setConfirm(false)}
        >
          <div className="product-modal-body">
            <p>
              Its configuration and conversations are preserved. Restore it from
              the Archived tab in Agents.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="product-modal-actions">
              <button className="secondary" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onArchive(agent, true);
                    setConfirm(false);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Archiving…" : "Archive agent"}
              </button>
            </div>
          </div>
        </ProductModal>
      )}
    </>
  );
}
