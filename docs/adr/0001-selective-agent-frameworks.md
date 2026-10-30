# ADR 0001 — Adopt framework capabilities inside AIX, without migrating the platform

Date: 29 October 2026

Status: **Accepted; first embedded capability verified locally on 30 October 2026.**

The opt-in transcript workflow is implemented and enabled on the saved Transcript → Action Items agent. Verification: 63 automated tests, 15 HTTP integration groups, TypeScript and the production Docker build passed. A local provider fixture exercised native AIX execution through Mastra to a durable chat result; browser verification confirmed the agent configuration survives reload. This is not live model-quality certification or automatic post-meeting execution. See [verification evidence](../selective-framework-qa-2026-10-30.md).

## Context

The user explicitly wants established framework components used inside AIX and does not authorize replacing the application or migrating everything. AIX already has Next.js UI/API routes, organization identity, PostgreSQL/Drizzle persistence, Redis/BullMQ dispatch, AI SDK `ToolLoopAgent`, scoped Composio/MCP integrations and reviewed learning/eval records.

The [audit](../audit-2026-10-29.md) identifies gaps in the full product journey and ongoing work. Those gaps are not resolved by selecting a framework or installing a package. Avoid adding competing owners for durable jobs, tenant permissions or chat state.

## Decision

Use a bounded Mastra workflow as an **opt-in native capability** named `extract_transcript_actions` within the existing agent runtime. The initial pipeline is:

1. Validate supplied transcript input and size limits.
2. Extract structured candidate action items through the existing model/provider path.
3. Validate quote evidence against the supplied transcript and preserve ambiguous owners/dates.
4. Return structured results and safely rendered table content for the conversation.

Use documented `createStep`, `createWorkflow`, schema validation and committed workflow execution. The existing AI SDK loop invokes the capability as a tool; this is selective orchestration reuse, not an additional hosted Mastra application or an AI SDK replacement.

The extraction capability analyzes supplied text. It does not grant source access, certify recording ownership, fetch an arbitrary URL, create tasks, send email or change a calendar. Scribe/MCP reading remains behind the existing explicit tool permissions and approval rules. Any meeting label/reference supplied to extraction is source metadata, not independently proven identity or ACL evidence.

## Ownership boundaries

| Concern | Owner after this change |
| --- | --- |
| Product UI, routes and navigation | Existing Next.js application |
| Member identity, organization and source authorization | Existing AIX server authorization; source-specific gaps remain open |
| Conversation, run, credential and business records | Existing PostgreSQL/Drizzle data model |
| Dispatch, scheduling, cancellation and recovery | Existing BullMQ/Redis harness |
| General agent/model/tool loop and MCP approval continuation | Existing AI SDK runtime |
| Internal extraction-step sequencing and typed data handoffs | Bounded Mastra workflow |
| Provider keys and model selection | Existing server credential/provider mechanism |
| Feedback and publication gates | Existing learning/evaluation implementation |

Do not introduce a second durable run database or a second scheduler for this capability. A native run remains a native run; a developer-operated Codex/MCP demonstration remains assisted evidence and must not be inserted as a fabricated completed model run.

## Why this piece

Transcript extraction has a narrow contract and a useful sequence of deterministic and model-assisted steps. It can be tested with controlled extraction results, source validation and cancellation without replacing working identity, dispatch or permission code. It gives us evidence about framework fit before expanding its role.

Alternatives considered:

- **Keep every step custom:** retains the fewest dependencies, but leaves more sequencing and validation wiring to maintain. The existing AI SDK remains valid and is retained for the outer loop.
- **Migrate the whole runtime to Mastra or LangGraph:** exceeds the requested scope and creates unnecessary migration risk before a bounded benefit is established.
- **Add multiple orchestration frameworks at once:** creates unclear state and recovery ownership. LangGraph/Deep Agents remain research alternatives rather than additional installed runtime layers in this decision.
- **CopilotKit as the solution to autonomous execution:** a chat/UI integration cannot by itself supply source authorization, triggers, durable jobs, model funding or the product responsibility loop. It is not required for this slice.

## Verification and rollout gates

- Verify API signatures against the installed package declarations and current official documentation; pin the installed direct package version and review lockfile changes.
- Execute the actual Mastra workflow in tests. Controlled extractor/provider fixtures validate wiring; do not report them as live model-quality evidence.
- Check empty/oversized input, unsupported quote evidence, duplicates, missing owners/dates, safe table rendering, provider failure and cancellation.
- Recheck current run context before model work. Keep the capability free of external side effects and use bounded model time/output limits.
- Typecheck and build the existing app/worker, run relevant regression tests, then inspect the saved agent capability in the app.
- Enable only the selected transcript agent through the normal configuration path after integration verification; do not silently widen all saved agents.
- If the workflow regresses, disable the native tool on that agent. Other existing agents and integrations remain available.

## Consequences and explicit limits

This adds dependency and bundle/build cost that must be measured. Mastra does not replace the model account or make the product use a Codex subscription as a backend endpoint. Literal quote checks support provenance but do not prove that a commitment was interpreted correctly; evaluation and human review still matter.

This decision does not implement always-on meeting detection, webhooks, personal Scribe ACLs, a cloud browser, notification delivery, full conversational agent creation or a centralized activity console. Those remain in the [feedback backlog](../feedback-backlog.md).

## References

- [Mastra workflows](https://mastra.ai/docs/workflows/overview): typed `createStep`/`createWorkflow`, execution and suspend/resume concepts.
- [Agents and tools inside workflows](https://mastra.ai/docs/workflows/agents-and-tools): reuse existing code/tools within step execution.
- [Existing AIX runtime](../../lib/server/runtime.ts), [queue](../../lib/server/queue.ts), [MCP adapter](../../lib/server/mcp.ts), and [agent contract](../../lib/agent-config.ts).
- [Product direction](../product-direction.md) and [source audit](../audit-2026-10-29.md).
