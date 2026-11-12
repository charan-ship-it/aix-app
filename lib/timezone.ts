export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
}

export function timeContext(timezone: string, now = new Date()) {
  if (!isValidTimeZone(timezone) || Number.isNaN(now.valueOf())) throw new Error("Invalid timezone or date");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZoneName: "longOffset",
  }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)?.value || "";
  const offset = part("timeZoneName").replace(/^GMT$/, "+00:00").replace(/^GMT/, "");
  return { timezone, iso: now.toISOString(), local: `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}${offset}`, offset };
}

export function timezoneInstructions(timezone: string | null, now = new Date()): string {
  if (!timezone || !isValidTimeZone(timezone)) return "No personal timezone has been set. Before interpreting relative dates for calendar work, ask the user for their timezone or explicit offset and date range; do not assume UTC or infer timezone from location.";
  const clock = timeContext(timezone, now);
  return `The initiating member's saved timezone is ${clock.timezone}; the current local time is ${clock.local}. For relative dates use this timezone, and use the correct offset for each date, including daylight-saving changes. Before calendar calls, make the local date range, timezone, and exact offset-bearing boundaries clear for review. Never assume the current offset applies to another date. If the requested range or timezone is ambiguous, ask the user.`;
}
