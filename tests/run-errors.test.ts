import { test } from "node:test";
import assert from "node:assert/strict";
import { APICallError } from "ai";
import { runErrorMessage } from "../lib/server/run-errors";
test("provider errors are actionable without reflecting upstream secrets", () => {
  const error = new APICallError({
    message: "upstream-key-sensitive",
    url: "https://provider.example/models",
    requestBodyValues: { secret: "sensitive" },
    statusCode: 429,
    responseBody: "sensitive",
    isRetryable: false,
  });
  const message = runErrorMessage(error);
  assert.match(message, /usage or rate limit/);
  assert.ok(!message.includes("sensitive"));
});
