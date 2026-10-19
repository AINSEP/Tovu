/** Library L1 step 3: RED originally: pack/apply accepted documents as ordinary public media. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadMedia } from '@jini-ai/cms/media';
import { InMemoryChangeSetRepo } from '#src/contracts/core/commands/index';
import { InMemoryOutbox } from '#src/contracts/core/events/index';
import type { PackedEntity } from '#src/features/publish-content/type-registry';
import { contributeMediaPublish } from '../publish-content.js';
import { duplicateMediaAsset } from '../duplicate-asset.js';
import { libraryFixture } from './library.fixture.js';

test('Library documents and their blobs are absent from publish output; forged apply and public duplication fail', async () => {
  const { deps } = libraryFixture();
  const { media: doc } = await uploadMedia({ deps: { ...deps, blobRepo: deps.assetBlobRepo, renditionRepo: deps.assetRenditionRepo },
    input: { workspaceId: deps.workspaceId, kind: 'document', filename: 'private.md', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), contentType: 'text/markdown', createdByPrincipal: 'owner' } });
  const outbox = new InMemoryOutbox();
  const handler = contributeMediaPublish().build({ workspaceId: deps.workspaceId, clock: deps.clock, idGen: deps.idGen,
    authorize: deps.authorize, outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox),
    ports: { media: { repo: deps.mediaRepo, assetBlobRepo: deps.assetBlobRepo, blobStore: deps.blobStore, contentTypeStore: deps.mediaContentTypeStore } } });
  const packed = []; for await (const row of handler.pack()) packed.push(row);
  assert.deepEqual(packed, []);
  let reads = 0; deps.blobStore.get = async () => { reads++; throw new Error('private bytes must not be fetched'); };
  const entity: PackedEntity = { entityType: 'media', id: doc.id, schemaVersion: 1, contentHash: 'forged', hashVersion: 1,
    requiredBlobs: [doc.source.sha256], state: { ...doc } };
  assert.match((await handler.precheck(entity))!, /documents cannot be published/i);
  await assert.rejects(handler.apply({ entity, expectedVersion: doc.version, principalId: 'owner', idempotencyKey: 'private-apply' }));
  // Removing the discriminant cannot turn a destination document into public media either.
  const forged = { ...entity, state: { ...entity.state, kind: 'media' } };
  assert.match((await handler.precheck(forged))!, /documents cannot be published/i);
  await assert.rejects(handler.apply({ entity: forged, expectedVersion: doc.version, principalId: 'owner', idempotencyKey: 'private-downgrade' }));
  const disguised = { ...forged, id: 'new-public-id', state: { ...forged.state, id: 'new-public-id', slug: 'new-public-id' } };
  assert.match((await handler.precheck(disguised))!, /documents cannot be published/i);
  await assert.rejects(handler.apply({ entity: disguised, expectedVersion: undefined, principalId: 'owner', idempotencyKey: 'private-new-id' }));
  await assert.rejects(duplicateMediaAsset(deps, { principalId: 'owner', id: doc.id, overrides: {} }));
  assert.equal(reads, 0);
  const remaining = await deps.mediaRepo.list({ workspaceId: deps.workspaceId });
  assert.equal(remaining.length, 1); assert.equal(remaining[0]!.kind, 'document');
});
