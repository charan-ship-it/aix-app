// Run against the local Docker stack: node --import tsx tests/workspace-flows.integration.ts
// Creates isolated synthetic accounts, cleans them up, and never calls a model.
import assert from "node:assert/strict";
import { getSql } from "../db";
import { seal } from "../lib/server/secrets";
import { agentQueue } from "../lib/server/queue";
import { getRedis } from "../lib/server/redis";
process.loadEnvFile();
const root = process.env.FLOW_TEST_URL || "http://localhost:4173";
assert.ok(new URL(root).hostname === "localhost", "This test is local-only.");
const stamp = Date.now(),
  sql = getSql(),
  users: string[] = [],
  orgs: string[] = [],
  jobs: string[] = [];
let pausedByTest = false;
class Client {
  cookies = new Map<string, string>();
  async request(path: string, body?: unknown) {
    const response = await fetch(root + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: root,
        "Content-Type": "application/json",
        Cookie: [...this.cookies].map(([k, v]) => k + "=" + v).join("; "),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return { status: response.status, data: await response.json() };
  }
  async ok(path: string, body?: unknown) {
    const r = await this.request(path, body);
    assert.ok(
      r.status < 300,
      path + " " + r.status + " " + JSON.stringify(r.data),
    );
    return r.data;
  }
}
async function account(label: string) {
  const c = new Client();
  const d = await c.ok("/api/auth/sign-up/email", {
    name: "Workflow test " + label,
    email: `flow-${stamp}-${label}@example.test`,
    password: "Local-flow-fixture-passphrase-1234",
  });
  users.push(d.user.id);
  return c;
}
try {
  const a = await account("owner"),
    b = await account("member"),
    outsider = await account("outsider");
  const org = await a.ok("/api/auth/organization/create", {
    name: "Workflow integration " + stamp,
    slug: "flow-" + stamp,
  });
  orgs.push(org.id);
  await a.ok("/api/auth/organization/set-active", { organizationId: org.id });
  await sql`insert into organization_member(id,organization_id,user_id,role) values(${crypto.randomUUID()},${org.id},${users[1]},'member')`;
  await b.ok("/api/auth/organization/set-active", { organizationId: org.id });
  const other = await outsider.ok("/api/auth/organization/create", {
    name: "Workflow outsider " + stamp,
    slug: "flow-other-" + stamp,
  });
  orgs.push(other.id);
  await outsider.ok("/api/auth/organization/set-active", {
    organizationId: other.id,
  });
  const pod = {
    id: crypto.randomUUID(),
    name: "Synthetic launch Pod",
    description: "Test ownership",
    instructions:
      "Always use the Pod launch notes and identify unresolved decisions.",
    defaultAgentId: "xcelerate",
    access: "private",
  };
  await a.ok("/api/pods", pod);
  assert.equal((await b.request("/api/workspace?podId=" + pod.id)).status, 404);
  assert.equal(
    (await outsider.request("/api/workspace?podId=" + pod.id)).status,
    404,
  );
  assert.ok(!(await b.ok("/api/pods")).items.some((p: any) => p.id === pod.id));
  console.log("PASS private Pod and cross-organization access");
  const doc = {
    id: crypto.randomUUID(),
    podId: pod.id,
    name: "launch-notes.md",
    content:
      "Synthetic project: Mangofox. Launch owner is Casey. Launch objective: a small pilot.",
    updatedAt: new Date().toISOString(),
  };
  await a.ok("/api/workspace", { kind: "document", data: doc });
  assert.ok(
    !(await a.ok("/api/workspace")).records.some((r: any) => r.id === doc.id),
  );
  assert.ok(
    (await a.ok("/api/workspace?podId=" + pod.id)).records.some(
      (r: any) => r.id === doc.id,
    ),
  );
  assert.ok(
    !(await a.ok("/api/workspace?agentId=research")).records.some(
      (r: any) => r.id === doc.id,
    ),
  );
  assert.equal(
    (
      await b.request("/api/workspace", {
        kind: "document",
        action: "reindex",
        data: { id: doc.id },
      })
    ).status,
    404,
  );
  console.log(
    "PASS Pod file ownership, global/employee separation, unauthorized mutations",
  );
  for (let i = 0; i < 40; i++) {
    const state = await a.ok("/api/workspace?podId=" + pod.id);
    if (state.records.find((r: any) => r.id === doc.id)?.status === "ready")
      break;
    await new Promise((r) => setTimeout(r, 150));
  }
  const indexed = (await a.ok("/api/workspace?podId=" + pod.id)).records.find(
    (r: any) => r.id === doc.id,
  );
  assert.equal(indexed.status, "ready");
  assert.ok(indexed.chunkCount > 0);
  console.log("PASS Pod file indexing worker");
  const folder = (
    await a.ok("/api/folders", {
      action: "create",
      podId: pod.id,
      name: "Project notes",
    })
  ).folder;
  const nested = (
    await a.ok("/api/folders", {
      action: "create",
      podId: pod.id,
      parentId: folder.id,
      name: "Briefs",
    })
  ).folder;
  assert.equal((await b.request("/api/folders?podId=" + pod.id)).status, 404);
  assert.ok(
    !(await a.ok("/api/folders")).folders.some((f: any) => f.id === folder.id),
  );
  assert.equal(
    (
      await a.request("/api/workspace", {
        kind: "document",
        data: { ...doc, folderId: folder.id, podId: undefined },
      })
    ).status,
    409,
  );
  const companyFolder = (
    await a.ok("/api/folders", { action: "create", name: "Company sources" })
  ).folder;
  assert.equal(
    (
      await a.request("/api/workspace", {
        kind: "document",
        data: { ...doc, folderId: companyFolder.id },
      })
    ).status,
    404,
  );
  await a.ok("/api/workspace", {
    kind: "document",
    data: { ...doc, folderId: nested.id },
  });
  assert.equal(
    (
      await a.request("/api/folders", {
        action: "delete",
        podId: pod.id,
        id: folder.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await a.request("/api/folders", {
        action: "delete",
        podId: pod.id,
        id: nested.id,
      })
    ).status,
    409,
  );
  await a.ok("/api/folders", {
    action: "rename",
    podId: pod.id,
    id: nested.id,
    name: "Approved briefs",
  });
  assert.equal(
    (await a.ok("/api/folders?podId=" + pod.id)).folders.find(
      (f: any) => f.id === nested.id,
    ).name,
    "Approved briefs",
  );
  console.log(
    "PASS nested folders, file placement, private folder access, and nonempty deletion protection",
  );

  const task = (
    await a.ok("/api/pods/" + pod.id + "/tasks", {
      action: "create",
      title: "Draft launch checklist",
      prompt: "Draft three launch steps from the Pod notes.",
    })
  ).item;
  assert.ok(
    (await a.ok("/api/pods/" + pod.id + "/tasks")).items.some(
      (t: any) => t.id === task.id,
    ),
  );
  assert.ok(
    !(await a.ok("/api/employees/research/tasks")).items.some(
      (t: any) => t.id === task.id,
    ),
  );
  assert.equal(
    (
      await a.request("/api/pods/" + pod.id + "/tasks", {
        action: "run",
        id: task.id,
      })
    ).status,
    428,
  );
  assert.equal(
    (await a.ok("/api/pods/" + pod.id + "/tasks")).items[0].runId,
    undefined,
  );
  console.log("PASS task persistence, scope, and missing-provider recovery");
  await a.ok("/api/pods/" + pod.id + "/tasks", {
    action: "complete",
    id: task.id,
  });
  assert.equal(
    (await a.ok("/api/pods/" + pod.id + "/tasks")).items[0].status,
    "done",
  );
  await a.ok("/api/pods/" + pod.id + "/tasks", {
    action: "reopen",
    id: task.id,
  });
  // Briefly pause an idle local queue to inspect a real enqueued run without model traffic.
  const queue = agentQueue();
  assert.equal(
    await queue.getActiveCount(),
    0,
    "Run this when the local worker is idle.",
  );
  assert.equal(await queue.isPaused(), false);
  await queue.pause();
  pausedByTest = true;
  const encrypted = await seal("synthetic-never-sent", org.id, "anthropic");
  await sql`insert into provider_credential(organization_id,provider,ciphertext,last_four,models) values(${org.id},'anthropic',${encrypted},'sent',${sql.json(["synthetic-model"])})`;
  const queued = await a.ok("/api/pods/" + pod.id + "/tasks", {
    action: "run",
    id: task.id,
    agentId: "research",
    instructions: "Include clear owners for every step.",
  });
  jobs.push(queued.runId);
  assert.notEqual(
    queued.chatId,
    task.id,
    "Task and conversation IDs are distinct records.",
  );
  const [run] = await sql`select * from agent_run where id=${queued.runId}`;
  assert.equal(run.status, "queued");
  assert.ok(run.payload.agent.instructions.includes(pod.instructions));
  assert.ok(run.payload.messages[0].content.includes("Include clear owners"));
  assert.ok(run.payload.agent.documentIds.includes(doc.id));
  const state = await a.ok("/api/workspace?podId=" + pod.id),
    chat = state.records.find((r: any) => r.id === queued.chatId);
  assert.equal(chat.podId, pod.id);
  assert.equal(chat.agentId, "research");
  assert.equal(
    (await a.ok("/api/pods/" + pod.id + "/tasks")).items[0].chatId,
    chat.id,
  );
  assert.ok(
    !(await a.ok("/api/workspace?agentId=research")).records.some(
      (r: any) => r.id === chat.id,
    ),
  );
  assert.equal(
    (
      await a.request("/api/chat", {
        agentId: "research",
        chatId: chat.id,
        message: "Attempt to move context",
      })
    ).status,
    409,
  );
  assert.equal((await b.request("/api/runs/" + queued.runId)).status, 404);
  assert.ok(
    (await a.ok("/api/runs?podId=" + pod.id)).items.some(
      (r: any) => r.id === queued.runId,
    ),
  );
  assert.ok(
    !(await a.ok("/api/runs?agentId=research")).items.some(
      (r: any) => r.id === queued.runId,
    ),
  );
  await a.ok("/api/runs/" + queued.runId + "/cancel", {});
  assert.equal((await a.ok("/api/runs/" + queued.runId)).status, "cancelled");
  console.log(
    "PASS task → durable run → owned conversation, Pod instructions/RAG snapshot, run isolation, and cancellation",
  );
  const globalAgent = {
    id: crypto.randomUUID(),
    name: "Global test search",
    description: "Synthetic search",
    instructions: "Search all available company sources accurately.",
    model: "synthetic-model",
    provider: "anthropic",
    category: "Test",
    icon: "search",
    color: "orange",
    tools: ["knowledge_search"],
    toolkits: [],
    knowledgeScope: "all",
    documentIds: [],
    externalPolicy: "ask",
    maxSteps: 3,
    starters: [],
  };
  await a.ok("/api/workspace", { kind: "agent", data: globalAgent });
  const found = await a.ok("/api/knowledge/search", {
    agentId: globalAgent.id,
    query: "Mangofox launch",
  });
  assert.equal(found.items.length, 0);
  console.log("PASS organization-wide RAG excludes private Pod files");
  await a.ok("/api/pods", { ...pod, access: "organization" });
  assert.ok(
    (await b.ok("/api/workspace?podId=" + pod.id)).records.some(
      (r: any) => r.id === doc.id,
    ),
  );
  assert.equal(
    (
      await b.request("/api/pods", {
        ...pod,
        access: "organization",
        name: "Unauthorized edit",
      })
    ).status,
    403,
  );
  assert.equal(
    (await outsider.request("/api/workspace?podId=" + pod.id)).status,
    404,
  );
  console.log("PASS organization Pod access, owner edits, and tenant boundary");
  const inboxItem = (await a.ok("/api/inbox")).items.find(
    (r: any) => r.id === queued.runId,
  );
  assert.equal(inboxItem.status, "cancelled");
  assert.equal(
    (await b.ok("/api/inbox")).items.some((r: any) => r.id === queued.runId),
    false,
  );
  assert.equal(
    (
      await outsider.request("/api/inbox", {
        id: queued.runId,
        updatedAt: inboxItem.updatedAt,
      })
    ).status,
    404,
  );
  await a.ok("/api/inbox", {
    id: queued.runId,
    updatedAt: inboxItem.updatedAt,
  });
  assert.equal(
    (await a.ok("/api/inbox")).items.find((r: any) => r.id === queued.runId)
      .reviewed,
    true,
  );
  await sql`update agent_run set status='failed',updated_at=now()+interval '1 second',payload=jsonb_set(payload,'{error}','"Synthetic inbox failure"'::jsonb) where id=${queued.runId}`;
  const changed = (await a.ok("/api/inbox")).items.find(
    (r: any) => r.id === queued.runId,
  );
  assert.equal(changed.reviewed, false);
  assert.equal(changed.error, "Synthetic inbox failure");
  assert.equal(
    (
      await a.request("/api/inbox", {
        id: queued.runId,
        updatedAt: inboxItem.updatedAt,
      })
    ).status,
    409,
  );
  await sql`update agent_run set status='awaiting_approval',updated_at=now(),payload=jsonb_set(payload,'{pending}',${sql.json([{ id: "current-approval", tool: "synthetic_read", input: {} }])}::jsonb) where id=${queued.runId}`;
  const pending = (await a.ok("/api/inbox")).items.find(
    (r: any) => r.id === queued.runId,
  );
  assert.equal(pending.pendingCount, 1);
  assert.equal(
    (
      await a.request("/api/inbox", {
        id: queued.runId,
        updatedAt: pending.updatedAt,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await a.request(`/api/runs/${queued.runId}/approve`, {
        approved: true,
        expectedApprovalIds: ["stale-approval"],
      })
    ).status,
    409,
  );
  await sql`update agent_run set status='cancelled',updated_at=now(),payload=jsonb_set(payload,'{pending}','[]'::jsonb) where id=${queued.runId}`;
  console.log(
    "PASS inbox ownership, reviewed state, changed-run recovery and stale approval rejection",
  );
  assert.equal(
    (await a.ok(`/api/conversations/${queued.chatId}/delegations`)).items
      .length,
    0,
  );
  assert.equal(
    (await b.request(`/api/conversations/${queued.chatId}/delegations`)).status,
    404,
  );
  assert.equal(
    (await outsider.request(`/api/conversations/${queued.chatId}/delegations`))
      .status,
    404,
  );
  console.log(
    "PASS delegated-work history endpoint preserves conversation ownership and tenant scope",
  );

  const memberChatId = crypto.randomUUID(),
    memberRunId = crypto.randomUUID();
  await sql`insert into workspace_record(organization_id,id,created_by,kind,data) values(${org.id},${memberChatId},${users[1]},'chat',${sql.json({ id: memberChatId, title: "Synthetic revoked-access conversation", agentId: "research", podId: pod.id, messages: [], updatedAt: new Date().toISOString() })}::jsonb)`;
  await sql`insert into agent_run(id,organization_id,created_by,chat_id,agent_id,status,payload) values(${memberRunId},${org.id},${users[1]},${memberChatId},'research','completed',${sql.json({ agent: { name: "Synthetic member agent" }, pending: [], trace: [] })}::jsonb)`;
  assert.ok(
    (await b.ok("/api/inbox")).items.some((r: any) => r.id === memberRunId),
  );

  // Private, paginated history spans both direct and currently accessible Pod chats.
  // These records belong only to the disposable integration-test organization.
  const historyDate = new Date().toISOString();
  const historyGlobals = [
    { id: crypto.randomUUID(), title: "History acceptance: literal % marker" },
    { id: crypto.randomUUID(), title: "History acceptance: second conversation" },
    { id: crypto.randomUUID(), title: "History acceptance: third conversation" },
  ];
  for (const item of historyGlobals) {
    const data = { ...item, agentId: "research", messages: [{ role: "user", content: "PRIVATE_HISTORY_BODY_MUST_NOT_BE_RETURNED" }], updatedAt: historyDate };
    await sql`insert into workspace_record(organization_id,id,created_by,kind,data,updated_at) values(${org.id},${item.id},${users[1]},'chat',${JSON.stringify(data)}::text::jsonb,${historyDate})`;
  }
  const memberHistory = await b.ok("/api/conversations");
  const expectedHistoryIds = [memberChatId, ...historyGlobals.map((item) => item.id)].sort();
  assert.deepEqual(memberHistory.items.map((item: any) => item.id).sort(), expectedHistoryIds);
  const podHistory = memberHistory.items.find((item: any) => item.id === memberChatId);
  assert.equal(podHistory.podId, pod.id);
  assert.equal(podHistory.podName, pod.name);
  assert.equal(typeof podHistory.agentName, "string");
  assert.equal(typeof podHistory.messageCount, "number");
  assert.equal(JSON.stringify(memberHistory).includes("PRIVATE_HISTORY_BODY_MUST_NOT_BE_RETURNED"), false);
  assert.ok(memberHistory.items.every((item: any) => !("messages" in item) && !("content" in item)));
  assert.equal((await a.ok("/api/conversations")).items.some((item: any) => expectedHistoryIds.includes(item.id)), false);
  assert.equal((await outsider.ok("/api/conversations")).items.some((item: any) => expectedHistoryIds.includes(item.id)), false);
  assert.deepEqual((await b.ok(`/api/conversations?podId=${pod.id}`)).items.map((item: any) => item.id), [memberChatId]);
  assert.equal((await b.ok("/api/conversations?agentId=research")).items.length, expectedHistoryIds.length);
  assert.deepEqual((await b.ok("/api/conversations?q=%25")).items.map((item: any) => item.id), [historyGlobals[0].id], "Search treats percent as literal text rather than a SQL wildcard");
  const historyFirstPage = await b.ok("/api/conversations?limit=2");
  assert.equal(historyFirstPage.items.length, 2);
  assert.equal(typeof historyFirstPage.nextCursor, "string");
  const historySecondPage = await b.ok(`/api/conversations?limit=2&cursor=${encodeURIComponent(historyFirstPage.nextCursor)}`);
  assert.equal(historySecondPage.items.length, 2);
  assert.equal(historySecondPage.nextCursor, null);
  assert.deepEqual([...historyFirstPage.items, ...historySecondPage.items].map((item: any) => item.id).sort(), expectedHistoryIds);
  assert.equal((await b.request("/api/conversations?cursor=malformed")).status, 400);
  assert.equal((await b.request("/api/conversations?limit=0")).status, 400);
  assert.equal((await b.request("/api/conversations?limit=51")).status, 400);
  assert.equal((await b.request(`/api/conversations?q=changed&cursor=${encodeURIComponent(historyFirstPage.nextCursor)}`)).status, 400, "A cursor cannot be reused under different search filters");
  console.log("PASS private cross-Pod conversation index, summary-only results, literal search and stable bounded pagination");

  const memberEvents = await fetch(`${root}/api/runs/${memberRunId}/events`, {
    headers: { Cookie: [...b.cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(memberEvents.status, 200);
  assert.equal(memberEvents.headers.get("content-type"), "text/event-stream");
  assert.match(await memberEvents.text(), /Synthetic revoked-access conversation/);
  await a.ok("/api/pods", { ...pod, access: "private" });
  assert.equal(
    (await b.ok("/api/inbox")).items.some((r: any) => r.id === memberRunId),
    false,
  );
  assert.equal((await b.request(`/api/runs/${memberRunId}`)).status, 404);
  assert.equal((await b.request(`/api/runs/${memberRunId}/events`)).status, 404);
  assert.equal((await outsider.request(`/api/runs/${memberRunId}/events`)).status, 404);
  assert.equal((await b.ok("/api/conversations")).items.some((item: any) => item.id === memberChatId), false);
  assert.equal((await b.ok(`/api/conversations?podId=${pod.id}`)).items.length, 0);
  await a.ok("/api/pods", { ...pod, access: "organization" });
  console.log("PASS inbox, run details, event stream entry and history honor revoked project access");

  // Product credentials are never customer-editable, even for an org admin.
  assert.equal((await a.request('/api/settings', {provider: 'composio', apiKey: 'fixture-not-a-real-key'})).status, 400);
  assert.equal((await a.ok('/api/settings')).providers.some((p: any) => p.provider === 'composio'), false);
  if (!process.env.COMPOSIO_API_KEY) {
    assert.equal((await a.request('/api/connections/tools?toolkit=gmail')).status, 428);
  } else {
    const connections = await a.ok('/api/connections');
    assert.equal(connections.configured, true);
    assert.equal(connections.items.some((t: any) => t.connected), false, 'Existing project accounts must not be borrowed by a new member');
    assert.ok(connections.items.some((t: any) => t.slug === 'jira'));
    const tools = await a.ok('/api/connections/tools?toolkit=gmail&readOnly=1');
    assert.ok(tools.items.length > 0, 'Live product credential discovers Gmail tools');
  }
  const testId = crypto.randomUUID();
  await sql`insert into workspace_record(organization_id,id,created_by,kind,data) values(${org.id},${testId},${users[0]},'integration-test',${sql.json({ id: testId, toolkit: "gmail", tool: "TEST_ONLY_FIXTURE", status: "failed", startedAt: new Date().toISOString(), error: "Synthetic isolation fixture" })}::jsonb)`;
  assert.ok(
    (await a.ok("/api/connections/tests")).items.some(
      (t: any) => t.id === testId,
    ),
  );
  assert.equal((await b.ok("/api/connections/tests")).items.length, 0);
  assert.equal((await outsider.ok("/api/connections/tests")).items.length, 0);
  assert.equal(
    (await a.ok("/api/workspace")).records.some((r: any) => r.id === testId),
    false,
  );
  const mcp = {
    id: crypto.randomUUID(),
    name: "Public MCP integration check",
    url: "https://mcp.deepwiki.com/mcp",
    enabled: true,
  };
  assert.equal(
    (await b.request("/api/connections/mcp", { connection: mcp })).status,
    403,
  );
  assert.equal(
    (
      await a.request("/api/connections/mcp", {
        connection: { ...mcp, url: "https://127.0.0.1/mcp" },
      })
    ).status,
    400,
  );
  console.log(
    "PASS product-managed integration configuration, account/history isolation, MCP admin and private-network restrictions",
  );
  const recipe={name:'QA evidence review',description:'Synthetic reusable procedure',instructions:'Review the provided evidence and cite sources without inventing facts.',expectedOutput:'Evidence and uncertainty',requiredToolkits:[],expectedVersion:0};
  assert.equal((await b.request('/api/skills',{action:'save',skill:recipe})).status,403);
  const published=await a.ok('/api/skills',{action:'save',skill:recipe});
  const skill=published.skill;
  assert.ok(skill?.id);
  assert.ok((await b.ok('/api/skills')).items.some((s:any)=>s.id===skill.id));
  assert.equal((await outsider.ok('/api/skills')).items.some((s:any)=>s.id===skill.id),false);
  assert.equal((await outsider.request(`/api/skills/${skill.id}/versions`)).status,404);
  const edited=await a.ok('/api/skills',{action:'save',skill:{...recipe,id:skill.id,expectedVersion:1,instructions:'Updated evidence review: preserve facts and clearly state uncertainty.'}});
  assert.equal(edited.skill.version,2);
  assert.equal((await a.request('/api/skills',{action:'save',skill:{...recipe,id:skill.id,expectedVersion:1}})).status,409);
  assert.deepEqual((await b.ok(`/api/skills/${skill.id}/versions`)).items.map((s:any)=>s.version),[2,1]);
  console.log('PASS shared skills, admin publishing, immutable versions, stale edits and tenant scope');
  const personal=await a.ok('/api/my-work',{action:'create',title:'QA personal follow-up',notes:'Synthetic API fixture',dueDate:'2026-10-27',sourceUrl:'https://example.com/qa-source'});
  const personalTask=personal.task;
  assert.ok(personalTask?.id);
  assert.ok((await a.ok('/api/my-work')).tasks.some((t:any)=>t.id===personalTask.id));
  assert.equal((await b.ok('/api/my-work')).tasks.some((t:any)=>t.id===personalTask.id),false);
  assert.equal((await outsider.ok('/api/my-work')).tasks.some((t:any)=>t.id===personalTask.id),false);
  assert.equal((await b.request('/api/my-work',{action:'update',id:personalTask.id,status:'completed'})).status,404);
  assert.equal((await outsider.request('/api/my-work',{action:'delete',id:personalTask.id})).status,404);
  const finishedPersonalTask=(await a.ok('/api/my-work',{action:'update',id:personalTask.id,status:'completed'})).task;
  assert.equal(finishedPersonalTask.status,'completed');
  assert.equal(finishedPersonalTask.notes,'Synthetic API fixture','status-only changes must preserve notes');
  assert.equal(finishedPersonalTask.dueDate,'2026-10-27','status-only changes must preserve the due date');
  const reopenedPersonalTask=(await a.ok('/api/my-work',{action:'update',id:personalTask.id,status:'open'})).task;
  assert.equal(reopenedPersonalTask.notes,'Synthetic API fixture');
  assert.equal(reopenedPersonalTask.status,'open');
  assert.equal((await a.request('/api/my-work',{action:'settings',connectionId:crypto.randomUUID(),ownerEmail:'fixture@example.invalid',confirmed:true})).status,400);
  assert.equal((await a.request('/api/my-work/sync',{})).status,409);
  await a.ok('/api/my-work',{action:'delete',id:personalTask.id});
  assert.equal((await a.ok('/api/my-work')).tasks.some((t:any)=>t.id===personalTask.id),false);
  console.log('PASS personal work persistence, completion, source links, member/tenant isolation and missing source recovery');
  const privateCorrection='Private QA correction that must not appear in organization proposals';
  const feedbackResult=await a.ok('/api/learning/feedback',{runId:queued.runId,rating:'needs-work',correction:privateCorrection});
  const savedFeedback=feedbackResult.feedback;
  assert.ok(savedFeedback.id);
  assert.equal((await a.ok('/api/learning/feedback?runId='+queued.runId)).feedback.correction,privateCorrection);
  assert.equal((await b.request('/api/learning/feedback?runId='+queued.runId)).status,404);
  assert.equal((await outsider.request('/api/learning/feedback?runId='+queued.runId)).status,404);
  const proposalInput={feedbackId:savedFeedback.id,skillId:skill.id,confirmShare:true,instructions:'Use verified evidence and always include a clear Draft section with source references.',expectedOutput:'Draft and supporting evidence',sharedRationale:'QA shared rationale: require a clear draft section.'};
  assert.equal((await a.request('/api/learning/proposals',{...proposalInput,confirmShare:false})).status,400);
  const proposal=(await a.ok('/api/learning/proposals',proposalInput)).proposal;
  assert.equal(JSON.stringify((await a.ok('/api/learning/proposals')).items).includes(privateCorrection),false);
  assert.equal((await b.ok('/api/learning/proposals')).items.some((p:any)=>p.id===proposal.id),false);
  assert.equal((await outsider.ok('/api/learning/proposals')).items.some((p:any)=>p.id===proposal.id),false);
  const evaluationSuite=(await a.ok('/api/evals/suites',{name:'QA evidence checks',skillId:skill.id,expectedRevision:0,cases:[{id:crypto.randomUUID(),name:'Draft section',input:'Draft a short response from the supplied evidence.',checks:{contains:['Draft'],notContains:['Sent successfully'],maxChars:1500}}]})).suite;
  assert.ok(evaluationSuite.id);
  assert.equal((await b.request('/api/evals/suites')).status,403);
  assert.equal((await outsider.ok('/api/evals/suites')).items.some((s:any)=>s.id===evaluationSuite.id),false);
  assert.equal((await a.request('/api/evals/runs',{suiteId:evaluationSuite.id,provider:'openai',model:'test-model',proposalId:proposal.id})).status,428);
  assert.equal((await b.request('/api/evals/runs',{suiteId:evaluationSuite.id,provider:'openai',model:'test-model',proposalId:proposal.id})).status,403);
  assert.equal((await a.request('/api/skills',{action:'save',skill:{...recipe,id:skill.id,expectedVersion:2}})).status,409,'Covered skills cannot bypass evaluation through direct publishing');
  assert.equal((await a.request(`/api/learning/proposals/${proposal.id}/review`,{action:'publish',evaluationId:crypto.randomUUID(),expectedCandidateHash:proposal.candidateHash})).status,404);
  assert.equal((await b.request(`/api/learning/proposals/${proposal.id}/review`,{action:'reject',reason:'QA rejection'})).status,403);
  assert.equal((await a.ok(`/api/learning/proposals/${proposal.id}/review`,{action:'reject',reason:'QA rejection: missing evaluated evidence.'})).proposal.status,'rejected');
  assert.equal((await a.request(`/api/learning/proposals/${proposal.id}/review`,{action:'reject',reason:'QA duplicate rejection'})).status,409);
  console.log('PASS private feedback, explicit sharing, proposal review, admin evaluations, missing-model recovery and guarded publication');
  if (process.env.TEST_PUBLIC_MCP === "true") {
    await a.ok("/api/connections/mcp", { connection: mcp });
    assert.ok(
      (await b.ok("/api/connections/mcp")).items.some(
        (c: any) => c.id === mcp.id,
      ),
    );
    assert.equal((await outsider.ok("/api/connections/mcp")).items.length, 0);
    assert.equal(
      (await outsider.request("/api/connections/mcp?id=" + mcp.id)).status,
      404,
    );
    const discovery = await b.ok("/api/connections/mcp?id=" + mcp.id);
    assert.ok(
      discovery.tools.some((t: any) => t.name === "read_wiki_structure"),
    );
    console.log(
      "PASS live public MCP handshake, actual tool discovery, shared organization reuse and cross-tenant denial",
    );
  }
} finally {
  const queue = agentQueue();
  for (const id of jobs) {
    const job = await queue.getJob(id);
    if (job) await job.remove();
    await getRedis().del("run-cancel:" + id, "events:" + id);
  }
  for (const id of orgs) await sql`delete from organization where id=${id}`;
  for (const id of users)
    await sql`delete from auth_user where id=${id} and email like ${"flow-" + stamp + "-%@example.test"}`;
  if (pausedByTest) await queue.resume();
  await queue.close();
  await getRedis().quit();
  await sql.end();
}
