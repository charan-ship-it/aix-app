import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAgent } from "../lib/agent-config";
import { agents } from "../lib/workspace";

test("transcript analysis is an explicit capability and grants no source or task access", () => {
  const existing = normalizeAgent(agents[0]);
  assert.deepEqual(existing.tools, ["knowledge_search"]);
  const transcriptAgent = normalizeAgent({
    ...existing,
    tools: ["extract_transcript_actions"],
    knowledgeScope: "none",
  });
  assert.deepEqual(transcriptAgent.tools, ["extract_transcript_actions"]);
  assert.deepEqual(transcriptAgent.toolkits, []);
  assert.deepEqual(transcriptAgent.mcpTools, []);
  assert.deepEqual(transcriptAgent.delegateAgentIds, []);
  assert.throws(() => normalizeAgent({ ...existing, tools: ["create_external_tasks"] }));
});
