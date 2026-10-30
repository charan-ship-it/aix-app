export const integrationScenarios: Record<
  string,
  { title: string; query: string }
> = {
  outlook: { title: "Find recent messages", query: "List recent Outlook messages without modifying them" },
  linear: { title: "Find issues", query: "List Linear issues without changing them" },
  jira: { title: "Find tickets", query: "Search Jira tickets without changing them" },
  zoho: { title: "Find CRM records", query: "Search Zoho CRM records without modifying them" },
  gmail: {
    title: "Find recent messages",
    query: "Find recent email messages in my inbox without modifying them",
  },
  googledrive: {
    title: "Find a document",
    query: "Search my Google Drive files by name without changing files",
  },
  googlecalendar: {
    title: "Check upcoming events",
    query: "List upcoming calendar events without creating or changing events",
  },
  slack: {
    title: "Find a conversation",
    query: "Search Slack messages without sending messages",
  },
  notion: {
    title: "Find a workspace page",
    query: "Search Notion pages without changing content",
  },
  github: {
    title: "Read repository issues",
    query: "List issues in a GitHub repository without modifying them",
  },
  salesforce: {
    title: "Find CRM records",
    query: "Search Salesforce account records without updating them",
  },
  hubspot: {
    title: "Find contacts",
    query: "Search HubSpot contacts without modifying records",
  },
};
export type IntegrationTool = {
  slug: string;
  name: string;
  description?: string;
  inputParameters?: Record<string, unknown>;
  tags?: string[];
};
export type IntegrationTestResult = {
  id: string;
  toolkit: string;
  tool: string;
  status: "running" | "passed" | "failed";
  startedAt: string;
  finishedAt?: string;
  output?: unknown;
  error?: string;
};
