# Builder journey verification — 2 November 2026

## Reference: Dust

In the signed-in Dust workspace, created an unpublished, temporary meeting-action agent using Sidekick. Sidekick proposed a plan, asked for confirmation, and presented reviewable instruction suggestions. Accepted the suggestion, used the pre-save Preview with synthetic meeting notes (Maya to send a proposal by Friday; Leo to review pricing with no deadline), and observed a table with both actions, owners, evidence and uncertainty. Saved the agent, observed the start-chat destination, and archived the temporary agent. No external messages were sent and no connected account tools were executed.

## AIX

In the local AIX Workflow QA organization, opened the split builder, discovered the real Composio Gmail catalog, selected only `GMAIL_FETCH_EMAILS`, entered a temporary meeting-action agent's identity and instructions, saved it, and confirmed that its own new-chat page opened. Reopened its settings and verified Gmail's tool access was restricted to the single selected tool. Archived the temporary AIX agent after the check. The Gmail account was shown as not connected; no Gmail data was read and no OAuth connection or external action was performed.

The current workspace reported no connected AI model. Consequently, this did not verify model-generated suggestions, a live model response, or the proposed review flow with a real provider. The current builder has no pre-save execution preview or durable builder-chat history. MCP selection reuses the existing server picker; the test workspace had no MCP servers configured, so no MCP discovery or execution was tested in this walkthrough.

## Boundaries

A selected app does not authorize an account. The picker stores only explicitly selected tools; a regression test verifies that removing the last tool removes the app rather than accidentally permitting all its tools. The app catalog was fetched from Composio using the platform configuration. This validates catalog discovery and configuration persistence, not actual use of a connected account.

## Follow-up: bounded instruction preview

An instruction-only Preview tab and authenticated, rate-limited endpoint have since been added to the builder. It sends the draft instructions and pasted sample to the selected organization model, without tools, connected apps, files or retrieval. The output is transient and is not a saved conversation. Automated tests use an AI SDK model double to verify request validation and that no tools are passed. This does not test model quality, the transcript extraction tool, retrieval, app permissions or a live provider. Those checks remain open until a real model and authorized accounts are available.
