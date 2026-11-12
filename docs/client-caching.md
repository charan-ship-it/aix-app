# Client caching

Use the scoped cache in `lib/client-list-cache.ts` for non-live lists that can briefly show a previous result while the current user and workspace are revalidated. Include the resource, authenticated user, organization and all filters or project/agent scope in the key. The cache is memory-only, bounded and expires after 15 seconds.

Always refresh in the background. Clear the cached view if revalidation fails, and invalidate the relevant entry before mutations. Do not persist private records to browser storage. Never use cached data to authorize an action or make decisions about permissions, approvals, active runs or live execution.

Connection status is a separate exception: it stores only app identifiers and connected flags, keyed by user and organization, in the current tab's session storage for five minutes. It is labelled while refreshing and does not replace server-side authorization.

Current opt-ins: conversation history, skills, personal tasks, and folder lists. Connection status uses its own session cache. Workspace data and project files still perform their normal authenticated requests; work inbox, project run status, evaluations, approvals, tool execution and detailed conversation data remain live.
