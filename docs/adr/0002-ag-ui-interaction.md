# ADR 0002 — Add AG-UI and CopilotKit as a scoped interaction layer

Date: 2 November 2026

Status: **Accepted for the locally verified work-detail observer; broader chat adoption remains open.**

## Context

The user authorized selective use of AG-UI and CopilotKit while preserving AIX's backend and visual design. AIX already owns member/organization identity, source access, durable conversations and runs, Redis/BullMQ execution, approvals, cancellation, scheduling and evaluation records. Installing an interaction SDK does not replace or complete those systems.

The first bounded integration is the existing work-detail page. It provides a place to verify live protocol updates and saved results without migrating the conversation composer or introducing another thread database. The meeting feedback recorded in [product feedback](../product-feedback-2026-11-02.md) separately requests agent homes, harness selection, access groups and ambient work; this decision does not claim to implement those requirements.

## Decision

Use the pinned AG-UI 1.0.2 core/client/encoder packages and CopilotKit React/runtime 1.83.0. The work-detail page mounts a code-split CopilotKit headless observer through the supported self-hosted runtime. AIX styling and the existing work-detail reading and decision surfaces remain in use.

The connection is:

1. A current AIX session opens an owned work detail.
2. The scoped CopilotKit provider connects to `/api/copilotkit/[runId]`.
3. The official runtime invokes a bound `AbstractAgent` through a stateless public `AgentRunner`.
4. That observer reads the URL-selected canonical AIX run and emits schema-valid AG-UI lifecycle, message, state and recorded tool events.
5. The headless client uses `state.work` to update the existing page and renders transient response text while it is being saved.

The direct `/api/runs/[id]/ag-ui` adapter exposes the same bounded observation contract. The original conversation event stream remains in place. This is not a full chat migration or a new selectable agent harness.

## Ownership and authority

| Concern | Owner |
| --- | --- |
| Identity, tenant/member scope and current source authorization | AIX session and server access checks |
| Business run ID, status, request, saved result and review state | Existing PostgreSQL/Drizzle records |
| Actual model/tool execution, approvals, dispatch and scheduling | Existing AIX runtime and Redis/BullMQ workers |
| Typed transport and frontend subscription state | AG-UI with a scoped CopilotKit provider |
| Action decisions and stopping a business run | Existing AIX approval/cancel/review endpoints |

The canonical business run is selected by the authenticated URL. The AG-UI `runId` identifies an individual observation; changing it cannot select another business run. The `threadId` must match the canonical conversation. The client cannot supply execution authority: incoming history/state is ignored, and nonempty tools, context, resume commands, parent-run selection or forwarded action properties are rejected. No frontend action handler, model fallback, new queue, prompt write-back or second thread store is registered.

The standard runtime route permits only authenticated information/capabilities reads and observation runs. Stop, connect and thread-storage commands are not exposed through that route. Detaching an SDK observer only closes observation; the business run continues until the existing explicit Stop action is used.

## Protocol and privacy behavior

- A safe work-detail snapshot supplies durable request/result data and credential-redacted evidence. Whole private chats, internal model messages, agent instructions and Composio sessions are not forwarded.
- Active text deltas and tool names/status come from actual existing Redis events. Raw transient tool arguments, approval envelopes and whole-chat completion envelopes are not forwarded.
- Current membership and conversation/project access are checked before output, including after awaited source reads. Revocation clears source-bearing SDK state/messages and ends the observation with a generic error.
- Pending approval ends an observation with an AG-UI interrupt. It does not mark the business run successful or authorize its pending actions. The existing approval API still receives exact approval IDs and enforces stale-decision checks.
- A bounded observation window may end while a business run is active. It produces a reconnect interrupt; a fresh scoped observer reconnects without submitting an approval or starting another model run.
- Final message snapshots replace transient preview messages. Legacy same-name overlapping tool events lack reliable call identity, so ambiguous outcomes are labeled with unavailable correlation rather than assigned to a guessed call.

## Supported open-source deployment

The installed CopilotKit React/runtime and AG-UI core package manifests declare MIT licenses. This implementation uses the standard self-hosted runtime path, not `selfManagedAgents`, `agents__unsafe_dev_only`, a hosted Intelligence account or a license-key bypass. Inspection of the installed provider identified `selfManagedAgents` as an Enterprise Intelligence production path, so it was deliberately not selected.

No CopilotKit public API/license key or hosted data service is required by this observer. Product model funding and optional organization provider credentials remain separate AIX concerns. Docker disables SDK telemetry before process startup and disables Scarf installation analytics; the runtime also uses its supported telemetry opt-out. No learning capture or memory route is enabled.

## Verification and rollout

The current verification includes 82 automated tests, TypeScript, the production Docker build and six actual HTTP/SDK acceptance groups. The HTTP checks use the installed `HttpAgent` and `ProxiedCopilotRuntimeAgent`, including controlled Redis text/tool updates and authoritative saved-result replacement. These checks establish wiring and access behavior, not live model quality. See [verification evidence](../ag-ui-qa-2026-11-02.md) for commands and browser acceptance status.

The acceptance script runs with Node 24 native TypeScript support. The `tsx` loader redirects a dependency's valid JavaScript entry to its published TypeScript stub, which references absent source files; no dependency files are patched to conceal that incompatibility.

If the observer regresses, disable its work-detail mount and routes. Existing saved work, approvals, polling and conversation streaming remain available. No database migration or rollback of business records is required for this integration.

## Limits and follow-through

This decision does not provide agent-computer sandboxes, a harness picker, always-on responsibilities, customer team sharing, generative UI construction, product-funded inference or subscription-backed model execution. The main conversation composer still uses its existing stream. Additional interaction surfaces require their own tested adapter and permission boundaries; they must not be reported complete merely because the SDK is installed.

## References

- [CopilotKit architecture](https://docs.copilotkit.ai/concepts/architecture) and [custom AG-UI agents](https://docs.copilotkit.ai/agent-spec/backend/custom-ag-ui-agent).
- [AG-UI overview](https://docs.ag-ui.com/introduction) and [HTTP agent client](https://docs.ag-ui.com/sdk/js/client/http-agent).
- [CopilotKit open-source telemetry](https://docs.copilotkit.ai/open-source-telemetry).
- [AIX observer](../../lib/server/ag-ui.ts), [bound runtime](../../lib/server/copilotkit-observer.ts), [headless panel](../../components/product/run-interaction.tsx), and [existing execution runtime](../../lib/server/runtime.ts).
