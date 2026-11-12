import { test } from "node:test";
import assert from "node:assert/strict";
import { MockLanguageModelV3 } from "ai/test";
import { builderPreviewSchema } from "../lib/builder-preview";
import { runBuilderPreview } from "../lib/server/builder-preview";

const input = { instructions: "Extract actions only from supplied notes.", prompt: "Maya will send the proposal Friday.", provider: "openai" as const, model: "test-model" };
test("preview accepts only bounded instructions and sample text", () => {
  assert.equal(builderPreviewSchema.safeParse(input).success, true);
  assert.equal(builderPreviewSchema.safeParse({ ...input, tools: ["gmail"] }).success, false);
  assert.equal(builderPreviewSchema.safeParse({ ...input, prompt: " " }).success, false);
  assert.equal(builderPreviewSchema.safeParse({ ...input, instructions: "short" }).success, false);
  assert.equal(builderPreviewSchema.safeParse({ ...input, model: "bad model" }).success, false);
});
test("preview sends only draft instructions and sample to the model, with no tools", async () => {
  const model = new MockLanguageModelV3({ doGenerate: async () => ({
    content: [{ type: "text", text: "| Action | Owner |\n| Send proposal | Maya |" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 8, text: 8, reasoning: 0 } }, warnings: [],
  }) });
  const result = await runBuilderPreview(model, input);
  assert.match(result, /Maya/);
  assert.equal(model.doGenerateCalls.length, 1);
  const call = model.doGenerateCalls[0];
  assert.equal(call.tools?.length || 0, 0);
  assert.equal(call.maxOutputTokens, 1500);
  assert.match(JSON.stringify(call.prompt), /No external tools/);
  assert.match(JSON.stringify(call.prompt), /Maya will send the proposal Friday/);
});
