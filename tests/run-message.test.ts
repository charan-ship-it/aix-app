import { test } from "node:test";
import assert from "node:assert/strict";
import { APPROVAL_PLACEHOLDER, combineRunMessage } from "../lib/run-message";

test("approval-only notice is removed when a resumed answer is saved", () => {
  assert.equal(combineRunMessage(APPROVAL_PLACEHOLDER, "Finished.", true), "Finished.");
});
test("real pre-approval text and literal text outside approval are preserved", () => {
  assert.equal(combineRunMessage("Let me check.", "Finished.", true), "Let me check.\n\nFinished.");
  assert.equal(combineRunMessage(APPROVAL_PLACEHOLDER, "Finished.", false), `${APPROVAL_PLACEHOLDER}\n\nFinished.`);
});
