# AIX product feedback extracted from the meeting transcript

Captured 2 November 2026. The meeting date is not established by the attachment. Source: the user-supplied transcript, chiefly 1:12–9:07. This note records requirements and interpretations; statements during the demo that something already exists are not implementation verification.

## Product requirements

| Reference | Feedback | Product implication |
| --- | --- | --- |
| 3:06–3:20 | Move learning, evals, skills and agent management out of the everyday conversation experience. | Keep daily navigation focused on doing work. Put advanced management under configuration/settings; preserve a visible route to use each agent. The distinction between agent use and management is our interpretation of the feedback. |
| 3:44–4:42; 5:08–5:20 | Each agent needs its own space containing role, instructions, objectives, guardrails, knowledge, skills and tools, with multiple new conversation threads inside it. | An agent home must be a stable destination. New conversations share permitted agent configuration but do not share private thread history by default. Explain how an agent home differs from a team/project Pod or knowledge collection. |
| 4:46–4:59 | Agents should also be proactive and have an isolated computer/sandbox. | Add explicit ongoing responsibilities and a bounded execution environment. Scheduling is only one part; show owner, source scope, triggers, limits, pause/stop and outcomes. Always available must not mean an unbounded busy loop. Developer browser access is not a product sandbox. |
| 5:27–6:20 | Group multiple agents into teams; restrict a financial agent to particular people while allowing wider access to other agents. | Agent groups and member/team sharing need explicit models. “Public” here means shared within an organization, not published on the internet. Administrative role, agent access, conversation access and connected-account authority are different permissions. |
| 6:26–7:59 | Select a harness as well as a model; feed tools, skills, loop/goal configuration and other agent settings into the chosen harness. | Introduce a capability-aware runtime adapter contract. Only show implemented, tested harness/model combinations. AIX identity, authorization, durable task/run records and audit remain authoritative. Using a workflow library internally is not the same as offering it as a selectable harness. |
| 8:04–8:48 | Explore bringing an existing subscription to control personal-assistant costs. | Verify each provider's supported authentication, permitted subscription use, hosting constraints and billing before offering it. Do not assume a consumer subscription provides an arbitrary hosted model endpoint. Keep API-key and product-funded options explicit, with limits and metering. |

The transcript contains unclear framework names around 6:52–7:26. Preserve the request for harness choice, but verify the intended products and supported integration paths before converting those names into implementation commitments. No harness vendor was conclusively selected in this discussion.

## What this means for the current app

- Existing agent configuration, per-agent conversations, project context, schedules, bounded specialist delegation and work-detail records are foundations to preserve; they do not close the complete requested experience.
- The current general execution loop uses AI SDK. Mastra is an embedded transcript-analysis capability, not a selectable platform harness.
- CopilotKit/AG-UI is an interaction layer. It was in progress when this feedback was captured; the bounded work-detail observer has since passed local SDK/API and browser acceptance ([evidence](ag-ui-qa-2026-11-02.md)). This is not a full conversation migration and does not implement harness selection, ambient work or sandboxes.
- Agent visibility is currently largely organization-wide. Existing private/organization project controls do not establish named-team membership or per-agent financial-data access. Those claims need implementation and tests.
- An AIX-to-external-assistant bridge that can use a supported account is separate from manually using Codex to operate the app. The demonstration statement at 2:01–2:25 is not evidence that subscription-backed native execution is implemented.

## Delivery order informed by this feedback

1. Finish and verify the authorized AG-UI/CopilotKit integration without changing execution ownership.
2. Refine agent homes, multiple threads and configuration navigation; define the vocabulary for agents, projects and knowledge.
3. Specify and implement harness adapters incrementally, beginning with the current runtime as the baseline and one separately verified adapter. Gate settings by capabilities rather than presenting unsupported choices.
4. Add explicit member/team agent access before broadening shared knowledge or account usage.
5. Prove one ongoing responsibility with budgets, recovery and a clear pause control; then add sandboxed computer execution where the job needs it.

This feedback extends the product direction; it does not authorize replacing the app or promising every model, harness or subscription. Related acceptance criteria are tracked in `docs/feedback-backlog.md`.

## Adjacent work kept separate

The marketing launch discussion from 9:12 onward and EAP customer follow-up around 21:16–22:34 concern other workstreams. The interactive onboarding/demo SDK ideas at 12:09–14:40 were described as separate product ideas, so they are not automatically added to AIX scope. Nothing in this transcript authorizes this agent to send emails or messages.
