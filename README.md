# AI Xccelerate Workspace

The project lives in `/Users/charannaik/Documents/ChatGPT/AIX APP`. Its dedicated repository is [charan-ship-it/aix-app](https://github.com/charan-ship-it/aix-app), on `main`. The previous folder name and Git history were retired on 30 October 2026; older audit records retain their original inspection paths.

A single Next.js application with a separate worker process, PostgreSQL + pgvector, and Redis + BullMQ. Dust-style conversations and agent configuration use the AIX/Mike design system. This is a conventional Node deployment; the older hosted Sites preview is separate.

## Run locally with Docker

Requires Docker Desktop and Node 24 for the initial environment generator.

```sh
node scripts/setup-env.mjs
docker compose up -d --build
```

Open http://localhost:4173, create your account and organization, then open **Settings**:

1. Add an Anthropic and/or OpenAI API key. Keys are verified upstream, encrypted per organization, and never returned to the browser.
2. The AIX operator sets `COMPOSIO_API_KEY` and `COMPOSIO_AUTH_CONFIGS` (a JSON map of toolkit slugs to auth config IDs) on both web and worker services. Customers never enter this key. In **Connections**, each member authorizes their own app accounts; organization and member identities remain separate.
3. Create an agent, choose a provider and accessible model ID, write its instructions, enable tools, and select its knowledge scope. Built-in agents can also be configured.
4. Upload knowledge and wait for indexing. OpenAI enables 1536-dimensional embeddings using `text-embedding-3-small`; without it, PostgreSQL keyword retrieval remains available.
5. Use **Activity & schedules** to create hourly, daily, or Monday schedules. Results appear as conversations. External tool execution waits for explicit approval of its saved inputs.

Supported uploads: UTF-8 text, Markdown, CSV, up to 200 KB in the UI. PDF parsing and automatic ingestion of connected Drive/Notion libraries are not implemented. Connections let agents use those services through Composio tools.

## Services and persistence

| Service | Purpose |
| --- | --- |
| app | Next.js UI, authenticated APIs, streamed run events |
| worker | Agent execution, knowledge indexing, recurring schedules, stale-run recovery |
| migrate | One-shot versioned Drizzle migrations before app/worker startup |
| postgres | Accounts, organizations, memberships, agents, chats, credentials, runs, schedules, audit records, knowledge chunks and vectors |
| redis | Durable queues/schedules, session cache, rate limits, locks, short-lived event streams |

Docker volumes preserve PostgreSQL data, Redis AOF, and original uploads across container restarts. `docker compose down` retains them; `down -v` deletes them. Keep the encryption key with database backups: replacing it makes stored credentials unreadable. Keep PostgreSQL, Redis, and upload backups together. Redis uses `noeviction` so queued work is not silently evicted.

Health: `/api/health/live` checks the app; `/api/health/ready` checks DB + Redis. Authenticated **Settings → Infrastructure** also shows worker heartbeat and indexing counts. A healthy web endpoint alone does not imply a healthy worker.

```sh
docker compose ps
docker compose logs --tail=100 app worker migrate
docker compose stop
docker compose start
```

## Development

```sh
npm ci
docker compose up -d postgres redis
npm run db:migrate
npm run dev -- --port 4173
# Another terminal:
npm run worker
```

Use the same `.env` for both processes. `npm run typecheck`, `npm test`, and `npm run build` validate the application. Redis is required for the rate-limit/locking unit tests. Versioned SQL lives in `postgres-migrations/`; run `npm run db:generate` when changing the schema, review the SQL, then migrate.

## Tenant and execution boundaries

Every application query is scoped to the signed-in user's active organization and rechecks membership server-side. This is application-enforced isolation, not PostgreSQL RLS. Agents and knowledge are organization-shared; chats, runs, schedules, and connected accounts belong to individual members. Owners/admins manage credentials and members. Creators or admins manage shared agents/documents. Invitations are shareable links matched to the invited email; outbound invitation emails and password-reset email delivery are not configured.

AI SDK runs have a step limit, output limit, and 150-second deadline. Composio sessions are restricted to the agent's selected toolkits, with read-only filtering available and approval required before tool execution. Scheduled actions follow the same approval flow. Runs already executing are never automatically replayed after a crash because an external side effect may have occurred. Recovery marks runs interrupted for over five minutes as failed for review; durable queued runs can be requeued. Failed indexing jobs retry three times and can be reindexed from Knowledge.

Provider usage is billed to the organization's own keys. Usage tokens are recorded, but spending budgets, billing, SSO, email verification/delivery, and production observability/alerting still need an operational rollout before opening public registration. Credentials should only be submitted over HTTPS outside localhost.

## Railway deployment layout

Prepared configuration; no Railway deployment has been performed. Use two services from this same repository, not a monorepo:

- **Web**: root `railway.json`, default `Dockerfile`, health path `/api/health/ready`.
- **Worker**: set service config path to `/railway.worker.json`. Uses `Dockerfile.worker`; pre-deploy command applies migrations. Deploy this service first so migrations complete before updating Web. Keep workers always on; do not enable sleeping or run the worker as a cron service.
- **PostgreSQL**: use a PostgreSQL service/image with the pgvector extension available. Migrations initialize the vector extension with a sufficiently privileged migration connection.
- **Redis**: persistent, `noeviction`, with private networking.
- **Object storage**: configure the same S3-compatible bucket credentials on both processes. This is required for shared source storage across separately deployed services; do not use ephemeral local directories.

Set `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the public HTTPS web origin), `CREDENTIAL_ENCRYPTION_KEY`, and S3 variables on both app and worker. Keep the master key stable. Use database/Redis private connection URLs, database backups, and explicit deployment order. The web image follows Railway's `PORT`; no frontend rebuild is needed for these server settings. Multi-region deployment and rolling migration coordination need a separate production rollout.

## Validation performed

Local browser/API tests exercised signup, org creation/switching, agent configuration, indexing, tenant-separated retrieval, missing-key handling, and schedule registration. Real PostgreSQL/Redis/worker tests exercised streaming tool loops, saved conversations, and embedding-to-pgvector retrieval with **local model/embedding test doubles**. Docker browser checks also passed team invitations, member permissions/revocation, and scheduled worker execution. Tool approval/denial is covered by SDK tests. Paid provider calls and live Composio OAuth/actions require your credentials and have not been verified with real accounts.

Dependency audit: framework/runtime high and critical advisories were patched. Four moderate findings remain in the Drizzle Kit development tooling dependency chain (its embedded esbuild development server); the application does not start that server.

## Workspace experience

The application shell keeps the header visible and gives the page or message list its own scroll area. The conversation input stays visible while reading long answers; Markdown, tables, links, and code render in the thread. Browser back/forward and reload preserve employee, conversation, page, and settings-section links. Missing employee/conversation links show an explicit unavailable state rather than sending to another employee.

Employee Studio separates instructions, model, tools/apps, and knowledge, with a fixed action footer. **Draft employee** turns a business job description into structured instructions and suggested permissions; review them before saving. Agents open their own detail page at `/agents/:id`; conversations have canonical `/conversation/:id` links, and existing employees have **Save & test**. Built-in employees inherit an available connected model; saved employee choices remain explicit. Missing-model errors keep the unsent task in the composer.

Agent execution uses AI SDK's typed tool loop inside the BullMQ worker. Each run stores the employee configuration snapshot, messages, tool trace, usage, and pending approvals. Stream reconnects resume after the last event. Concurrent conversations have separate run state. **Stop run** signals the worker and records cancellation; already completed external actions cannot be undone by stopping. Provider failures distinguish rejected access, unavailable models, and usage limits without reflecting provider secrets. OAuth finishes through a dedicated callback and refreshes Connections.

The signed-in Dust workflow was also tested using the clearly labeled **AIX Workflow Test** Pod: Pod creation → task creation → agent run → linked conversation → Pod history. Agents configure behavior; Pods hold project context. AIX keeps those as separate records and routes.

Pods live at `/pods/:id`, with conversations, files, tasks, and settings. Pod instructions and indexed files are included in each run’s configuration snapshot after access checks. Private Pods are owner-only; organization Pods share files/instructions with members. Conversations and tasks remain author-private. Task runs create a separate linked conversation record. Pod conversations stay out of employee-only and general history. File uploads and note creation support text, Markdown, and CSV; company sources can be copied into a Pod. Scoped folder trees are supported. Arbitrary binary file parsing, per-Pod invitations, reusable skills, and event/webhook triggers are not implemented yet.

Run `node --import tsx tests/workspace-flows.integration.ts` against an idle local Docker stack to verify tenant and Pod boundaries, file indexing, task ownership, durable run creation/cancellation, and private-file RAG exclusion. It uses isolated synthetic accounts and briefly pauses an idle run queue; it makes no model calls and cleans up its fixtures.

Product references inspected: [Dust's conversation/library workflow](https://dust.tt/academy/first-steps-on-dust/chapter/discover), [Relevance AI's business-process authoring approach](https://relevanceai.com/docs/build/invent/invent), and [Lindy's employee/task experience](https://www.lindy.ai/). Public product examples informed the interaction decisions; this application does not claim their full feature sets.

### Browser regression check

With the Docker app running:

```sh
npx playwright install chromium
npm run test:e2e
```

The test creates its own `Experience test …` organization/account. It checks employee creation and links, missing-key recovery, fixed chrome, settings deep links/back navigation, and mobile studio actions. Use a disposable local database for repeated runs. To use an installed Google Chrome instead of downloading Chromium, set `E2E_CHROME=1`. `E2E_BASE_URL` overrides the default local address.

Additional local provider-double checks passed job-description drafting, streamed Markdown/tool runs, worker cancellation, independent simultaneous conversations, document ingestion/retrieval, delete confirmation, and light/dark screenshots. These checks validate application wiring; real model quality and Composio authorization still require live credentials.

See [Connections and integration testing](docs/integration-testing.md) for workspace MCP configuration, Composio tool allowlists, direct live checks, and ordered agent workflow instructions. The current product shell was verified through browser interaction; the older employee-focused Playwright suite needs updating for the new catalog/detail routes.

### Skills and personal work

`/skills` holds organization-shared, versioned procedures; admins publish or archive them. Attach up to eight skills in an agent's Skills tab. Runs pin the selected versions and validate existing app permissions. `/my-work` holds member-private follow-ups, manual tasks, and optional read-only Scribe imports after owner-email confirmation. Local completion never updates Scribe. Coordinators can request one approved parallel batch of two draft/research specialists, each with its own linked conversation and durable status. See the QA report for validated behavior and current limits.

### Learning and evaluations

**Learning & evals** at `/quality` provides private run feedback, explicitly shared skill improvement candidates, versioned assertion suites, baseline/candidate output comparisons, and administrator review. Evaluations run on a separate worker queue; publication requires current passing evidence and creates an immutable skill version. See [the workflow and verification limits](docs/integration-testing.md#learning-and-evaluation-workflow).

### Audit and delivery decisions

See the [29 October architecture/product audit](docs/audit-2026-10-29.md), [consolidated feedback backlog and acceptance checks](docs/feedback-backlog.md), and [selective framework adoption decision](docs/adr/0001-selective-agent-frameworks.md). These distinguish existing capabilities, unfinished product journeys, and the bounded Mastra transcript integration; they do not claim a whole-platform migration or completed autonomous workflows.
