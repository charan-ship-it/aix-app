# Connections and agent workflows

AIX owns the Composio project key and toolkit auth configurations in server-only environment variables (`COMPOSIO_API_KEY`, `COMPOSIO_AUTH_CONFIGS`). Customers cannot set or remove that key through Settings. The organization owns its MCP server configuration. Composio app authorizations belong to a member within that organization; an agent cannot borrow another member's account. MCP bearer tokens are deliberately organization-shared, so use a dedicated service account with appropriate access.

## User journey

1. The product operator configures Composio once on the web and worker services. `COMPOSIO_AUTH_CONFIGS` is a JSON map of toolkit slugs to `ac_` auth config IDs; it is applied consistently to connection, agent, and test sessions. A model key is only needed for agent runs, not direct integration checks.
2. In Connections, authorize the desired app. Browse & test tools fetches current read-only tools and their input schemas from Composio. Enter the tool's inputs and explicitly run the check. Actual tool output and failures are saved in private member history; a missing key or account never produces a simulated success.
3. Build an agent from an app card, or select apps in the agent editor. Each app can allow all its tools or a specific allowlist. The server sends that allowlist to the Composio session. Read-only policy filters tools by Composio's `readOnlyHint`; other execution requires run approval.
4. For MCP, an admin adds a public HTTPS Streamable HTTP endpoint and optional bearer token. A successful protocol handshake and tool discovery are required before saving. Members reuse the connection by selecting individual tools in the editor. Every MCP invocation needs approval; MCP tools are unavailable under the agent's read-only policy. Server redirects and private network addresses are rejected; DNS is pinned for each connection.
5. The Workflow tab stores ordered instructions with the agent. The harness includes them in the model instructions on every run, including scheduled runs. These are model-followed instructions, not a deterministic workflow engine or independently deployed steps. Save & test opens a real agent conversation with the same tools and knowledge scopes.

## Verification

- `npm test`: runtime recovery, approval/access boundaries, scheduling idempotency, concurrent-run constraints, and MCP endpoint network restrictions.
- `node --import tsx tests/workspace-flows.integration.ts`: isolated local Docker accounts, org isolation, private files and folders, task-to-run flow, private test history, missing-key recovery, and MCP authorization checks. Cleans up its own fixtures.
- `TEST_PUBLIC_MCP=true node --import tsx tests/workspace-flows.integration.ts`: additionally performs a real DeepWiki handshake/tool discovery through the local application's API and verifies same-org reuse and cross-org denial. Uses only a public endpoint; no personal account data is transmitted.

Live Composio success checks require a valid project key and OAuth authorization for each service. They have not been certified merely by passing local infrastructure tests. A real model account is also required to test the model's tool selection and workflow adherence.

Current scope: twelve app entry points (Gmail, Google Drive, Google Calendar, Slack, Notion, GitHub, Salesforce, HubSpot, Outlook, Linear, Jira, Zoho), with tool search across each app. MCP currently supports public IPv4 HTTPS endpoints on port 443 with optional bearer authentication; OAuth-only MCP flows and private-network MCP servers are not implemented.

## Scoped specialist delegation

The Team coordinator template starts with Research analyst and Content studio as candidate specialists. In Tools & apps, choose the specific agents a coordinator may use. A `delegate_task` call requires user approval before any child run is created. Each child has its own durable run and conversation, keeps the initiating member and project, and links back to the coordinator. The parent receives the child's actual status, draft, source names, and conversation link.

This first implementation is bounded research/drafting delegation, not long-running autonomous teams or external agent messaging. Specialists have external app/MCP tools removed, cannot delegate further, and receive the intersection of their knowledge scope with the parent scope. There are at most two specialist handoffs per parent run, three model steps per specialist, and a 90-second specialist model timeout. Identical tool-call IDs reuse the same child run; changing the task under a reused ID is rejected. Parent cancellation is propagated and execution checks require the parent to remain active. A failed coordinator is not automatically replayed.

Agent execution uses AI SDK 6 `ToolLoopAgent`; BullMQ/Redis dispatch and recovery, PostgreSQL persistence, and application authorization provide the surrounding execution harness. Local provider-transport tests cover approval-before-start, child results returning to the parent, knowledge/tool restrictions, identity, parent links, deduplication, recursion rejection, and handoff count limits. They do not establish live model quality or email/voice delivery.

## Learning and evaluation workflow

Open **Learning & evals** (`/quality`) from the sidebar. Organization administrators create a suite for a published reusable skill, enter up to six cases, and define required phrases, forbidden phrases, or a maximum output length. Each case needs at least one check. Evaluations compare the current skill and an optional saved improvement candidate using the same provider, model and cases. They run on a dedicated BullMQ worker queue and retain individual outputs and assertion results.

Members can save private feedback from a finished response. In Improvements, they can explicitly share revised skill instructions, expected output and a rationale for administrator review. Raw conversations and private feedback notes are not automatically included in shared proposals. Candidates preserve the skill's app requirements. Administrators can reject a proposal or publish a new immutable version after its candidate passes every check without regressions against the baseline. Changing the skill or test suite invalidates old publication evidence. Once a skill has evaluation coverage, instruction updates must use this review flow.

These are literal assertion tests, not semantic quality scores or foundation-model training. Evaluation calls have no tools and do not execute an agent's app integrations. Missing model credentials block evaluation before any job is queued; they never generate a passing result. Provider transport fixtures exercise the execution path locally; actual model behavior still requires a connected OpenAI or Anthropic account.
