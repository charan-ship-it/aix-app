# Unified work detail — verification, 30 October 2026

## Delivered behavior

AIX has a dedicated `/work/[runId]` page connecting one durable run to its original request, current status, pending tool approvals, tool evidence, saved assistant result, review state and permitted specialist work. Work inbox titles/actions and conversation run links lead here. Existing conversation, run, approval, cancellation and review records remain the source of truth; no parallel task table or independently mutable execution status was added.

The page refreshes visible active work, explains queued/working/paused/finished/failed/stopped states, and exposes explicit approval/denial, stop and mark-reviewed actions. Continuing opens the existing conversation and does not automatically submit another request. Retired agents and archived projects preserve readable work details without offering an invalid continuation. Work inbox routes approval review through this detail page rather than its former raw approval modal.

## Scope and access controls

`GET /api/work/[id]` returns a bounded read model for the current organization/member. It rechecks current membership and conversation/Pod access, associates output with the exact run ID, and uses a stored request snapshot or a reliable adjacent conversation request. It does not return the entire chat, runtime model messages, agent instructions or Composio session IDs. Missing/deleted agent configuration does not erase historical work.

Parent/specialist links are limited to owned work in currently accessible conversations. Tool evidence redacts credential-like fields and known token formats, including structured serialized JSON. Omitted/truncated evidence is identified. An incomplete approval preview disables both approval and denial controls; decisions include the exact displayed approval IDs for the existing stale-action check. Mark reviewed uses the current run timestamp. Review means seen, not accepted output quality or approved external actions.

Cancellation now rechecks current conversation/Pod access before setting cancellation state. The check deliberately does not require a still-existing or unarchived agent, so owners can stop their own retired-agent work. It does not grant access to another member's work.

## Verification evidence

- **76 automated tests passed**, including five new work-detail data-access tests: `outputs/work-detail-tests.log`.
- TypeScript passed: `outputs/work-detail-typecheck.log`; independent review also passed `outputs/work-detail-review-typecheck.log`.
- Production Docker app/worker build passed: `outputs/work-detail-build.log`. Final container health and startup were checked by the coordinating agent.
- **Five actual HTTP acceptance groups passed** against the rebuilt local app: `outputs/work-detail-api.log`, from `tests/work-detail.integration.ts`. Disposable synthetic accounts/organizations were created and removed. No model, connector tool or queued agent job was executed:
  - Private member/tenant access, no-store responses, deleted-agent snapshots, exact request/result selection in a multi-run chat, and exclusion of other-run/model/session/credential data.
  - Specialist links exclude other members' work and missing/inaccessible project conversations; inaccessible parent references are hidden.
  - Current review timestamps and stale approval IDs are enforced, with no tool execution.
  - Revoked/missing Pod access denies detail and cancellation; owned deleted-agent work can be stopped; deleted/archived agents cannot be continued.
  - Revoked organization membership denies previously readable work.
- Independent source review caught credential-key normalization mismatches for `Proxy-Authorization`/`Set-Cookie`, incomplete-preview approval controls and a nested main landmark. These were corrected and reviewed before acceptance.
- All **16 existing HTTP regression groups passed**: `outputs/work-detail-regression-api.log`. An initial overlapping signup attempt hit the normal authentication rate limit (429); rerunning after the window passed succeeded without weakening the limit.
- Actual browser acceptance passed: Work inbox → completed detail → specialist detail → parent detail → original conversation → View work details. Mark reviewed persisted after reload. The pending-action preview showed recorded inputs, and Stop run moved an explicitly synthetic pending fixture to Stopped and removed approval controls without executing a tool. A temporarily missing source Pod caused Refresh to clear the previous request/result and show unavailable; the labeled fixture was then restored.
- Desktop header position remained at y=9 while the content scrolled. At 390×844, document width and scroll width both measured 390; the header remained beneath the mobile navigation at y=54. Result tables scroll within their own region. The temporary viewport override was reset.
- Screenshots: `outputs/work-detail-desktop.jpg`, `outputs/work-detail-mobile.jpg`, `outputs/work-detail-approval.jpg`. Examples are deliberately labeled synthetic/demo in a separate AIX Workflow QA workspace. They are not live model results or proof of actual parallel execution. Fixture IDs are recorded locally in `outputs/work-detail-qa-fixtures.json`.

## Remaining limits

This slice joins an existing durable run to its request and output. It does not introduce a general customer task contract spanning manual tasks, meetings, coding jobs and run-less blocked requests. Missing-model submissions still need product-managed inference and a durable recovery path; the current pilot has no configured model, so no live output quality is certified here.

Tool trace evidence is durable recorded data, not a continuous view into private model reasoning. In-flight text remains in the existing conversation stream; this page displays saved outputs/evidence. Synthetic browser fixtures must stay explicitly labeled and cannot count as live completed customer work. Active work polls while visible; terminal work rechecks on focus or explicit refresh rather than claiming instant revocation of already rendered content.

Whole-chat read-only reopening for deleted agents remains a separate history issue. Automatic responsibility triggers, funded inference/usage limits, customer team-sharing, broader outcome evaluations, browser execution and a full software factory remain open backlog items. No migration to OpenDuet or replacement of AIX infrastructure occurred.
