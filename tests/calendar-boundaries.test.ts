import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCalendarArguments, validateCalendarToolRequest } from "../lib/calendar-boundaries";
import { executeProtectedComposio } from "../lib/server/email-safety";
const window = (timeMin: string, timeMax: string, timeZone = "America/New_York") => ({timeMin,timeMax,timeZone});
test("accepts valid India windows and daylight-saving boundary offsets", () => {
  assert.equal(validateCalendarArguments(window("2026-11-04T00:00:00+05:30","2026-11-05T00:00:00+05:30","Asia/Kolkata")),null);
  assert.equal(validateCalendarArguments(window("2026-03-08T00:00:00-05:00","2026-03-09T00:00:00-04:00")),null);
  assert.equal(validateCalendarArguments(window("2026-11-01T00:00:00-04:00","2026-11-02T00:00:00-05:00")),null);
  assert.equal(validateCalendarArguments(window("2026-03-08T05:00:00Z","2026-03-09T04:00:00Z")),null);
});
test("an invalid calendar window blocks the whole mixed request before any external tool executes", async () => {
  let called = false;
  const result = await executeProtectedComposio({tools:[{tool_slug:"GMAIL_FETCH_EMAILS",arguments:{}},{tool_slug:"GOOGLECALENDAR_EVENTS_LIST",arguments:{}}]},async () => {called=true; return {};});
  assert.equal(called,false);
  assert.match(JSON.stringify(result),/Calendar search needs/);
});
test("rejects nonexistent local times and mismatched offsets, while accepting both repeated instants", () => {
  assert.ok(validateCalendarArguments(window("2026-03-08T02:30:00-05:00","2026-03-08T04:00:00-04:00")));
  assert.ok(validateCalendarArguments(window("2026-03-09T00:00:00-05:00","2026-03-10T00:00:00-04:00")));
  assert.equal(validateCalendarArguments(window("2026-11-01T01:30:00-04:00","2026-11-01T01:30:00-05:00")),null);
});
test("rejects missing, malformed, reversed, and impossible dates before execution", () => {
  for (const args of [{},{timeMin:"2026-03-08T00:00:00",timeMax:"2026-03-09T00:00:00"},window("2026-02-30T00:00:00Z","2026-03-02T00:00:00Z"),window("2026-03-09T00:00:00Z","2026-03-08T00:00:00Z"),window("2026-03-08T00:00:00Z","2026-03-09T00:00:00Z","Unknown/Zone")]) assert.ok(validateCalendarArguments(args));
  assert.ok(validateCalendarToolRequest({tools:[{tool_slug:"GMAIL_FETCH_EMAILS",arguments:{}},{tool_slug:"GOOGLECALENDAR_EVENTS_LIST",arguments:{}}]}));
  assert.ok(validateCalendarArguments({timeMin:"2026-03-09T00:00:00-05:00",timeMax:"2026-03-10T00:00:00-05:00"},"America/New_York"));
  assert.ok(validateCalendarArguments(window("2026-03-08T00:00:00-00:00","2026-03-09T00:00:00Z")));
  assert.equal(validateCalendarToolRequest({tools:[{tool_slug:"GMAIL_FETCH_EMAILS",arguments:{}}]}),null);
});
