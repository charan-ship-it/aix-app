import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidTimeZone, timeContext, timezoneInstructions } from "../lib/timezone";

test("uses the local date and real UTC offset", () => {
  assert.equal(timeContext("Asia/Kolkata", new Date("2026-11-02T20:00:00Z")).local, "2026-11-03T01:30:00+05:30");
  assert.equal(timeContext("UTC", new Date("2026-11-02T20:00:00Z")).offset, "+00:00");
});
test("calculates offsets for the actual date across daylight saving", () => {
  assert.equal(timeContext("America/New_York",new Date("2026-03-08T06:59:00Z")).offset,"-05:00");
  assert.equal(timeContext("America/New_York",new Date("2026-03-08T07:00:00Z")).offset,"-04:00");
  assert.equal(timeContext("America/New_York",new Date("2026-11-01T06:00:00Z")).offset,"-05:00");
});
test("does not silently select UTC for missing or invalid settings", () => {
  assert.equal(isValidTimeZone("not/a-zone"),false);
  assert.match(timezoneInstructions(null),/ask the user/);
  assert.match(timezoneInstructions("bad/zone"),/ask the user/);
  assert.throws(() => timeContext("bad/zone"));
});
