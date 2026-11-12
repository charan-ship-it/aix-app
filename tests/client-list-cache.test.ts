import assert from "node:assert/strict";
import test from "node:test";
import { clearListCache, readListCache, writeListCache } from "../lib/client-list-cache";

test("list cache keeps user, workspace and query entries separate and can invalidate them", () => {
  const first = JSON.stringify(["conversations", "user-a", "org-a", "all"]);
  const otherUser = JSON.stringify(["conversations", "user-b", "org-a", "all"]);
  const otherOrg = JSON.stringify(["conversations", "user-a", "org-b", "all"]);
  const otherQuery = JSON.stringify(["conversations", "user-a", "org-a", "agent=1"]);
  writeListCache(first, ["first"]);
  assert.deepEqual(readListCache(first), ["first"]);
  assert.equal(readListCache(otherUser), undefined);
  assert.equal(readListCache(otherOrg), undefined);
  assert.equal(readListCache(otherQuery), undefined);
  clearListCache(first);
  assert.equal(readListCache(first), undefined);
});

test("list cache expires entries", () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    writeListCache("expiry-test", "value");
    now += 15_000;
    assert.equal(readListCache("expiry-test"), undefined);
  } finally { Date.now = originalNow; clearListCache("expiry-test"); }
});
