# First-task experience — verification, 30 October 2026

## Delivered slice

The existing AIX application remains in `/Users/charannaik/project/perfstaq`. This work does not migrate or replace the application, and AIX remains a separate customer-facing product repository.

Home now starts with three concrete outcomes: find follow-ups, turn pasted notes/transcripts into action items, or work through another task. Selecting a task reveals its guide; the explicit Open task draft link then opens an editable conversation with an agent and prompt. Opening it does not submit a message, authorize a connection, execute a tool or silently create an agent.

The guide can be skipped and resumed. The chosen goal and dismissal preference are stored per member and organization. Home links to recent authorized personal conversations and the full history. The guide makes private scope explicit, but does not implement team sharing or a team membership model.

`GET /api/getting-started` returns safe configuration/readiness metadata. Model readiness means a provider is configured; it does not certify current provider connectivity or successful inference. Composio readiness reads private ACTIVE account metadata using the exact organization/member composite identity with bounded requests. It does not start OAuth, create tool-router sessions or expose product keys. Missing platform configuration and failed metadata checks have distinct states. `PATCH` accepts only supported partial preference fields and returns the saved preference without repeating remote readiness checks.

Completed progress requires an owned completed run with a durable, non-demo, non-error assistant result. Conversations in missing or no-longer-accessible Pods do not count. Completion is not inferred from another member's run, an organization owner's role, opening a draft, clicking through guidance or a synthetic example.

## Evidence available

- All **71 automated tests passed**: `outputs/first-task-tests.log`. Three new database/metadata tests cover private member/tenant preferences, skip/resume and strict partial updates; completed-result evidence and current Pod access; and exact private ACTIVE connector queries with unavailable/error distinctions. The connector metadata test uses an injected reader and does not send synthetic credentials over the network.
- TypeScript passed: `outputs/first-task-typecheck.log`.
- Actual local HTTP readiness/preference checks passed: `outputs/first-task-api.log`. These cover authenticated no-store responses, role guidance, persistent skip/resume, member/tenant isolation, strict patches, cross-origin denial and revoked membership.
- All 16 existing HTTP integration groups passed: `outputs/first-task-regression-api.log`.
- Final production Docker app/worker build passed: `outputs/first-task-build.log`. The app was restarted; app, PostgreSQL and Redis health checks are healthy and the worker is running. Startup evidence: `outputs/first-task-start.log`.
- Browser checks verified choosing a goal, skipping/reloading/resuming the saved guide, opening the transcript agent with an unsent populated draft, editing/reloading that draft, preserving an intentionally empty draft, and returning Home. Draft keys now include organization and member identity; the member-isolation code was independently reviewed, while browser account switching was not exercised in this slice.
- Browser QA caught `/conversation/new` still rendering Home after the new separation. The route was corrected, production rebuilt, and the actual transcript-draft route then verified in the browser. This was a real navigation defect missed by service-only tests.
- The pilot member's live Composio metadata reported email and calendar connected. The follow-up guide selected the existing Meeting & Inbox Brief agent, showed the explicit tools-review step and missing-model blocker, and opened the correct unsent follow-up draft. This verifies metadata and navigation, not an email read or generated follow-up result. Screenshot: `outputs/first-task-followups.jpg`.
- Header position remained at y=9 on desktop and y=54 beneath mobile navigation while scrolling. At 390×844, document scroll width was 390 with no horizontal overflow. The temporary viewport override was reset. Screenshots: `outputs/first-task-home.jpg`, `outputs/first-task-mobile.jpg`.

## Limits and follow-through

No live model extraction or email/calendar follow-up inference was tested for this slice. The local pilot has no configured model provider. Product-managed funded inference, usage controls and a complete end-to-end first result remain open.

Follow-up agent selection requires explicit email and calendar read tools, but the current guide does not automatically prove that the selected agent's configured email app matches the particular account connected by this member. The guide directs the member to review agent tools; automatic account/agent matching and a tested complete email/calendar job remain unfinished.

Notes can be pasted without a notetaker. Existing organization-shared Scribe permissions are not made personal by this guide. Team/shared-mailbox scope, conversational agent creation, centralized orchestration activity, ongoing triggers and the full software factory are separate backlog items.
