import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { generatedAgentDraftSchema } from "../lib/agent-draft";

test("generated draft schema requires all fields for strict structured output", () => {
  const schema = z.toJSONSchema(generatedAgentDraftSchema);
  assert.deepEqual(new Set(schema.required), new Set(Object.keys(schema.properties || {})));
  assert.equal(schema.additionalProperties, false);
  assert.equal(generatedAgentDraftSchema.safeParse({name:"Meeting helper",description:"Help with notes",instructions:"Extract action items from supplied notes."}).success, false);
});
