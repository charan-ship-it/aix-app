import { AbstractAgent } from "@ag-ui/client";
import type { BaseEvent, RunAgentInput } from "@ag-ui/core";
import { AgentRunner, CopilotRuntime, createCopilotRuntimeHandler, type AgentRunnerRunRequest } from "@copilotkit/runtime/v2";
import { Observable, throwError } from "rxjs";
import type { WorkspaceUser } from "./http";
import { AppError } from "./http";
import { prepareAGUIObserver } from "./ag-ui";

/** Public AG-UI adapter API; no model, tool, queue, or business-run mutation is registered. */
class BoundObservationAgent extends AbstractAgent {
  constructor(private user: WorkspaceUser, private canonicalRunId: string, private signal: AbortSignal, threadId: string) {
    super({ agentId: "aix-observer", threadId, description: "Observe one authorized AIX run", debug: false });
  }

  override clone() {
    return new BoundObservationAgent(this.user, this.canonicalRunId, this.signal, this.threadId);
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable(subscriber => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      this.signal.addEventListener("abort", abort, { once: true });
      if (this.signal.aborted) controller.abort();
      let events: AsyncGenerator<BaseEvent> | undefined;
      void (async () => {
        try {
          const observation = await prepareAGUIObserver(this.user, this.canonicalRunId, input, { signal: controller.signal });
          events = observation.events;
          for await (const event of events) {
            if (subscriber.closed || controller.signal.aborted) break;
            subscriber.next(event);
          }
          if (!subscriber.closed) subscriber.complete();
        } catch (error) {
          if (!subscriber.closed && !controller.signal.aborted) subscriber.error(error);
        }
      })();
      return () => {
        controller.abort();
        this.signal.removeEventListener("abort", abort);
        void events?.return(undefined).catch(() => {});
      };
    });
  }
}

/** Stateless runtime runner: observations are not another thread or execution store. */
class ObservationRunner extends AgentRunner {
  constructor(private threadId: string, private ownerId: string) { super(); }
  isThreadAccessible(threadId: string, scope: { ownerId: string }) {
    return threadId === this.threadId && scope.ownerId === this.ownerId;
  }
  run(request: AgentRunnerRunRequest): Observable<BaseEvent> {
    if (request.threadId !== this.threadId || request.ownerId !== this.ownerId)
      return throwError(() => new AppError(403, "This observation is outside your work scope."));
    return request.agent.run(request.input);
  }
  connect(): Observable<BaseEvent> { return throwError(() => new AppError(405, "Start a fresh read-only observation.")); }
  async isRunning() { return false; }
  async stop() { return false; }
}

export function createAIXCopilotHandler(user: WorkspaceUser, runId: string, chatId: string, signal: AbortSignal) {
  // Supported runtime opt-out, also set in Docker. No Intelligence/public key is configured.
  // https://docs.copilotkit.ai/open-source-telemetry
  process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
  const ownerId = JSON.stringify([user.organizationId, user.userId]);
  // Official self-hosted TypeScript runtime + public AgentRunner interface.
  // https://docs.copilotkit.ai/agent-spec/backend/custom-ag-ui-agent
  const runtime = new CopilotRuntime({
    agents: { "aix-observer": new BoundObservationAgent(user, runId, signal, chatId) },
    runner: new ObservationRunner(chatId, ownerId),
    identifyUser: () => ({ id: ownerId, name: user.displayName }),
    generativeUI: false,
    exposeMemoryRoutes: false,
    sseKeepAliveIntervalSeconds: 15,
  });
  return createCopilotRuntimeHandler({ runtime, basePath: `/api/copilotkit/${encodeURIComponent(runId)}`, mode: "multi-route", activateChannels: false });
}
