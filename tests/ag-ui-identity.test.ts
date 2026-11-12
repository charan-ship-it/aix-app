import { test } from "node:test";
import assert from "node:assert/strict";
import { observerOwnerId } from "../lib/server/observer-identity";

test("CopilotKit observer identity is stable, SDK-safe and scoped to the exact tenant/member tuple", () => {
  const original = { organizationId: "org/with [punctuation]", userId: "member,with \"quotes\" and unicode \u2603" };
  const id = observerOwnerId(original);
  assert.match(id, /^aix_[a-f0-9]{64}$/);
  assert.match(id, /^[\w.@:=-]+$/);
  assert.ok(id.length <= 128);
  assert.equal(id, observerOwnerId({ ...original }));
  assert.notEqual(id, observerOwnerId({ ...original, organizationId: "another-org" }));
  assert.notEqual(id, observerOwnerId({ ...original, userId: "another-member" }));
  assert.notEqual(observerOwnerId({ organizationId: "ab", userId: "c" }), observerOwnerId({ organizationId: "a", userId: "bc" }));
  assert.ok(!id.includes(original.organizationId));
  assert.ok(!id.includes(original.userId));
});
