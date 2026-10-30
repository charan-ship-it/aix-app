# Selective framework integration — verification, 30 October 2026

## Scope delivered

Pinned `@mastra/core` 1.80.0 and embedded a typed workflow behind the opt-in `extract_transcript_actions` capability. Steps validate supplied transcript input, extract commitments using the existing run's AI SDK model, verify literal evidence and render a reviewable table. AIX still owns identity, source permissions, conversations, durable runs, approvals, PostgreSQL/Drizzle persistence and BullMQ dispatch. No new Mastra server, storage authority or database migration was introduced.

The saved **Transcript → Action Items** agent (`47377fa1-f5f2-4ecc-a894-120f499b4826`) was updated through the app editor to enable the capability and use its evidence-checked output. Its existing three Scribe permissions remain unchanged. Other saved agents were not opted in.

## Verification

- TypeScript passed: `outputs/selective-framework-typecheck.log`.
- All 63 automated tests passed: `outputs/selective-framework-tests.log`. New tests include actual Mastra workflow execution, a native `runAgent` transport fixture that persists the final chat and tool trace, token accounting, cancellation, unsupported quotes, conflicting deadlines, distinct commitments sharing one quote, original line references, and inert Markdown rendering.
- All 15 local HTTP integration groups passed: `outputs/selective-framework-api.log`.
- Production app and worker images built: `outputs/selective-framework-build.log`. Rebuilt services started, app/PostgreSQL/Redis were healthy, and all four existing worker queues reported ready.
- Browser verification enabled and saved the tool, reloaded the saved agent, and confirmed **Transcript action items** appears alongside its existing Scribe tools. Screenshot: `outputs/selective-framework-agent.jpg`.

## Review fixes

Independent review found quote-based deduplication could discard separate commitments in one utterance; deduplication now preserves distinct actions and contradictory deadline variants. A Markdown injection could render remote images; dynamic code fences now keep derived values inert, with actual ReactMarkdown/remark-gfm assertions against images, anchors and scripts. An abort/rejection race could emit an unhandled rejection; execution now attaches race handlers before starting the extractor, with a regression check. Leading blank lines remain intact for citation offsets.

## Limits

The model transport test uses controlled localhost responses, not a paid live provider. The organization still has no saved model account; no native live-model quality claim is made. Literal quote and name/deadline presence checks do not establish semantic correctness. Source references are explicitly unverified labels; this tool does not fetch recordings or establish recording ownership. Source retrieval remains governed by the existing MCP path and its documented shared-source limitations. This slice does not add transcript-ready triggers, personal Scribe ACLs, a cloud browser, notifications, conversational agent creation, or a new global history/activity view. Those remain in the feedback backlog.
