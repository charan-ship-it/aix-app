import type { AgentConfig } from './agent-config';

/** Empty restrictions mean all tools at runtime, so remove an app when its last tool is removed. */
export function setBuilderAppTool(draft: AgentConfig, app: string, tool: string, enabled: boolean): Pick<AgentConfig, 'toolkits' | 'toolPermissions'> {
  const selected = draft.toolPermissions[app] || [];
  const next = enabled ? [...new Set([...selected, tool])] : selected.filter(value => value !== tool);
  const permissions = { ...draft.toolPermissions };
  if (next.length) permissions[app] = next; else delete permissions[app];
  return { toolPermissions: permissions, toolkits: next.length ? [...new Set([...draft.toolkits, app])] : draft.toolkits.filter(value => value !== app) };
}
