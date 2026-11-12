import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgent } from '../lib/agent-config';
import { setBuilderAppTool } from '../lib/builder-app-scope';
const base = normalizeAgent({ id: 'scope-test', name: 'Scope test', description: '', instructions: 'Respond only to the supplied request.', model: 'test-model', provider: 'openai', category: 'General', icon: 'sparkles', color: 'orange', tools: [], toolkits: [], knowledgeScope: 'none' });
test('app selection remains limited to explicit tools and last removal removes app access', () => {
  const one = setBuilderAppTool(base, 'gmail', 'GMAIL_FETCH_EMAILS', true);
  assert.deepEqual(one.toolkits, ['gmail']);
  assert.deepEqual(one.toolPermissions, { gmail: ['GMAIL_FETCH_EMAILS'] });
  const two = setBuilderAppTool({ ...base, ...one }, 'gmail', 'GMAIL_SEARCH_EMAILS', true);
  assert.deepEqual(two.toolPermissions.gmail, ['GMAIL_FETCH_EMAILS', 'GMAIL_SEARCH_EMAILS']);
  const last = setBuilderAppTool({ ...base, ...two }, 'gmail', 'GMAIL_FETCH_EMAILS', false);
  assert.deepEqual(last.toolPermissions.gmail, ['GMAIL_SEARCH_EMAILS']);
  const none = setBuilderAppTool({ ...base, ...last }, 'gmail', 'GMAIL_SEARCH_EMAILS', false);
  assert.deepEqual(none.toolkits, []);
  assert.deepEqual(none.toolPermissions, {});
  assert.deepEqual(base.toolkits, []);
});
