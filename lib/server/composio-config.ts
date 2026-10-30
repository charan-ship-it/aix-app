import { z } from 'zod';

// Product-owned configuration. Never expose the project credential to clients.
const authConfigMap = z.record(z.string().regex(/^[a-z0-9_]+$/), z.string().regex(/^ac_[A-Za-z0-9_-]+$/));
export function composioPlatformConfig() {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim();
  const authConfigs = authConfigMap.parse(JSON.parse(process.env.COMPOSIO_AUTH_CONFIGS?.trim() || '{}'));
  return { apiKey, authConfigs };
}

export function composioAuthConfigsFor(toolkits: readonly string[]) {
  const enabled = new Set(toolkits);
  return Object.fromEntries(Object.entries(composioPlatformConfig().authConfigs).filter(([slug]) => enabled.has(slug)));
}
