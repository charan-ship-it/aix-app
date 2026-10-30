import { test } from "node:test";
import assert from "node:assert/strict";
import { connectedDefault, builtinEmployees } from "../lib/employee-models";
test("built-in employees use the connected model account, including OpenAI-only organizations", () => {
  const connections = [
    { provider: "anthropic", configured: false, models: [] },
    {
      provider: "openai",
      configured: true,
      models: ["gpt-available-to-this-account"],
    },
  ];
  assert.deepEqual(connectedDefault(connections), {
    provider: "openai",
    model: "gpt-available-to-this-account",
  });
  for (const employee of builtinEmployees(connections)) {
    assert.equal(employee.provider, "openai");
    assert.equal(employee.model, "gpt-available-to-this-account");
    assert.ok(employee.instructions.length >= 20);
  }
});
test("no model account produces no fabricated connection", () => {
  assert.equal(connectedDefault([]), null);
});
