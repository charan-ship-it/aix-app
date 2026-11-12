import { isValidTimeZone, timeContext } from "./timezone";

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
function checkedBoundary(value: unknown, timezone: string | null): number | null {
  if (typeof value !== "string") return null;
  const m = ISO.exec(value);
  if (!m) return null;
  const [, year, month, day, hour, minute, second, offset] = m;
  if (offset === "-00:00") return null; // RFC 3339 uses this to mean the local offset is unknown.
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [y, mo, d, h, mi, s] = parts;
  const utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  if (y < 100 || utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  if (offset !== "Z") {
    const [oh, om] = offset.slice(1).split(":").map(Number);
    if (oh > 23 || om > 59) return null;
  }
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  // UTC explicitly represents an instant. Other offsets must agree with the
  // selected zone at that instant, including daylight-saving transitions.
  if (timezone && offset !== "Z" && offset !== "+00:00") {
    const actual = timeContext(timezone, new Date(instant));
    if (actual.offset !== offset || actual.local.slice(0, 19) !== value.slice(0, 19)) return null;
  }
  return instant;
}

export function validateCalendarArguments(input: unknown, defaultTimezone: string | null = null): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Calendar search needs valid date boundaries.";
  const args = input as Record<string, unknown>;
  const tz = args.timeZone;
  if (tz !== undefined && (typeof tz !== "string" || !isValidTimeZone(tz))) return "Calendar search needs a valid IANA timezone.";
  const zone = typeof tz === "string" ? tz : defaultTimezone;
  if (zone && !isValidTimeZone(zone)) return "Calendar search needs a valid IANA timezone.";
  const start = checkedBoundary(args.timeMin, zone), end = checkedBoundary(args.timeMax, zone);
  if (start === null || end === null) return "Calendar search needs valid offset-bearing start and end times; any local offset must match the supplied timezone at that date.";
  if (start >= end) return "Calendar search end must be after its start.";
  return null;
}

export function validateCalendarToolRequest(input: unknown, defaultTimezone: string | null = null): string | null {
  if (!input || typeof input !== "object" || !("tools" in input) || !Array.isArray(input.tools)) return null;
  for (const entry of input.tools) {
    if (entry && typeof entry === "object" && entry.tool_slug === "GOOGLECALENDAR_EVENTS_LIST") {
      const error = validateCalendarArguments(entry.arguments, defaultTimezone);
      if (error) return error;
    }
  }
  return null;
}
