"use client";

import { useEffect, useRef, useState } from "react";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { useAgent } from "@copilotkit/react-core/v2/headless";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Radio, RefreshCw } from "lucide-react";
import type { WorkDetail } from "@/lib/work-detail";
import "./run-interaction.css";

type Props = {
  work: WorkDetail;
  onSnapshot: (work: WorkDetail) => void;
  onUnavailable: () => void;
};
const active = new Set(["queued", "running"]);

/** A code-split, run-scoped SDK observer. It has no model or tool execution authority. */
export default function RunInteraction(props: Props) {
  const [connection, setConnection] = useState(0);
  return (
    <CopilotKitProvider
      key={`${props.work.id}:${props.work.updatedAt}:${connection}`}
      runtimeUrl={`/api/copilotkit/${encodeURIComponent(props.work.id)}`}
      agentId="aix-observer"
      useSingleEndpoint={false}
      credentials="same-origin"
      enableInspector={false}
      showIntelligenceIndicator={false}
    >
      <Observer {...props} reconnect={() => setConnection(value => value + 1)} />
    </CopilotKitProvider>
  );
}

function Observer({ work, onSnapshot, onUnavailable, reconnect }: Props & { reconnect: () => void }) {
  // All three options create a private thread-bound proxy, avoiding shared agent thread mutation.
  // https://docs.copilotkit.ai/reference/hooks/useAgent
  const { agent, isReady } = useAgent({
    agentId: `aix-observation:${work.id}`,
    runtimeAgentId: "aix-observer",
    threadId: work.conversation.id,
  });
  const [connection, setConnection] = useState<"connecting" | "following" | "checked" | "paused" | "disconnected">("connecting");
  const callbacks = useRef({ onSnapshot, onUnavailable, reconnect });
  callbacks.current = { onSnapshot, onUnavailable, reconnect };
  const latestWork = useRef(work);
  latestWork.current = work;
  const [liveText, setLiveText] = useState("");
  const [tool, setTool] = useState("");

  useEffect(() => {
    if (!isReady) return;
    let closed = false;
    let permissionLost = false;
    let failedBusinessRun = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const requestWork = latestWork.current;
    const update = (state: Record<string, unknown>) => {
      if (closed) return;
      if (state.work === null) {
        permissionLost = true;
        callbacks.current.onUnavailable();
        return;
      }
      const next = state.work as WorkDetail | undefined;
      if (next?.id === requestWork.id && next.conversation?.id === requestWork.conversation.id
        && typeof next.status === "string" && typeof next.updatedAt === "string") {
        callbacks.current.onSnapshot(next);
      }
    };
    const start = () => {
      if (closed || document.visibilityState !== "visible") return;
      setConnection("following");
      agent.setMessages([]);
      agent.setState({});
      void agent.runAgent({ tools: [], context: [] }, {
        onStateChanged: ({ state }) => update(state),
        onMessagesChanged: ({ messages }) => {
          if (closed) return;
          const message = messages.findLast(item => item.role === "assistant" &&
            (item.id === `aix-result:${requestWork.id}` || item.id.startsWith(`aix-live:${requestWork.id}:`)));
          setLiveText(message && "content" in message && typeof message.content === "string" ? message.content : "");
        },
        onToolCallStartEvent: ({ event }) => {
          if (!closed) setTool(event.toolCallName.replaceAll("_", " "));
        },
        onRunFinishedEvent: ({ outcome }) => {
          if (closed) return;
          setConnection(outcome === "interrupt" ? "paused" : "checked");
        },
        onRunErrorEvent: ({ event }) => {
          if (closed) return;
          if (event.code === "ACCESS_REVOKED") {
            permissionLost = true;
            callbacks.current.onUnavailable();
          }
          if (event.code === "AIX_RUN_FAILED") {
            failedBusinessRun = true;
            setConnection("checked");
          }
        },
      }).then(() => {
        if (closed || permissionLost) return;
        // A bounded observation may end while the durable job remains active.
        // A fresh provider avoids carrying pending interrupts into an unrelated observation.
        if (active.has(latestWork.current.status) && document.visibilityState === "visible")
          timer = setTimeout(() => callbacks.current.reconnect(), 2000);
      }).catch(() => {
        if (!closed && !permissionLost && !failedBusinessRun) setConnection("disconnected");
      });
    };
    const visibility = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") {
        void agent.detachActiveRun();
        setConnection("paused");
      } else callbacks.current.reconnect();
    };
    start();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      // Detach only the observer. abortRun() would request a runtime stop.
      void agent.detachActiveRun();
    };
  }, [agent, isReady]);

  const labels = {
    connecting: "Connecting to updates…",
    following: active.has(work.status) ? "Following this run" : "Checking saved updates…",
    checked: "Saved updates checked",
    paused: work.status === "awaiting_approval" ? "Waiting for your decision" : "Updates paused",
    disconnected: "Live updates disconnected",
  };
  const showLiveText = active.has(work.status) && liveText && !work.result;
  return (
    <div className="run-interaction" aria-label="Run updates">
      <div className="run-interaction-status">
        <span role="status"><Radio size={14} aria-hidden="true" /> {labels[connection]}</span>
        {(connection === "disconnected" || connection === "paused") && <button className="secondary" onClick={reconnect}><RefreshCw size={13} aria-hidden="true" /> Reconnect updates</button>}
      </div>
      {tool && active.has(work.status) && <p className="run-interaction-tool">Latest recorded activity: {tool}</p>}
      {showLiveText && <div className="run-interaction-preview"><p>Current response · still being saved</p><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: () => <span>[Image omitted]</span>, a: ({ children, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer">{children}</a> }}>{liveText}</ReactMarkdown></div>}
      {connection === "disconnected" && <p className="run-interaction-help">The saved work below remains available. Refresh checks current access and the latest saved state.</p>}
    </div>
  );
}
