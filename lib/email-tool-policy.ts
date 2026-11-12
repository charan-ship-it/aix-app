/** Only this Composio email tool has an audited output filter at present. */
export function protectedMailTool(slug: string) { return /^(?:GMAIL|OUTLOOK)_/.test(slug); }
export function supportedMailTool(slug: string) { return slug === "GMAIL_FETCH_EMAILS"; }
export const UNSUPPORTED_MAIL = "This email tool is temporarily unavailable while its privacy handling is being verified. Gmail Fetch emails is supported.";
