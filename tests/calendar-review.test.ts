import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarWindowsFromToolInput } from "../lib/calendar-review";
test("approval summary reflects exact calendar arguments without inventing missing values", () => {
  const input = {tools:[{tool_slug:"GMAIL_FETCH_EMAILS",arguments:{}},{tool_slug:"GOOGLECALENDAR_EVENTS_LIST",arguments:{timeMin:"2026-11-04T00:00:00+05:30",timeMax:"2026-11-05T00:00:00+05:30",timeZone:"Asia/Calcutta"}},{tool_slug:"GOOGLECALENDAR_EVENTS_LIST",arguments:{}}]};
  assert.deepEqual(calendarWindowsFromToolInput(input),[{start:"2026-11-04T00:00:00+05:30",end:"2026-11-05T00:00:00+05:30",timezone:"Asia/Calcutta"},{start:"Not specified",end:"Not specified",timezone:"Not specified"}]);
  assert.deepEqual(calendarWindowsFromToolInput(null),[]);
});
