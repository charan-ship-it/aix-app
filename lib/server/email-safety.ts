/** Conservative protection for Composio mail results. This is a scoped first
 * layer, not a guarantee that every secret in ordinary correspondence is found. */
import { protectedMailTool, supportedMailTool, UNSUPPORTED_MAIL } from "@/lib/email-tool-policy";
import type { ModelMessage } from "ai";
import { validateCalendarToolRequest } from "@/lib/calendar-boundaries";
type Obj = Record<string, unknown>;
const record = (value: unknown): Obj | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : null;
const SENSITIVE = /(?:\b(?:one[\s-]*time|otp|verification|authentication|authenticator|passcode|password|passphrase|two[\s-]*factor|multi[\s-]*factor|2fa|mfa|magic[\s-]*link|sign[\s-]*in|log[\s-]*in)\b|\bverify\s+(?:(?:your|the)\s+)?(?:account|identity|email|login)\b|\b(?:security|access|recovery|login|confirmation|api)\s*[-_]?\s*(?:code|token|key|link)\b|\b(?:sk-(?:proj-|ant-)?|sk_scribe_|ghp_|github_pat_|ak_)[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9._~+\/-]{12,})/i;
const safeString = (value: unknown, limit = 16000) => typeof value === "string" ? value.slice(0, limit) : undefined;
const safeId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : undefined;
function normalized(value: string) { return value.normalize("NFKC").replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_all, hex: string | undefined, decimal: string | undefined) => { const code = parseInt(hex || decimal || "", hex ? 16 : 10); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " "; }).replace(/&nbsp;/gi, " ").replace(/<[^>]*>/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " "); }
function sensitiveText(value: string) { const text = normalized(value); return SENSITIVE.test(text) || /(?:\bcode\b.{0,40}\b\d{4,8}\b|\b\d{4,8}\b.{0,40}\bcode\b)/i.test(text); }
function gmailLink(value: unknown) {
  if (typeof value !== "string" || !/^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#(?:inbox|all)\/[A-Za-z0-9_-]{1,200}$/.test(value)) return undefined;
  return value;
}
function safeMessage(raw: unknown): Obj {
  const source = record(raw);
  if (!source) return { subject: "[Message omitted: unsupported format]", contentOmitted: true };
  const preview = record(source.preview);
  const fields = [source.subject, source.sender, source.to, source.messageText, source.snippet, preview?.subject, preview?.body]
    .filter((value): value is string => typeof value === "string");
  const oversized = fields.some(value => value.length > 100000);
  const inspected = fields.map(value => value.slice(0, 100000)).join(" ");
  const identity: Obj = {};
  const messageId = safeId(source.messageId), threadId = safeId(source.threadId), link = gmailLink(source.display_url);
  if (messageId) identity.messageId = messageId;
  if (threadId) identity.threadId = threadId;
  if (link) identity.display_url = link;
  const date = safeString(source.messageTimestamp, 100);
  if (date && /^\d{4}-\d\d-\d\d/.test(date)) identity.messageTimestamp = date;
  if (source.contentOmitted === true || oversized || /[A-Za-z0-9+/_-]{100,}={0,2}/.test(inspected) || sensitiveText(inspected)) return { ...identity, subject: "[Sensitive or unsupported message omitted]", contentOmitted: true };
  const output: Obj = { ...identity };
  if (fields.some(value => value.length > 16000)) output.contentTruncated = true;
  for (const key of ["subject", "sender", "to", "messageText", "snippet"] as const) {
    const value = safeString(source[key]);
    if (value !== undefined) output[key] = value;
  }
  if (preview) {
    const safePreview: Obj = {};
    for (const key of ["subject", "body"] as const) { const value = safeString(preview[key]); if (value !== undefined) safePreview[key] = value; }
    output.preview = safePreview;
  }
  if (Array.isArray(source.labelIds)) output.labelIds = source.labelIds.slice(0, 30).map(safeId).filter(Boolean);
  // Attachments, raw payloads, headers, and unfamiliar fields are intentionally omitted.
  return output;
}
export function validateComposioMailRequest(input: unknown): string | null {
  const root = record(input);
  if (!root || !Array.isArray(root.tools) || !root.tools.length) return "Unable to verify the requested app tools.";
  for (const item of root.tools) {
    const slug = record(item)?.tool_slug;
    if (typeof slug !== "string" || !/^[A-Z0-9_]+$/.test(slug)) return "Unable to verify the requested app tools.";
    if (protectedMailTool(slug) && !supportedMailTool(slug)) return UNSUPPORTED_MAIL;
  }
  return null;
}
export function sanitizeGmailFetchData(raw: unknown): { data: Obj; ok: boolean } {
  const data = record(raw);
  if (!data || !Array.isArray(data.messages)) return { ok: false, data: { error: "Email results omitted because their format could not be safely checked." } };
  const messages = data.messages.slice(0, 50).map(safeMessage);
  const nextPageToken = typeof data.nextPageToken === "string" && /^[A-Za-z0-9._-]{1,2048}$/.test(data.nextPageToken) && !sensitiveText(data.nextPageToken) ? data.nextPageToken : undefined;
  return { ok: true, data: { messages, omittedCount: messages.filter(message => message.contentOmitted === true).length, ...(nextPageToken ? { nextPageToken } : {}), ...(typeof data.resultSizeEstimate === "number" ? { resultSizeEstimate: data.resultSizeEstimate } : {}), privacyNotice: "Authentication-related messages and unrecognized fields may be omitted. Results are limited; do not infer that omitted messages contain no follow-ups.", ...(data.messages.length > 50 ? { privacyTruncated: true } : {}) } };
}
export function sanitizeComposioMultiResult(raw: unknown, request: unknown): unknown {
  const root = record(raw), data = record(root?.data);
  if (!root || !data || !Array.isArray(data.results)) return { successful: false, error: "App results were omitted because their format could not be safely checked." };
  const rawTools = record(request)?.tools;
  if (!Array.isArray(rawTools)) return { successful: false, error: "Unable to verify the requested app tools." };
  const requested = new Set(rawTools.map(item => record(item)?.tool_slug).filter((slug): slug is string => typeof slug === "string"));
  let blocked = 0;
  const results = data.results.map((item: unknown) => {
    const result = record(item), slug = result?.tool_slug;
    if (!result || typeof slug !== "string") { blocked++; return { response: { successful: false, error: "Unrecognized app result omitted." } }; }
    if (!requested.has(slug)) { blocked++; return { response: { successful: false, error: "Unexpected app result omitted." } }; }
    if (!protectedMailTool(slug)) return item;
    if (!supportedMailTool(slug)) { blocked++; return { tool_slug: slug, response: { successful: false, error: UNSUPPORTED_MAIL } }; }
    const response = record(result.response);
    if (!response || response.successful !== true) { blocked++; return { tool_slug: slug, response: { successful: false, error: "Email read failed; detailed response omitted." } }; }
    const sanitized = sanitizeGmailFetchData(response.data);
    if (!sanitized.ok) blocked++;
    return { ...(typeof result.index === "number" ? { index: result.index } : {}), tool_slug: slug, response: { successful: sanitized.ok, data: sanitized.data } };
  });
  return { successful: root.successful === true && blocked === 0, ...(root.error ? { error: "The app call reported an error; details omitted." } : {}), data: { results, total_count: typeof data.total_count === "number" ? data.total_count : results.length, error_count: Math.max(typeof data.error_count === "number" ? data.error_count : 0, blocked), success_count: Math.min(typeof data.success_count === "number" ? data.success_count : results.length, results.length - blocked) } };
}
export async function executeProtectedComposio(input: unknown, execute: () => PromiseLike<unknown>, timezone: string | null = null): Promise<unknown> {
  const blocked = validateComposioMailRequest(input) || validateCalendarToolRequest(input, timezone);
  if (blocked) return { successful: false, error: blocked };
  return sanitizeComposioMultiResult(await execute(), input);
}

/** Protect replay of historical assistant text and Composio outputs. Existing
 * saved conversations are not rewritten; explicit user messages are untouched. */
export function protectHistoricalMessages(messages: ModelMessage[]): ModelMessage[] {
  const calls = new Map<string, unknown>();
  for (const message of messages) if (message.role === "assistant" && Array.isArray(message.content)) {
    for (const part of message.content) if (part.type === "tool-call") calls.set(part.toolCallId, part.input);
  }
  return messages.map(message => {
    if (message.role === "assistant") {
      if (typeof message.content === "string") return sensitiveText(message.content) ? {...message, content:"[Previous assistant message omitted because it may contain authentication information.]"} : message;
      return {...message, content: message.content.map(part => part.type === "text" && sensitiveText(part.text) ? {...part, text:"[Previous assistant text omitted because it may contain authentication information.]"} : part)};
    }
    if (message.role !== "tool") return message;
    return {...message, content:message.content.map(part => {
      if (part.type !== "tool-result" || part.toolName !== "COMPOSIO_MULTI_EXECUTE_TOOL") return part;
      const input = calls.get(part.toolCallId);
      const output = part.output;
      const safe = output.type === "json" && input && !validateComposioMailRequest(input)
        ? sanitizeComposioMultiResult(output.value, input)
        : { successful:false, error:"Previous app result omitted because it could not be safely checked." };
      return {...part, output:{type:"json" as const, value:safe as import("@ai-sdk/provider").JSONValue}};
    })};
  });
}
