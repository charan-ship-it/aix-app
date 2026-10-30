# AIX product direction · 27 October 2026

AIX belongs in the **configurable agent platform** layer. Its product promise should work for an individual, a group, or an organization: define repeatable work, give it scoped context and tools, and receive a usable result with clear decisions and recovery. Organization tenancy is infrastructure; a customer should not need to describe themselves as a business to begin.

## Customer-facing boundary — clarified 30 October 2026

This is a SaaS product built by AIXccelerate for external customers, not an AIX internal operations tool. Each customer brings their own workspace, people, goals, accounts, knowledge and permissions. The founder's Gmail, Calendar and Scribe sources are development/pilot accounts, not universal prerequisites or the definition of the audience. Email/calendar is a recommended first-job path; transcripts, coding tools, CRM and other sources remain optional alternatives. Personal work and explicitly shared team work must remain distinct.

The next experience priority is a simplified customer home and skippable, resumable first-task onboarding: choose an outcome → connect only required sources → review access → run with visible state → review evidence → reopen history → optionally enable ongoing work. A notetaker is not required. Missing model readiness must be explicit; funded inference and usage controls are product-operator responsibilities for a broadly accessible service.

Current competitor documentation was refreshed on 30 October: [Dust Pods](https://docs.dust.tt/docs/user-documentation/pods/overview) describes shared conversations/tasks/files, while [Relevance workforces](https://relevanceai.com/docs/sdk/workforces) documents task lifecycles, delegation/handover events and human intervention. These are verified documentation claims, not a new hands-on certification. The earlier signed-in Dust observations remain in `reference-flows.json`. AIX's current member-private Pod chats differ from Dust's shared Pod conversations; team sharing needs an explicit product/access decision rather than silently copying that behavior.

## Market layers

| Layer | Buying motion | Relevant references |
|---|---|---|
| Configurable platform | Build and manage reusable agents and workflows | Dust, Relevance AI, Gumloop |
| Role product / general task executor | Delegate work to a ready-made assistant or executor | Lindy and Manus, as experience benchmarks rather than identical platform comparisons |
| Adjacent specialist | Buy one particular capability | Meeting capture, browser operation, retrieval, and eval tools inform integrations rather than the whole platform |
| Host suite | Use agents within an existing system | Office, CRM, and IT suites; channel/distribution context |
| Runtime / SDK | Build orchestration in code | AI SDK and other execution frameworks; implementation dependencies rather than customer alternatives |

## What the primary competitors wire together

Vendor documentation is evidence of advertised capability, not an independent quality evaluation. This research does not establish that a competitor lacks an undocumented feature.

| Stage | Evidence in the market | AIX implication |
|---|---|---|
| Work entry | Dust combines conversation and project context; Relevance offers configurable workforces and plain-language building | Preserve a simple outcome entry point; keep the builder optional for ordinary users |
| Identity | Team-oriented platforms govern shared agents and access | Keep tenant/member boundaries while offering a personal workspace |
| Guardrails | Gumloop supports action-level approval settings and conditional app rules | Blanket approvals are a starting point; autonomy needs server-enforced action classes and explicit limits |
| Knowledge | Dust Pods combine project files and instructions with connected knowledge | Keep project context separate from globally shared knowledge; add source freshness and sync health |
| Tools | Competitors connect existing apps and custom tools | Tool count alone is weak differentiation; connection setup, schemas, permissions, and failures must be understandable |
| Business truth | Useful work ends in the connected app or a reviewable result | Chats should link to durable deliverables and the actual external record changed |
| Human handoff | Gumloop already provides notifications and pending approvals | A work inbox closes an AIX gap; it is not a unique market invention |
| Evals | Relevance advertises agent building with evals; Manus describes tests before enabling automation | Saved acceptance examples, versioned changes, and visible validation are a priority before expanding autonomy |

Sources: [Dust Pods](https://docs.dust.tt/docs/user-documentation/pods/overview), [Relevance Workforce](https://relevanceai.com/workforce), [Gumloop human review](https://www.gumloop.com/blog/human-in-the-loop). Adjacent experience references: [Lindy product](https://www.lindy.ai/product), [Manus automations](https://www.manus.im/features/automations).

## Problem hypothesis worth testing

People can already ask an AI a question. The harder transition is turning their own recurring task into a dependable routine without becoming a workflow engineer or repeatedly explaining the same expectations.

The proposed product loop is: **describe an outcome → connect only what it needs → rehearse with an example → review evidence → repeat within agreed limits → teach corrections deliberately**.

This is a product hypothesis, not proven market whitespace. Several incumbents already address parts of it. AIX must win on the whole journey's reliability, clarity, and time to useful output, not claim that memory, MCP, schedules, or an approval queue are novel.

## Universal jobs and audiences

| Reusable job | Individual use | Team use |
|---|---|---|
| Research and compare | Compare options with cited evidence | Compare vendors or competitors |
| Prepare | Study brief or personal meeting preparation | Customer/account meeting preparation |
| Follow through | Turn commitments into a reviewed action list | Follow up on unresolved project work |
| Produce recurring updates | Weekly personal/project digest | Client, sales, or operational report |
| Organize knowledge | Turn notes into usable reference material | Maintain a shared project knowledge base |

Audience entry points can differ while using the same execution, permission, and review primitives. Avoid promising every task or every profession before validating concrete jobs.

## Delivery order

1. **First-use clarity and return path.** Personal/team onboarding, useful examples, connection readiness, and a unified inbox for approvals, blockers, and results. Implemented in this iteration: personal/team setup and Work inbox, including private ownership, current Pod access, durable reviewed state, and stale-approval rejection.
2. **A job that can prove it works.** Save acceptance examples and expected output checks separately from retrieval sources. Version agent instructions, tool permissions, and knowledge selection; show when checks refer to an older version. Do not describe Save & test as a complete evaluation suite.
3. **Bounded autonomy.** Let people choose draft-only, approve external changes, and approved routine actions. Enforce budgets, destination/action allowlists, idempotency, and escalation in the server, not only in model prompts. Expand permissions after actual successful runs and explicit user consent.
4. **Real continuity.** Event triggers with deduplication, fresh connection-backed context, output artifacts, and explicit handoffs. Explain what changed and why a run stopped; do not blindly replay external actions.
5. **Learning users control.** A correction may become an editable, scoped preference or a saved check with consent. Keep personal memory, project context, and shared organizational knowledge distinct. Test before applying changes to recurring work.
6. **Distribution and portability.** Reusable job recipes with declared inputs, tools, permission scope, and acceptance examples. Importing a recipe must never silently import credentials or grant access. Validate usefulness before building a public marketplace.

Managed model access, usage metering/limits, self-service billing, and production operations remain prerequisites for a broadly usable paid service. Normal users should not have to obtain developer keys to experience the first successful task. The current local installation does not yet provide funded inference to new users.

## Validation before expanding scope

Test the same three jobs with individuals, freelancers, and team members. Observe setup without coaching. Measure first useful result, first-run failure reasons, acceptance without edits, repeat use in week two, approval burden, and cost per accepted result. Interview people who abandon setup or stop after one use. Treat these as future measurements; no retention or demand data has been collected yet.

The strongest success measure is a recurring job someone chooses to keep using and paying for. Agent count, connector count, generated messages, and a polished catalog do not establish that.
