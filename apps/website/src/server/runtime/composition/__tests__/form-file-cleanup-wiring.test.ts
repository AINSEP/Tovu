import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentKernel } from '#src/platform/db/content-kernel';
import { createApp, createRouteDeps } from '../app.js';

for (const owned of [true, false, 'no-database'] as const) {
  test(`delayed form cleanup uses the composed content database and retains owned bytes: ${owned}`, async t => {
    const deps = createRouteDeps();
    const effects: string[] = [];
    if (owned !== 'no-database') deps.contentKernel = { run: async () => {
      effects.push('owner-probe');
      return owned ? { id: 'live-or-restorable-media' } : undefined;
    } } as unknown as ContentKernel;
    t.mock.method(deps.assetBlobRepo, 'findByHash', async () => ({ storageKey: 'blob', status: 'tombstoned' }));
    t.mock.method(deps.blobStore, 'remove', async () => { effects.push('delete-bytes'); });
    t.mock.method(deps.assetBlobRepo, 'remove', async () => { effects.push('remove-blob'); });
    createApp(deps);
    await deps.bus.publish({ id: 'cleanup-job', name: 'form.attachment.cleanup', workspaceId: deps.workspaceId,
      aggregateId: 'media-1', occurredAt: '2026-11-04T00:00:00.000Z',
      payload: { workspaceId: deps.workspaceId, sha256: 'fixture-hash' } });
    assert.deepEqual(effects, owned === 'no-database' ? [] : owned ? ['owner-probe'] : ['owner-probe', 'delete-bytes', 'remove-blob']);
  });
}
