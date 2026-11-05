import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentKernel } from '#src/platform/db/content-kernel';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { createFormFilePurgeHooks } from '../form-file-purge.js';

test('form and individual purges capture trashed submissions with a workspace-scoped bounded read', async () => {
  const db = openContentDb(':memory:'); const kernel = contentKernel(db);
  const at = '2026-11-04T00:00:00.000Z';
  db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w',at);
  db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,version) VALUES ('f','w','F','f','[]','{}','active',?,?,1)`).run(at,at);
  const data = JSON.stringify({ photo: { mediaId: 'm', filename: 'photo.png', contentType: 'image/png', byteSize: 8 } });
  db.$client.prepare(`INSERT INTO form_submissions (id,workspace_id,form_definition_id,data_json,submitted_at,deleted_at,version) VALUES ('s','w','f',?,?,?,1)`).run(data,at,at);
  for (const entityType of ['form', 'form_submission'] as const) {
    const removed: string[] = []; const scrubbed: string[] = [];
    const hooks = createFormFilePurgeHooks({ kernel, entityType, remove: async ({ mediaId }) => { removed.push(mediaId); }, scrub: async ({ entityId }) => { scrubbed.push(entityId); } });
    const entityId = entityType === 'form' ? 'f' : 's';
    const priorState = await hooks.beforePurge!({ workspaceId: 'w', entityId });
    await hooks.afterPurge!({ workspaceId: 'w', entityId, priorState });
    assert.deepEqual(removed, ['m']); assert.deepEqual(scrubbed, [entityId]);
    assert.deepEqual(await hooks.beforePurge!({ workspaceId: 'other', entityId }), []);
  }
  db.$client.close();
});

test('private source metadata survives the durable media adapter', async () => {
  const { SqlMediaRepo } = await import('#src/platform/db/repos/media-repo');
  const { uploadMedia, InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore } = await import('@jini-ai/cms/media');
  const db = openContentDb(':memory:'); const kernel = contentKernel(db); let id = 0;
  db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w','now');
  const mediaRepo = new SqlMediaRepo(kernel);
  const { media } = await uploadMedia({ deps: { mediaRepo, blobRepo: new InMemoryAssetBlobRepo({}), renditionRepo: new InMemoryAssetRenditionRepo({}), blobStore: new InMemoryBlobStore(), clock: { nowMs: () => 0 }, idGen: { newId: () => `m${++id}` } }, input: { workspaceId: 'w', createdByPrincipal: 'system', filename: 'photo.png', contentType: 'image/png', bytes: Uint8Array.of(137,80,78,71,13,10,26,10), access: 'private' } });
  assert.equal((await mediaRepo.findById({ workspaceId: 'w', id: media.id }))!.source.private, true);
  db.$client.close();
});

test('legacy files are made private before public serving, including submissions already in Trash', async () => {
  const { protectExistingFormFiles } = await import('../protect-existing-files.js');
  const siteDir = await mkdtemp(join(tmpdir(), 'forms-protect-'));
  const db = openContentDb(':memory:'); const kernel = contentKernel(db); const at = '2026-11-04T00:00:00.000Z';
  db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w',at);
  db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,version) VALUES ('f','w','F','f','[]','{}','active',?,?,1)`).run(at,at);
  const dataJson = JSON.stringify({ photo: { mediaId: 'm', filename: 'photo.png', contentType: 'image/png', byteSize: 8 } });
  db.$client.prepare(`INSERT INTO form_submissions (id,workspace_id,form_definition_id,data_json,submitted_at,deleted_at,version) VALUES ('s','w','f',?,?,?,1)`).run(dataJson,at,at);
  await kernel.run(db => db.insertInto('media').values({ id: 'm', workspace_id: 'w', kind: 'media', original_filename: 's-photo.png', title: 'Photo', slug: 'photo', alt: '', caption: '', credit: '', source_sha256: 'hash', source_metadata_json: '{"contentType":"image/png"}', status: 'active', created_at: at, updated_at: at, version: 1, width: null, height: null, css_class: null, html_attributes: null }).execute());
  await protectExistingFormFiles({ kernel, workspaceId: 'w', siteDir });
  const row = await kernel.run(db => db.selectFrom('media').select('source_metadata_json').where('id', '=', 'm').executeTakeFirstOrThrow());
  assert.deepEqual(JSON.parse(row.source_metadata_json!), { contentType: 'image/png', private: true });
  await protectExistingFormFiles({ kernel, workspaceId: 'w', siteDir });
  await rm(siteDir, { recursive: true, force: true });
  db.$client.close();
});

test('protection warns for corrupt or mismatched legacy rows and records completion without refusing boot', async () => {
  const { protectExistingFormFiles } = await import('../protect-existing-files.js');
  const db = openContentDb(':memory:'); const kernel = contentKernel(db);
  const siteDir = await mkdtemp(join(tmpdir(), 'forms-protect-')); const warnings: string[] = [];
  const at = '2026-11-04T00:00:00.000Z';
  try {
    db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w',at);
    db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,version) VALUES ('f','w','F','f','[]','{}','active',?,?,1)`).run(at,at);
    for (const [id, data] of [['bad', '{secret'], ['mismatch', JSON.stringify({ photo: { mediaId: 'm' } })], ['zgood', JSON.stringify({ photo: { mediaId: 'good' } })]]) db.$client.prepare(`INSERT INTO form_submissions (id,workspace_id,form_definition_id,data_json,submitted_at,version) VALUES (?,'w','f',?,?,1)`).run(id,data,at);
    await kernel.run(db => db.insertInto('media').values({ id: 'm', workspace_id: 'w', kind: 'media', original_filename: 'editorial.png', title: 'Photo', slug: 'photo', alt: '', caption: '', credit: '', source_sha256: 'hash', source_metadata_json: '{}', status: 'active', created_at: at, updated_at: at, version: 1, width: null, height: null, css_class: null, html_attributes: null }).execute());
    await kernel.run(db => db.insertInto('media').values({ id: 'good', workspace_id: 'w', kind: 'media', original_filename: 'zgood-photo.png', title: '', slug: 'good', alt: '', caption: '', credit: '', source_sha256: 'good-hash', source_metadata_json: '{}', status: 'active', created_at: at, updated_at: at, version: 1, width: null, height: null, css_class: null, html_attributes: null }).execute());
    await protectExistingFormFiles({ kernel, workspaceId: 'w', siteDir }, { warn: message => { warnings.push(message); } });
    assert.equal(warnings.length, 2); assert.equal(warnings.join(' ').includes('{secret'), false);
    assert.equal(await readFile(join(siteDir, '.form-files-protected-v1'), 'utf8'), 'complete\n');
    const source = await kernel.run(db => db.selectFrom('media').select('source_metadata_json').where('id', '=', 'm').executeTakeFirstOrThrow());
    assert.deepEqual(JSON.parse(source.source_metadata_json!), {});
    const good = await kernel.run(db => db.selectFrom('media').select('source_metadata_json').where('id', '=', 'good').executeTakeFirstOrThrow());
    assert.deepEqual(JSON.parse(good.source_metadata_json!), { private: true });
    await protectExistingFormFiles({ kernel: { run: () => assert.fail('completed protection must not scan rows') } as never, workspaceId: 'w', siteDir });
  } finally { db.$client.close(); await rm(siteDir, { recursive: true, force: true }); }
});

test('unavailable protection storage warns and leaves completion absent for an automatic next-owner-start retry', async () => {
  const { protectExistingFormFiles } = await import('../protect-existing-files.js');
  const siteDir = await mkdtemp(join(tmpdir(), 'forms-protect-')); const warnings: string[] = [];
  try {
    await protectExistingFormFiles({ kernel: { run: async () => { throw new Error('private credentials'); } } as never, workspaceId: 'w', siteDir }, { warn: message => { warnings.push(message); } });
    assert.equal(warnings.length, 1); assert.equal(warnings[0]!.includes('private credentials'), false);
    await assert.rejects(readFile(join(siteDir, '.form-files-protected-v1')));
  } finally { await rm(siteDir, { recursive: true, force: true }); }
});

test('delayed cleanup ownership probes include Trash and stay workspace scoped', async () => {
  const { hasFormFileOwners } = await import('../form-file-purge.js');
  const db = openContentDb(':memory:'); const kernel = contentKernel(db); const at = '2026-11-04T00:00:00.000Z';
  try {
    db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w',at);
    await kernel.run(db => db.insertInto('media').values({ id: 'm', workspace_id: 'w', kind: 'media', original_filename: 's-photo.png', title: '', slug: 'photo', alt: '', caption: '', credit: '', source_sha256: 'shared-hash', source_metadata_json: '{"private":true}', status: 'trashed', created_at: at, updated_at: at, version: 1, width: null, height: null, css_class: null, html_attributes: null }).execute());
    assert.equal(await hasFormFileOwners({ kernel, workspaceId: 'w', sha256: 'shared-hash' }), true);
    assert.equal(await hasFormFileOwners({ kernel, workspaceId: 'other', sha256: 'shared-hash' }), false);
    assert.equal(await hasFormFileOwners({ kernel, workspaceId: 'w', sha256: 'missing' }), false);
  } finally { db.$client.close(); }
});

test('form purge captures the attachment after submission 100 without truncation', async () => {
  const db = openContentDb(':memory:'); const kernel = contentKernel(db); const at = '2026-11-04T00:00:00.000Z';
  try {
    db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w',at);
    db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,version) VALUES ('f','w','F','f','[]','{}','active',?,?,1)`).run(at,at);
    const insert = db.$client.prepare(`INSERT INTO form_submissions (id,workspace_id,form_definition_id,data_json,submitted_at,version) VALUES (?,'w','f',?,?,1)`);
    for (let i = 0; i < 105; i++) insert.run(String(i).padStart(4, '0'), i === 104 ? JSON.stringify({ file: { mediaId: 'last' } }) : '{}', at);
    const removed: string[] = [];
    const hooks = createFormFilePurgeHooks({ kernel, entityType: 'form', remove: async ({ mediaId }) => { removed.push(mediaId); }, scrub: async () => {} });
    const input = { workspaceId: 'w', entityId: 'f' };
    const priorState = await hooks.beforePurge!(input);
    await hooks.afterPurge!({ ...input, priorState }); assert.deepEqual(removed, ['last']);
  } finally { db.$client.close(); }
});

test('transient legacy stamp failures keep the marker absent and retry automatically on the next owner start', async () => {
  const { protectExistingFormFiles } = await import('../protect-existing-files.js');
  const db = openContentDb(':memory:'); const kernel = contentKernel(db); const at = '2026-11-04T00:00:00.000Z';
  const siteDir = await mkdtemp(join(tmpdir(), 'forms-protect-')); const warnings: string[] = [];
  try {
    db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w',at);
    db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,version) VALUES ('f','w','F','f','[]','{}','active',?,?,1)`).run(at,at);
    db.$client.prepare(`INSERT INTO form_submissions (id,workspace_id,form_definition_id,data_json,submitted_at,version) VALUES ('s','w','f',?,?,1)`).run(JSON.stringify({ file: { mediaId: 'm' } }),at);
    await kernel.run(db => db.insertInto('media').values({ id: 'm', workspace_id: 'w', kind: 'media', original_filename: 's-photo.png', title: '', slug: 'photo', alt: '', caption: '', credit: '', source_sha256: 'hash', source_metadata_json: '{}', status: 'active', created_at: at, updated_at: at, version: 1, width: null, height: null, css_class: null, html_attributes: null }).execute());
    const unavailable = new Proxy(kernel, { get: (target, key) => key === 'transaction' ? async () => { throw new Error('transient secret'); } : Reflect.get(target, key) });
    await protectExistingFormFiles({ kernel: unavailable, workspaceId: 'w', siteDir }, { warn: message => { warnings.push(message); } });
    assert.equal(warnings.length, 1); assert.equal(warnings[0]!.includes('transient secret'), false);
    await assert.rejects(readFile(join(siteDir, '.form-files-protected-v1')));
    await protectExistingFormFiles({ kernel, workspaceId: 'w', siteDir });
    assert.equal(await readFile(join(siteDir, '.form-files-protected-v1'), 'utf8'), 'complete\n');
    const protectedRow = await kernel.run(db => db.selectFrom('media').select('source_metadata_json').where('id', '=', 'm').executeTakeFirstOrThrow());
    assert.equal(JSON.parse(protectedRow.source_metadata_json!).private, true);
    await protectExistingFormFiles({ kernel: { run: () => assert.fail('third completed start must not query') } as never, workspaceId: 'w', siteDir });
  } finally { db.$client.close(); await rm(siteDir, { recursive: true, force: true }); }
});
