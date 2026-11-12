# Live email and calendar follow-up verification — 2 November 2026

Local AIX Workflow QA workspace. Gmail and Google Calendar were member-authorized in the app. Created **Email and Calendar Follow-up Assistant** using OpenAI and enabled only `GMAIL_FETCH_EMAILS` and `GOOGLECALENDAR_EVENTS_LIST`, then set its external-actions policy to read-only. No send, draft, mutation or deletion tools were enabled.

## Observations

1. The first proposed read used an incorrect calendar timezone offset. It was denied before execution. The agent reported the denial rather than pretending it had data. This exposes the need for a trusted timezone setting and explicit time-window display.
2. A second run used explicit India-time bounds and requested no more than ten messages and ten events. After review, both read-only calls were approved. The stored connector result reported two successes and zero errors. The agent's first answer overclassified automated alerts and an ordinary meeting as confirmed personal follow-ups. It also repeated verification-code subjects unnecessarily. These are product failures; that private conversation should not be treated as a reliable task list, and prompt-only mitigation is not a confidentiality guarantee.
3. Refined the agent instructions to require explicit assignment evidence, keep alerts and calendar events as suggestions, and avoid repeating authentication secrets. A third run narrowed email to a known operational-alert sender and subject, with a cap of three messages and five calendar events and explicit offsets. It returned source links and did not classify those alerts or ordinary events as confirmed assignments. This is one narrow regression example, not broad proof of quality or secret filtering.
4. The work-detail view displayed a completed approved connector call as running. The underlying stored messages showed the result, but the approval-resumed trace had not been reconciled. A scoped fix correlates tool outcomes by call ID and reconciles unambiguous legacy traces without copying private tool output into display evidence. Automated tests cover multiple calls, legacy ambiguity, denied calls and failures/partial failures. After rebuilding, the successful run displayed completed and the rejected run displayed denied.

## Limitations and access

The test runs remain private conversations for the authorized member. They may contain sensitive source details; this document deliberately records no message contents, codes, source IDs, event names, or recipient addresses. No external messages were sent and no email or calendar data was modified. The follow-up agent itself is organization-shared under the current product model; its account access is member-scoped. Data minimization before model submission, source-sensitive output/trace controls, explicit owner attribution, time-zone defaults, broader evals and tenant isolation still require work.

## Scoped live Gmail check — 3 November 2026

After deploying the first Gmail protection, the connected member ran a read-only integration check for at most three operational-alert messages from a single known sender and subject. The call completed and returned the minimized Gmail format with a privacy notice and an omission count of zero. Unsupported Gmail tools appeared disabled in the test dialog. No model, write action, or broad inbox query was involved.

The same bounded search was then run through the follow-up agent and approved as a read-only call. It classified the three results as operational alerts rather than confirmed personal assignments, provided source links, and identified that the results were limited. The answer remained available after reopening the private conversation. No Calendar calls or external writes were made.

This establishes compatibility with one ordinary-mail response and one narrow agent scenario, not comprehensive classification or real-world secret detection. The matched sample contained no known authentication message. Synthetic tests exercise sensitive-message withholding and history replay; historical saved content is not rewritten. The completed response incorrectly retained the temporary approval prompt; a fix prevents that placeholder from being included in newly resumed answers, while existing saved messages are unchanged.

## Combined read-only regression — 3 November 2026

Saved the device's India timezone for the initiating member, then asked the follow-up agent for at most three matching operational-alert emails and three calendar events for tomorrow. Before approval, the raw tool parameters showed the correct local midnight-to-midnight range with +05:30 offsets and the saved IANA timezone. Both read-only calls succeeded; the agent kept automated alerts and calendar events separate from confirmed assignments, cited sources, and disclosed that the mail results were limited. No external data was modified.

The approval UI exposed the boundary in raw JSON rather than a human-readable summary; the final answer claimed the window was shown before the call, although no separate prose summary had appeared before approval. Calendar returned an event that began on the prior date and overlapped the requested window; the response did not explicitly explain overlap semantics. A timezone instruction to the model is not deterministic calendar-boundary enforcement. These remain open issues.

A six-case, text-only synthetic classification evaluation based on this agent's saved instructions completed with all six simple string assertions passing; outputs can be inspected in Learning & evals. The cases cover explicit requests, commitments, automated alerts, an unassigned request, a meeting without an action, and a missing deadline. This is not a tool-use or semantic-grading eval and does not establish broad reliability.

## Boundary and evaluation follow-up — 3 November 2026

The Calendar integration screen rejected a nonexistent New York daylight-saving local time before calling the connector; a bounded read-only India-time query then completed successfully with status-only results. Automated tests additionally cover DST transitions, repeated times, malformed dates and rejection of a mixed app batch before execution. The guard is limited to Google Calendar event listing and checks consistency, not whether the model chose the user's intended interval.

The six-case synthetic suite was revised to require the expected classification on the whole first line, rather than merely somewhere in the response. The connected model passed all six revised checks. These checks still do not grade whether explanations, ownership, deadlines or evidence are semantically correct; the saved outputs require review.
