type CalendarWindow = { start: string; end: string; timezone: string };
export function calendarWindowsFromToolInput(input: unknown): CalendarWindow[] {
  if (!input || typeof input !== "object" || !("tools" in input) || !Array.isArray(input.tools)) return [];
  return input.tools.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("tool_slug" in entry) || entry.tool_slug !== "GOOGLECALENDAR_EVENTS_LIST" || !("arguments" in entry) || !entry.arguments || typeof entry.arguments !== "object") return [];
    const args = entry.arguments as Record<string, unknown>;
    const value = (name: string) => typeof args[name] === "string" ? (args[name] as string).slice(0,100) : "Not specified";
    return [{start:value("timeMin"),end:value("timeMax"),timezone:value("timeZone")}];
  });
}
