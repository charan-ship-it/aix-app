// Native AIX run -> actual AI SDK transport -> embedded Mastra workflow -> durable chat.
// The model server is localhost-only and returns controlled synthetic responses.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../db";
import { organization, member, user, records, runs, credentials } from "../db/schema";
import { normalizeAgent } from "../lib/agent-config";
import { enqueueRun, runAgent, type RunPayload } from "../lib/server/runtime";
import { seal } from "../lib/server/secrets";
import { agentQueue } from "../lib/server/queue";
import { getRedis } from "../lib/server/redis";
import type { WorkspaceUser } from "../lib/server/http";
try { process.loadEnvFile(); } catch {}
const redis = new URL(process.env.REDIS_URL!); redis.pathname = "/10"; process.env.REDIS_URL = redis.toString();
const suffix = crypto.randomUUID(), orgId = `transcript-fixture-${suffix}`, userId = `transcript-user-${suffix}`;
const actor: WorkspaceUser = { userId, organizationId: orgId, displayName: "Synthetic transcript fixture", organizationName: "Transcript fixture", email: `${userId}@example.invalid`, role: "owner" };
const agent = normalizeAgent({ id: crypto.randomUUID(), name: "Synthetic transcript runtime", description: "Local transport fixture", instructions: "Read the supplied transcript and call extract_transcript_actions before answering with the result table.", category: "Testing", icon: "sparkles", color: "orange", provider: "anthropic", model: "fixture-model", tools: ["extract_transcript_actions"], toolkits: [], mcpTools: [], knowledgeScope: "none" });
const transcript = "[00:01] Casey: I will send the launch plan by Friday.\n[00:08] Morgan: Thanks, Casey.";
const extraction = { items: [{ action: "Send the launch plan", owner: "Casey", dueText: "by Friday", evidenceQuote: "I will send the launch plan by Friday.", clarification: "Confirm the calendar date for Friday." }], questions: ["What date is Friday?"] };
const db = getDb(); let server: Server, innerRequests = 0, outerRequests = 0;
const runIds: string[] = [];
before(async () => {
  await db.insert(user).values({ id: userId, name: actor.displayName, email: actor.email });
  await db.insert(organization).values({ id: orgId, name: actor.organizationName, slug: orgId });
  await db.insert(member).values({ id: crypto.randomUUID(), organizationId: orgId, userId, role: "owner" });
  await db.insert(records).values({ organizationId: orgId, createdBy: userId, id: agent.id, kind: "agent", data: agent });
  await db.insert(credentials).values({ organizationId: orgId, provider: "anthropic", ciphertext: await seal("synthetic-local-only", orgId, "anthropic"), lastFour: "test", models: ["fixture-model"] });
  server = createServer(async (req, res) => {
    let text = ""; for await (const part of req) text += part;
    const body = JSON.parse(text);
    if (!body.stream) {
      innerRequests++;
      assert.equal(body.model, "fixture-model");
      assert.ok(JSON.stringify(body.messages).includes(transcript.split("\n")[0]));
      // AI SDK's schema-output transport may use a forced JSON tool or native JSON text.
      const forced = body.tools?.some((x: {name: string}) => x.name === "json") ? "json" : undefined;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "msg_inner", type: "message", role: "assistant", model: body.model,
        content: forced ? [{ type: "tool_use", id: "obj_one", name: forced, input: extraction }] : [{ type: "text", text: JSON.stringify(extraction) }],
        stop_reason: forced ? "tool_use" : "end_turn", stop_sequence: null, usage: { input_tokens: 3, output_tokens: 6 } }));
      return;
    }
    outerRequests++;
    const result = body.messages.flatMap((m: any) => Array.isArray(m.content) ? m.content : []).find((x: any) => x.type === "tool_result" && x.tool_use_id === "transcript_call");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const send = (kind: string, data: unknown) => res.write(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
    send("message_start", { type: "message_start", message: { id: "msg_outer", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } });
    if (!result) {
      assert.ok(body.tools.some((t: any) => t.name === "extract_transcript_actions"));
      send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "transcript_call", name: "extract_transcript_actions", input: {} } });
      send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ transcript, title: "Synthetic launch" }) } });
    } else {
      const content = typeof result.content === "string" ? result.content : result.content?.map((x: any) => x.text || "").join("");
      const output = JSON.parse(content);
      send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: output.markdown || "Fixture did not receive validated workflow output" } });
    }
    send("content_block_stop", { type: "content_block_stop", index: 0 });
    send("message_delta", { type: "message_delta", delta: { stop_reason: result ? "end_turn" : "tool_use", stop_sequence: null }, usage: { output_tokens: 2 } });
    send("message_stop", { type: "message_stop" }); res.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
  process.env.ALLOW_SHARED_PROVIDER_KEYS = "false";
});
after(async () => {
  if (server) { server.close(); await once(server, "close"); }
  const queue = agentQueue();
  for (const id of runIds) { const job = await queue.getJob(id); await job?.remove(); await getRedis().del(`run-events:${id}`, `run-cancel:${id}`); }
  await db.delete(organization).where(eq(organization.id, orgId));
  await db.delete(user).where(eq(user.id, userId));
  await queue.close(); await getRedis().quit(); await getSql().end();
});
test("native agent tool executes actual Mastra steps and saves evidence, table and usage in the existing run", async () => {
  const queued = await enqueueRun(actor, agent.id, `Extract actions from this synthetic transcript:\n${transcript}`);
  runIds.push(queued.runId);
  await runAgent(queued.runId);
  const [run] = await db.select().from(runs).where(and(eq(runs.id, queued.runId), eq(runs.organizationId, orgId)));
  assert.equal(run.status, "completed", JSON.stringify((run.payload as RunPayload).error));
  const payload = run.payload as RunPayload;
  assert.equal(payload.transcriptAnalysisCalls, 1);
  assert.equal(innerRequests, 1); assert.equal(outerRequests, 2);
  assert.ok(payload.usage!.input >= 5); assert.ok(payload.usage!.output >= 10);
  const trace = payload.trace.find(x => x.tool === "extract_transcript_actions");
  assert.equal(trace?.status, "completed");
  assert.ok(JSON.stringify(trace?.input).includes("omitted from trace"));
  assert.ok(!JSON.stringify(trace?.input).includes(transcript));
  assert.match(String(trace?.output || ""), /mastra-workflow/);
  const [chat] = await db.select().from(records).where(and(eq(records.organizationId, orgId), eq(records.id, queued.chat.id)));
  const messages = (chat.data as any).messages;
  const answer = messages.find((m: any) => m.runId === run.id);
  assert.match(answer.content, /Send the launch plan/);
  assert.match(answer.content, /lines 1/);
  assert.match(answer.content, /No tasks or messages were created/);
});
