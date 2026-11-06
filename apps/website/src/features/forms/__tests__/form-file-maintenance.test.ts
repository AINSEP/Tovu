import assert from 'node:assert/strict';
import test from 'node:test';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { contentKernel } from '#src/platform/db/content-kernel';
import { SqlMediaRepo, SqlAssetBlobRepo, SqlAssetRenditionRepo } from '#src/platform/db/repos/media-repo';
import { SqlEntryRefsRepo } from '#src/platform/db/repos/entry-refs-repo';
import { SqlOutboxAdapter } from '#src/platform/db/repos/outbox-repo';
import { SqlitePostRepo } from '#src/features/post/repo.sqlite';
import { InMemoryBlobStore } from '@jini-ai/cms/media';
import { scheduleFormAttachmentCleanup } from '@jini-ai/cms/forms';
import { runFormFileMaintenance } from '../form-file-maintenance.js';

const at = '2026-11-04T00:00:00.000Z';
async function fixture(dbPath = ':memory:') {
  const db = openContentDb(dbPath); const kernel = contentKernel(db);
  db.$client.prepare('INSERT OR IGNORE INTO workspaces (id,name,slug,created_at) VALUES (?,?,?,?)').run('w','w','w',at);
  const mediaRepo = new SqlMediaRepo(kernel), blobRepo = new SqlAssetBlobRepo(kernel), renditionRepo = new SqlAssetRenditionRepo(kernel);
  const outbox = new SqlOutboxAdapter(kernel), clock = { nowMs: () => Date.parse(at) };
  const media = { mediaRepo, blobRepo, renditionRepo, blobStore: new InMemoryBlobStore(), clock, entryRefsRepo: new SqlEntryRefsRepo(kernel), postRepo: new SqlitePostRepo(kernel) };
  await mediaRepo.save({ id: 'm', workspaceId: 'w', slug: 'photo', originalFilename: 's-photo.png', title: '', alt: '', caption: '', credit: '', source: { sha256: 'hash' }, status: 'active', createdAt: at, updatedAt: at, version: 1, width: null, height: null, cssClass: null, htmlAttributes: null });
  const prove = () => scheduleFormAttachmentCleanup({ outbox, workspaceId: 'w', mediaId: 'm', sha256: 'hash', now: clock.nowMs(), graceMs: 1000 });
  return { db, kernel, media, outbox, clock, prove, workspaceId: 'w' };
}
test('maintenance is preview-only by default; filename-only and absent-submission evidence keeps files', async () => {
  const f = await fixture();
  try {
    assert.equal((await runFormFileMaintenance(f)).results[0]!.reason, 'missing-evidence');
    assert.equal((await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!.source.private, undefined);
    await f.prove();
    assert.equal((await runFormFileMaintenance(f)).results[0]!.outcome, 'eligible');
    assert.ok(await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }));
    assert.equal((await runFormFileMaintenance({ ...f, workspaceId: 'other' })).results.length, 0);
  } finally { f.db.$client.close(); }
});
test('proven terminal orphan goes private then through existing Trash and durable cleanup', async () => {
  const f = await fixture();
  try {
    await f.prove();
    await f.media.renditionRepo.save({ id: 'r', workspaceId: 'w', assetId: 'm', transformName: 'thumb', version: 1, storageKey: 'w/rendition', createdAt: at });
    const result = await runFormFileMaintenance(f, { apply: true });
    assert.deepEqual(result.results, [{ mediaId: 'm', outcome: 'queued', reason: 'proven-orphan' }]);
    assert.equal(await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }), null);
    const queued = await f.kernel.run(db => db.selectFrom('outbox_events').selectAll().where('id', '=', 'forms:file:cleanup:w:m').executeTakeFirstOrThrow());
    assert.equal(queued.status, 'pending'); assert.equal(JSON.parse(queued.event_json).payload.sha256, 'hash');
    const journal = await f.kernel.run(db => db.selectFrom('outbox_events').selectAll().where('id', '=', `forms:file:cleanup:w:m:maintenance:${f.clock.nowMs()}`).executeTakeFirstOrThrow());
    assert.deepEqual(JSON.parse(journal.event_json).payload.storageKeys, ['w/rendition']);
    assert.equal(Date.parse(journal.next_attempt_at), f.clock.nowMs() + 30 * 24 * 60 * 60 * 1000);
  } finally { f.db.$client.close(); }
});
test('Trash submissions and shared-hash editorial owners prevent private or destructive writes', async () => {
  for (const owner of ['submission', 'media'] as const) {
    const f = await fixture();
    try {
      await f.prove();
      if (owner === 'submission') {
        f.db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,version) VALUES ('f','w','F','f','[]','{}','active',?,?,1)`).run(at,at);
        f.db.$client.prepare(`INSERT INTO form_submissions (id,workspace_id,form_definition_id,data_json,submitted_at,deleted_at,version) VALUES ('s','w','f',?,?,?,1)`).run(JSON.stringify({ photo: { mediaId: 'm' } }),at,at);
      } else {
        const asset = (await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!;
        await f.media.mediaRepo.save({ ...asset, id: 'shared', slug: 'shared', status: 'trashed' });
      }
      assert.equal((await runFormFileMaintenance(f, { apply: true })).results.find(row => row.mediaId === 'm')!.reason, 'owned');
      assert.equal((await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!.source.private, undefined);
    } finally { f.db.$client.close(); }
  }
});
test('retained revisions keep a candidate', async () => {
  const f = await fixture();
  try {
    await f.prove();
    f.db.$client.prepare(`INSERT INTO post_revisions (id,post_id,workspace_id,seq,op,state_json,content_hash,actor_id,recorded_at) VALUES ('r','old','w',1,'save',?,'h','owner',?)`).run(JSON.stringify({ bodyHtml: '<img src="/m/photo/full/">' }),at);
    assert.equal((await runFormFileMaintenance(f, { apply: true })).results[0]!.reason, 'owned');
    assert.ok(await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }));
  } finally { f.db.$client.close(); }
});
test('cleanup failure leaves a proven orphan private and reports it for a later explicit retry', async () => {
  const f = await fixture();
  try {
    await f.prove();
    const media = { ...f.media, renditionRepo: { ...f.media.renditionRepo, listByAsset: f.media.renditionRepo.listByAsset.bind(f.media.renditionRepo), removeByAsset: async () => { throw new Error('secret'); } } } as typeof f.media;
    const result = await runFormFileMaintenance({ ...f, media }, { apply: true });
    assert.equal(result.results[0]!.reason, 'cleanup-failed');
    assert.equal((await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!.source.private, true);
  } finally { f.db.$client.close(); }
});


test('HTML forms in Trash, menu content and staged publish bundles retain matching media', async () => {
  for (const owner of ['form', 'menu', 'bundle', 'defaults', 'post'] as const) {
    const f = await fixture();
    try {
      await f.prove();
      if (owner === 'form') f.db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,deleted_at,version) VALUES ('f','w','F','f',?,'{}','active',?,?,?,1)`).run(JSON.stringify({ format: 'html', html: '<img src="/m/photo/full/">' }),at,at,at);
      if (owner === 'post') f.db.$client.prepare(`INSERT INTO posts (id,workspace_id,title,slug,status,updated_at,version,body_format,body_html) VALUES ('post','w','P','p','draft',?,1,'html',?)`).run(at,'<img src="/m/photo/full/">');
      if (owner === 'menu') f.db.$client.prepare(`INSERT INTO menus (id,workspace_id,slug,title,status,doc_json,locations_json,updated_at,version) VALUES ('menu','w','menu','Menu','draft',?,'[]',?,1)`).run(JSON.stringify({ href: '/m/photo/full/' }),at);
      if (owner === 'bundle') f.db.$client.prepare(`INSERT INTO publish_content_bundles (id,workspace_id,source_principal_id,hash_version,entities_json,blob_manifest_json,size_bytes,received_at,expires_at) VALUES ('bundle','w','owner',1,'[]',?,1,?,?)`).run(JSON.stringify([{ sha256: 'hash' }]),at,at);
      if (owner === 'defaults') f.db.$client.prepare(`INSERT INTO setting_definitions (setting_id,workspace_id,namespace,key,owner_kind,schema_json,default_json,scopes,status,created_at,updated_at) VALUES ('definition','w','test','image','core','{}',?,1,'active',?,?)`).run(JSON.stringify({ assetId: 'm' }),at,at);
      const result = await runFormFileMaintenance(f, { apply: true });
      assert.equal(result.results[0]!.reason, 'owned', owner);
      assert.equal((await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!.source.private, undefined, owner);
    } finally { f.db.$client.close(); }
  }
});
test('corrupt stored answers and mismatched terminal proof retain the public candidate', async () => {
  for (const broken of ['answers', 'proof'] as const) {
    const f = await fixture();
    try {
      await f.prove();
      if (broken === 'answers') {
        f.db.$client.prepare(`INSERT INTO form_definitions (id,workspace_id,name,slug,fields_json,notify_json,status,created_at,updated_at,version) VALUES ('f','w','F','f','[]','{}','active',?,?,1)`).run(at,at);
        f.db.$client.prepare(`INSERT INTO form_submissions (id,workspace_id,form_definition_id,data_json,submitted_at,version) VALUES ('s','w','f','{secret',?,1)`).run(at);
      } else {
        const row = f.db.$client.prepare('SELECT event_json FROM outbox_events').get() as { event_json: string };
        const event = JSON.parse(row.event_json); event.payload.sha256 = 'wrong';
        f.db.$client.prepare('UPDATE outbox_events SET event_json=?').run(JSON.stringify(event));
      }
      const result = await runFormFileMaintenance(f, { apply: true });
      assert.equal(result.results[0]!.reason, broken === 'answers' ? 'inspection-failed' : 'unknown');
      assert.equal((await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!.source.private, undefined);
    } finally { f.db.$client.close(); }
  }
});
test('command parses explicit apply/cursor and previews an existing SQLite file without migrations or row writes', async () => {
  const { parseFormsMaintenanceArgs, runFormsMaintenanceCommand } = await import('../../../../../../scripts/forms-maintenance.js');
  const { mkdtemp, rm, stat } = await import('node:fs/promises');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  assert.equal(parseFormsMaintenanceArgs({ argv: ['--help'] }).help, true);
  assert.throws(() => parseFormsMaintenanceArgs({ argv: [] }), /--database/);
  assert.throws(() => parseFormsMaintenanceArgs({ argv: ['--other'] }));
  assert.deepEqual(parseFormsMaintenanceArgs({ argv: ['--database','content.db','--workspace','w','--after','m','--apply'] }), { database: 'content.db', workspace: 'w', after: 'm', apply: true, help: false });
  const dir = await mkdtemp(join(tmpdir(), 'forms-maintenance-')); const database = join(dir, 'content.db');
  const f = await fixture(database); await f.prove();
  const before = f.db.$client.prepare('SELECT source_metadata_json FROM media').get(); f.db.$client.close();
  try {
    const preview = await runFormsMaintenanceCommand({ database, workspace: 'w' });
    assert.equal(preview.results[0]!.outcome, 'eligible');
    const inspect = openContentDb(database);
    assert.deepEqual(inspect.$client.prepare('SELECT source_metadata_json FROM media').get(), before); inspect.$client.close();
    await assert.rejects(runFormsMaintenanceCommand({ database, workspace: 'other' }), /absent/);
    await assert.rejects(runFormsMaintenanceCommand({ database: join(dir, 'absent.db'), workspace: 'w' }));
    await assert.rejects(stat(join(dir, 'absent.db')));
    const applied = await runFormsMaintenanceCommand({ database, workspace: 'w', apply: true });
    assert.equal(applied.results[0]!.outcome, 'queued');
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('candidate pages resume after 100 without truncating later media or crossing workspaces', async () => {
  const f = await fixture();
  try {
    const base = (await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!;
    for (let i = 0; i < 105; i++) await f.media.mediaRepo.save({ ...base, id: `n${String(i).padStart(3,'0')}`, slug: `n${i}`, source: { sha256: `sha${i}` } });
    const first = await runFormFileMaintenance(f);
    assert.equal(first.results.length, 100); assert.equal(first.nextAfter, 'n098');
    const second = await runFormFileMaintenance(f, { after: first.nextAfter });
    assert.equal(second.results.length, 6); assert.equal(second.results.at(-1)!.mediaId, 'n104');
    assert.equal(second.nextAfter, undefined);
    assert.equal(new Set([...first.results, ...second.results].map(row => row.mediaId)).size, 106);
  } finally { f.db.$client.close(); }
});


test('ownership is rechecked before both privacy writes and purge when a new shared owner arrives', async () => {
  for (const arriveOnTransaction of [1, 2]) {
    const f = await fixture(); let transactions = 0;
    try {
      await f.prove();
      const kernel = new Proxy(f.kernel, { get(target, key) {
        if (key === 'transaction') return async (work: () => Promise<unknown>) => {
          transactions++;
          // Commit the new owner before entering the next maintenance transaction.
          if (transactions === arriveOnTransaction) {
            const row = (await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!;
            await f.media.mediaRepo.save({ ...row, id: 'new-owner', slug: 'new-owner' });
          }
          return target.transaction(work);
        };
        const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
      } });
      const result = await runFormFileMaintenance({ ...f, kernel }, { apply: true });
      assert.equal(result.results[0]!.reason, arriveOnTransaction === 1 ? 'protection-failed' : 'cleanup-failed');
      const kept = (await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!;
      assert.equal(kept.status, 'active');
      assert.equal(kept.source.private, arriveOnTransaction === 1 ? undefined : true);
      assert.ok(await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'new-owner' }));
    } finally { f.db.$client.close(); }
  }
});
test('retained form-delivery snapshots and opaque restore points keep files without fabricating ownership', async () => {
  for (const owner of ['delivery', 'snapshot'] as const) {
    const f = await fixture();
    try {
      await f.prove();
      if (owner === 'delivery') {
        f.db.$client.prepare(`INSERT INTO outbox_events (id,workspace_id,event_json,status,attempts,next_attempt_at,created_at) VALUES ('delivery','w',?,'pending',0,?,?)`).run(JSON.stringify({ snapshot: { file: { mediaId: 'm' } } }),at,at);
        f.db.$client.prepare(`INSERT INTO form_delivery_jobs (job_id,workspace_id,submission_id,binding_id,adapter_id) VALUES ('delivery','w','old','notify','smtp')`).run();
      } else {
        f.db.$client.prepare(`INSERT INTO publish_content_runs (id,workspace_id,direction,peer_principal_id,phase,restore_point_id,actor_id,started_at) VALUES ('run','w','pull','owner','complete','unknown-snapshot','owner',?)`).run(at);
      }
      assert.equal((await runFormFileMaintenance(f, { apply: true })).results[0]!.reason, owner === 'delivery' ? 'owned' : 'unknown');
      assert.equal((await f.media.mediaRepo.findById({ workspaceId: 'w', id: 'm' }))!.source.private, undefined);
    } finally { f.db.$client.close(); }
  }
});
