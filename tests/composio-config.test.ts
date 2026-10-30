import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composioPlatformConfig, composioAuthConfigsFor } from '../lib/server/composio-config';
import { secret } from '../lib/server/secrets';
import { composioUser } from '../lib/server/composio';

test('Composio is product-owned and account identities stay tenant/member scoped', async () => {
  const oldKey=process.env.COMPOSIO_API_KEY, oldMap=process.env.COMPOSIO_AUTH_CONFIGS;
  try {
    process.env.COMPOSIO_API_KEY='fixture-platform-key';
    process.env.COMPOSIO_AUTH_CONFIGS=JSON.stringify({gmail:'ac_fixture'});
    assert.deepEqual(composioPlatformConfig(),{apiKey:'fixture-platform-key',authConfigs:{gmail:'ac_fixture'}});
    process.env.COMPOSIO_AUTH_CONFIGS=JSON.stringify({gmail:'ac_gmail',googlecalendar:'ac_calendar',jira:'ac_jira'});
    assert.deepEqual(composioAuthConfigsFor(['gmail','googlecalendar']),{gmail:'ac_gmail',googlecalendar:'ac_calendar'});
    assert.deepEqual(composioAuthConfigsFor(['gmail']),{gmail:'ac_gmail'});
    assert.deepEqual(composioAuthConfigsFor([]),{});
    assert.equal(await secret('org-a','composio'),'fixture-platform-key');
    assert.equal(await secret('org-b','composio'),'fixture-platform-key');
    assert.notEqual(composioUser('org-a','member'),composioUser('org-b','member'));
    assert.notEqual(composioUser('org-a','member'),composioUser('org-a','another-member'));
    delete process.env.COMPOSIO_API_KEY;
    assert.equal(await secret('org-a','composio'),undefined);
    process.env.COMPOSIO_AUTH_CONFIGS='{"gmail":"invalid-id"}';
    assert.throws(()=>composioPlatformConfig());
  } finally {
    if(oldKey===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=oldKey;
    if(oldMap===undefined)delete process.env.COMPOSIO_AUTH_CONFIGS;else process.env.COMPOSIO_AUTH_CONFIGS=oldMap;
  }
});
