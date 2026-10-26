import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { InMemoryVersionedMediaRepo, InMemoryMediaContentTypeStore } from '../index.js';
import { InMemoryBlobStore, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryTransformDefinitionRepo, InMemoryImageTransformer } from '@jini-ai/cms/media';
import type { MediaRouteDeps } from '#src/server/inbound/admin-http/routes/media/deps';
import type { ToolExecutionContext } from '@jini-ai/core';

/** Isolated real memory adapters; authorization can be changed without rebuilding handlers. */
export function libraryFixture() {
  let id = 0; let denied = false;
  const mediaRepo = new InMemoryVersionedMediaRepo();
  const deps: MediaRouteDeps = {
    tracker: createNoopTracker({}),
    workspaceId: 'site-a', authorize: async () => ({ allowed: !denied, reason: denied ? 'denied' : 'matched' }),
    clock: { nowMs: () => Date.parse('2026-10-18T00:00:00Z'), nowIso: () => '2026-10-18T00:00:00.000Z' }, idGen: { newId: () => `id-${++id}` },
    mediaRepo, assetBlobRepo: new InMemoryAssetBlobRepo({}), assetRenditionRepo: new InMemoryAssetRenditionRepo({}), blobStore: new InMemoryBlobStore(),
    mediaContentTypeStore: new InMemoryMediaContentTypeStore(), transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}), imageTransformer: new InMemoryImageTransformer(),
    removeMedia: async input => {
      const row = await mediaRepo.findById({ workspaceId: input.workspaceId, id: input.id });
      if (!row) return { ok: false, reason: 'not-found' };
      const result = await mediaRepo.saveIfVersion({ record: { ...row, status: 'trashed', version: row.version + 1 }, ifVersion: input.expectedVersion ?? row.version });
      return result.applied ? { ok: true, version: row.version + 1 } : { ok: false, reason: 'version-changed' };
    },
    forgetRemovedMedia: async () => {},
  };
  return { deps, deny: () => { denied = true; } };
}
export function libraryContext(input: Record<string, unknown> = {}, runId = 'run-a'): ToolExecutionContext {
  return { input, executionId: 'exec', run: { id: runId }, principal: { id: 'owner' }, signal: new AbortController().signal };
}
