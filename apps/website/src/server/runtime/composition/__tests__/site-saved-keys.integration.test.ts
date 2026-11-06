import assert from 'node:assert/strict';
import test from 'node:test';
import { composeSiteSavedKeys } from '../site-portability.js';

/** Composition must not expose the old owner capture callback or open recipient databases. */
test('production saved-key composition cannot capture owner keys or restore inherited access', async () => {
  const keys = composeSiteSavedKeys({ workspaceId: 'source', sealer: {} as never });
  await assert.rejects(keys.capture({ snapshot: Buffer.alloc(0), shareId: 'share', workspaceId: 'source' }), /no longer include saved keys/);
  const result = await keys.restore({ siteId: 'new-site', dir: '/tmp/unopened-site', dbPath: '/tmp/unopened-content.db', encryptedKeys: Buffer.from('old-bundle'), password: 'fixture' });
  assert.match(result.notices.join(), /approve fresh access/);
});
