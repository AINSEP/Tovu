import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteSavedKeys } from '../saved-keys.js';

/** The optional transport is retired by P25. No legacy envelope can authorize a new site. */
function fixture() {
  let reads = 0;
  const keys = createSiteSavedKeys({ workspaceId: 'source',
    openSnapshot: async () => { reads++; assert.fail('capture must not read site keys'); },
    captureProject: async () => { reads++; assert.fail('capture must not read owner keys'); },
    openRecipient: async () => { reads++; assert.fail('import must not persist keys or grants'); },
  } as never);
  return { keys, reads: () => reads };
}

test('capture is refused even when source and project keys are available', async () => {
  const f = fixture();
  await assert.rejects(f.keys.capture({ workspaceId: 'source', shareId: 'share', snapshot: Buffer.alloc(0) }), /no longer include saved keys/);
  assert.equal(f.reads(), 0);
});

for (const password of [undefined, 'correct-legacy-password', 'wrong-password']) {
  test(`historical key bundles require fresh site approval (password supplied: ${password !== undefined})`, async () => {
    const f = fixture();
    const response = await f.keys.restore({ siteId: 'new-site', dir: '/tmp/unopened-site', dbPath: '/tmp/unopened-content.db',
      encryptedKeys: Buffer.from('historical-encrypted-payload'), password });
    assert.match(response.notices.join(), /approve fresh access/);
    assert.equal(f.reads(), 0);
    assert.equal(JSON.stringify(response).includes('legacy-password'), false);
  });
}

test('cancelled import is refused before any recipient resource opens', async () => {
  const f = fixture(), abort = new AbortController(); abort.abort();
  await assert.rejects(f.keys.restore({ siteId: 'new', dir: '/tmp/unused', dbPath: '/tmp/unused.db', encryptedKeys: Buffer.alloc(0) }, { signal: abort.signal }));
  assert.equal(f.reads(), 0);
});
