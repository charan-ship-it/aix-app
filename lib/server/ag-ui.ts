import { EventType, type BaseEvent, type Message, type RunAgentInput } from "@ag-ui/core";
import { EventSchema, RunAgentInputSchema } from "@ag-ui/core/schemas";
import { EventEncoder } from "@ag-ui/encoder";
import type { WorkDetail } from "@/lib/work-detail";
import { AppError, type WorkspaceUser } from "./http";
import { readWorkDetail } from "./work-detail";
import { readConversationAccess } from "./conversation-access";
import { getRedis } from "./redis";

const active = new Set(["queued", "running"]);
export type AGUIObserverOptions = { signal: AbortSignal; pollMs?: number; maxMs?: number };

function event(value: BaseEvent): BaseEvent {
  // AG-UI 1.0 keeps validators in its explicit schemas entry, not the root package.
  // https://docs.ag-ui.com/sdk/js/core/overview
  return EventSchema.parse(value) as BaseEvent;
}
function nonempty(value: unknown) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
function validateInput(raw: unknown): RunAgentInput {
  const parsed = RunAgentInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(400, "Choose a valid AG-UI observation request.");
  const input = parsed.data as RunAgentInput;
  if (!input.runId.trim() || input.runId.length > 200 || !input.threadId.trim() || input.threadId.length > 200)
    throw new AppError(400, "Choose valid observation and conversation identifiers.");
  if (input.protocolVersion && input.protocolVersion !== "1.0")
    throw new AppError(400, "This endpoint supports AG-UI 1.0.");
  if (input.parentRunId || input.tools.length || input.context.length || nonempty(input.resume) || nonempty(input.forwardedProps))
    throw new AppError(400, "This endpoint observes existing work. Tools, context, resume commands and forwarded actions are not accepted.");
  // SDK clients return their current state/messages on reconnect. They are deliberately ignored:
  // PostgreSQL and the existing worker remain authoritative, with no client state write-back.
  return { threadId: input.threadId, runId: input.runId, protocolVersion: "1.0", messages: [], tools: [], context: [] };
}

function messages(work: WorkDetail): Message[] {
  const result: Message[] = [];
  if (work.request.source !== "unavailable") result.push({ id: `aix-request:${work.id}`, role: "user", content: work.request.content });
  if (work.result) result.push({ id: `aix-result:${work.id}`, role: "assistant", content: work.result.content });
  return result;
}
function snapshot(work: WorkDetail): BaseEvent {
  return event({ type: EventType.STATE_SNAPSHOT, snapshot: { work } });
}
function messageSnapshot(work: WorkDetail): BaseEvent {
  return event({ type: EventType.MESSAGES_SNAPSHOT, messages: messages(work) });
}
function finished(work: WorkDetail, input: RunAgentInput): BaseEvent {
  if (work.status === "failed") return event({ type: EventType.RUN_ERROR, code: "AIX_RUN_FAILED", message: work.error || "This saved run failed. Review its work details." });
  return event({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId,
    outcome: work.status === "cancelled" ? { type: "cancelled" } : work.status === "awaiting_approval" ? {
      type: "interrupt", interrupts: work.pending.length ? work.pending.map(item => ({ id: item.id, reason: "aix.tool-approval", message: "Review this action in AIX before deciding." }))
        : [{ id: `aix-approval:${work.id}`, reason: "aix.approval-refresh", message: "Refresh the pending action review before deciding." }],
    } : { type: "success" }, result: { canonicalRunId: work.id, status: work.status } });
}
async function pause(ms: number, signal: AbortSignal) {
  if (signal.aborted) return;
  await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * Observe one existing AIX run in-process. The observation ID belongs to AG-UI;
 * only the URL-bound canonicalRunId selects work. Nothing here starts/resumes a worker.
 */
export async function prepareAGUIObserver(u: WorkspaceUser, canonicalRunId: string, rawInput: unknown,
  options: AGUIObserverOptions): Promise<{ input: RunAgentInput; events: AsyncGenerator<BaseEvent> }> {
  const observationAbort = new AbortController();
  const signal = AbortSignal.any([options.signal, observationAbort.signal]);
  const input = validateInput(rawInput);
  const initial = await readWorkDetail(u, canonicalRunId);
  if (input.threadId !== initial.conversation.id) throw new AppError(409, "This observation belongs to a different conversation.");
  const pollMs = Math.max(5, Math.min(options.pollMs ?? 1000, 5000));
  const maxMs = Math.max(5, Math.min(options.maxMs ?? 120000, 170000));

  async function* produce(): AsyncGenerator<BaseEvent> {
    const deadline = Date.now() + maxMs;
    let work = initial, last = "0-0", openedText = false, streamedCharacters = 0;
    const liveMessageId = `aix-live:${canonicalRunId}:${input.runId}`;
    const toolCalls = new Map<string, string[]>();
    const ambiguousTools = new Set<string>();
    let lastState = "";
    try {
      work = await readWorkDetail(u, canonicalRunId);
      if (signal.aborted) return;
      yield event({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId, protocolVersion: "1.0" });
      yield snapshot(work);
      yield messageSnapshot(work);
      lastState = JSON.stringify(work);
      if (!active.has(work.status)) { yield finished(work, input); return; }

      while (!signal.aborted && Date.now() < deadline) {
        const batch = await getRedis().xrange(`run-events:${canonicalRunId}`, `(${last}`, "+", "COUNT", 100);
        // Check AFTER an awaited read and immediately before publishing the fetched source data.
        await readConversationAccess(u, initial.conversation.id);
        if (signal.aborted) return;
        // Combine adjacent token deltas before yielding. Access is checked at every source
        // publication below without turning a token stream into one database read per token.
        const decoded: { eventId: string; source: { type?: unknown; data?: unknown } }[] = [];
        for (const [eventId, fields] of batch) {
          last = eventId;
          const index = fields.indexOf("data");
          if (index < 0) continue;
          let source: { type?: unknown; data?: unknown };
          try { source = JSON.parse(fields[index + 1]); } catch { continue; }
          if (!source || typeof source !== "object") continue;
          const previous = decoded.at(-1);
          if (source.type === "text" && typeof source.data === "string" && previous?.source.type === "text" && typeof previous.source.data === "string")
            previous.source.data = (previous.source.data + source.data).slice(0, 160000);
          else decoded.push({ eventId, source });
        }
        for (const { eventId, source } of decoded) {
          if (source.type === "text" && typeof source.data === "string" && streamedCharacters < 160000) {
            if (!openedText) { openedText = true; yield event({ type: EventType.TEXT_MESSAGE_START, messageId: liveMessageId, role: "assistant" }); }
            const delta = source.data.slice(0, 160000 - streamedCharacters);
            streamedCharacters += delta.length;
            if (delta) yield event({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: liveMessageId, delta });
          } else if (source.type === "tool" && source.data && typeof source.data === "object") {
            const name = (source.data as { tool?: unknown }).tool;
            if (typeof name !== "string" || !name || name.length > 200) continue;
            if (!openedText) { openedText = true; yield event({ type: EventType.TEXT_MESSAGE_START, messageId: liveMessageId, role: "assistant" }); }
            const toolCallId = `aix-tool:${canonicalRunId}:${eventId}`;
            if (toolCalls.get(name)?.length) ambiguousTools.add(name);
            toolCalls.set(name, [...(toolCalls.get(name) || []), toolCallId]);
            yield event({ type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, parentMessageId: liveMessageId });
            // Transient Redis inputs can contain credentials. Only status/name travel live;
            // reviewable arguments come from readWorkDetail's bounded credential-safe state.
            yield event({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta: "{}" });
            yield event({ type: EventType.TOOL_CALL_END, toolCallId });
          } else if (source.type === "tool-result" && source.data && typeof source.data === "object") {
            const data = source.data as { tool?: unknown; error?: unknown };
            if (typeof data.tool !== "string") continue;
            const calls = toolCalls.get(data.tool), toolCallId = calls?.pop();
            if (ambiguousTools.has(data.tool)) {
              // Legacy events have no provider tool-call ID. Never claim a result belongs to
              // one of several overlapping same-name calls just by choosing an array order.
              yield event({ type: EventType.CUSTOM, name: "aix.tool-status", value: { tool: data.tool, status: data.error === true ? "failed" : "completed", correlation: "unavailable" } });
            } else if (toolCallId) yield event({ type: EventType.TOOL_CALL_RESULT, toolCallId, messageId: `${toolCallId}:result`, content: JSON.stringify({ status: data.error === true ? "failed" : "completed" }) });
          }
          // Never forward raw approval/error/done envelopes: done contains a whole private
          // conversation, while approval/input is unredacted. Re-read the canonical safe DTO.
        }
        work = await readWorkDetail(u, canonicalRunId);
        if (signal.aborted) return;
        const nextState = JSON.stringify(work);
        if (nextState !== lastState) { yield snapshot(work); lastState = nextState; }
        if (!active.has(work.status)) {
          if (openedText) yield event({ type: EventType.TEXT_MESSAGE_END, messageId: liveMessageId });
          yield messageSnapshot(work);
          yield finished(work, input);
          return;
        }
        await pause(pollMs, signal);
      }
      if (signal.aborted) return;
      await readConversationAccess(u, initial.conversation.id);
      if (openedText) yield event({ type: EventType.TEXT_MESSAGE_END, messageId: liveMessageId });
      // The observation window ending does not mean the underlying business run finished.
      yield event({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId, outcome: { type: "interrupt", interrupts: [{ id: `aix-observe:${canonicalRunId}`, reason: "aix.observer.reconnect", message: "Reconnect to follow this existing run. It continues in the background." }] }, result: { canonicalRunId, status: work.status, reconnect: true } });
    } catch (error) {
      if (signal.aborted) return;
      const denied = error instanceof AppError && [403, 404].includes(error.status);
      // Clear source-bearing client state and finish with a generic transport/access error.
      yield event({ type: EventType.STATE_SNAPSHOT, snapshot: { work: null, unavailable: true } });
      yield event({ type: EventType.MESSAGES_SNAPSHOT, messages: [] });
      yield event({ type: EventType.RUN_ERROR, code: denied ? "ACCESS_REVOKED" : "OBSERVATION_INTERRUPTED", message: denied ? "This work is no longer available." : "The live connection was interrupted. Refresh the work details to reconnect." });
    }
  }
  async function* guarded(): AsyncGenerator<BaseEvent> {
    try {
      for await (const next of produce()) {
        if (signal.aborted) return;
        const sourceFree = (next.type === EventType.RUN_ERROR && ["ACCESS_REVOKED", "OBSERVATION_INTERRUPTED"].includes((next as { code?: string }).code || "")) ||
          (next.type === EventType.STATE_SNAPSHOT && (next as { snapshot?: { work?: unknown } }).snapshot?.work === null) ||
          (next.type === EventType.MESSAGES_SNAPSHOT && (next as { messages?: unknown[] }).messages?.length === 0);
        // Async generators can be consumed slowly. Recheck after consumer yield boundaries,
        // not only when a Redis batch was fetched, before disclosing another source event.
        if (!sourceFree) await readConversationAccess(u, initial.conversation.id);
        if (signal.aborted) return;
        yield next;
      }
    } catch (error) {
      if (signal.aborted) return;
      const denied = error instanceof AppError && [403, 404].includes(error.status);
      yield event({ type: EventType.STATE_SNAPSHOT, snapshot: { work: null, unavailable: true } });
      yield event({ type: EventType.MESSAGES_SNAPSHOT, messages: [] });
      yield event({ type: EventType.RUN_ERROR, code: denied ? "ACCESS_REVOKED" : "OBSERVATION_INTERRUPTED", message: denied ? "This work is no longer available." : "The live connection was interrupted. Refresh the work details to reconnect." });
    }
  }
  const events = guarded();
  const finish = events.return.bind(events);
  events.return = value => { observationAbort.abort(); return finish(value); };
  return { input, events };
}

/** SSE adapter; runtime integrations consume prepareAGUIObserver.events directly. */
export async function openAGUIRunEventStream(u: WorkspaceUser, canonicalRunId: string, input: unknown, options: AGUIObserverOptions) {
  const observer = await prepareAGUIObserver(u, canonicalRunId, input, options);
  const encoder = new EventEncoder({ accept: "text/event-stream" }), utf8 = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const next of observer.events) {
          if (cancelled || options.signal.aborted) break;
          controller.enqueue(utf8.encode(encoder.encode(next)));
        }
      } finally { try { controller.close(); } catch { /* Reader cancelled. */ } }
    },
    async cancel() { cancelled = true; await observer.events.return(undefined); },
  });
}
