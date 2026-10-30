"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, MessageSquare, ChevronRight, Lock } from "lucide-react";
import type { Chat } from "@/lib/workspace";
import type { AgentConfig } from "@/lib/agent-config";
import { conversationHref } from "@/lib/product-client";
export function ConversationHistory({
  chats,
  agents,
  podName,
}: {
  chats: Chat[];
  agents: AgentConfig[];
  podName: string;
}) {
  const [search, setSearch] = useState("");
  const items = chats.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="product-conversation-history">
      <div className="product-history-toolbar">
        <h2>Conversations</h2>
        <label className="product-search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search Pod conversations"
            placeholder="Search conversations…"
          />
        </label>
      </div>
      {items.map((c) => (
        <Link
          key={c.id}
          href={conversationHref(c)}
          className="product-history-row"
        >
          <span className="product-history-avatar">
            <MessageSquare size={18} />
          </span>
          <div>
            <strong>{c.title}</strong>
            <p>
              {c.messages.find((m) => m.role === "user")?.content.slice(0, 160)}
            </p>
            <small>
              {agents.find((a) => a.id === c.agentId)?.name || "Agent"}
              <span>
                {new Date(c.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </small>
          </div>
          <ChevronRight size={16} />
        </Link>
      ))}
      {!items.length && (
        <div className="product-empty compact">
          <MessageSquare size={25} />
          <h2>
            {search
              ? "No conversations match"
              : "Your project starts with a conversation"}
          </h2>
          <p>
            {search
              ? "Try a different search."
              : "Ask an agent about " +
                podName +
                " above, or create a task for it to work on."}
          </p>
        </div>
      )}
      <p className="product-privacy-note">
        <Lock size={12} />
        You’re viewing your conversations in this Pod.
      </p>
    </section>
  );
}
