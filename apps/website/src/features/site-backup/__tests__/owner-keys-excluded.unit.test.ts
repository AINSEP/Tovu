import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteSavedKeys } from '../saved-keys.js';

test('retired saved-key capture refuses before touching owner or site storage', async () => {
  let reads = 0;
  const keys = createSiteSavedKeys({ workspaceId: 'workspace-local',
    openSnapshot: async () => { reads++; throw new Error('must not open'); },
    captureProject: async () => { reads++; throw new Error('must not open'); },
  } as never);
  await assert.rejects(keys.capture({ snapshot: Buffer.alloc(0), shareId: 'share', workspaceId: 'workspace-local' }), /no longer include saved keys/);
  assert.equal(reads, 0);
});

