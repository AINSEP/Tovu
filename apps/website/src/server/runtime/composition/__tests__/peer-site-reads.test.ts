import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { sql } from 'kysely';
import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from '@jini-ai/core';
import { openSqliteFileKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { CONTENT_MIGRATIONS } from '#src/platform/db/migrations/index';
import { LEDGER_TABLE } from '#src/platform/db/migrations/runner';
import { SqlitePresentationSettingsRepo } from '#src/features/presentation/index';
import { planFormDeliveries } from '@jini-ai/cms/forms';
import { SqlFormDeliveryRepo } from '#src/platform/db/repos/form-delivery-repo';
import { buildAssistantToolRegistrations } from '#src/assistant/tool-registrations';
import { CrossSiteUnavailable, createPeerSiteReads } from '../peer-site-reads.js';
import { peerFixture } from './peer-site-reads.fixture.js';
import { invokeRegisteredTool } from '../../../../assistant/__tests__/fixtures/execute-registered-tool.js';

const context = (input: unknown = {}): ToolExecutionContext => ({
  executionId: 'execution', principal: { id: 'active-owner' }, run: { id: 'run' }, input, signal: new AbortController().signal,
});

/** Small raw registration for resolver resource tests; the real catalog is exercised separately. */
const inspection = (handler: ToolRegistration['handler']): ToolRegistration[] => [{
  descriptor: { id: 'inspect', readOnly: true, inputSchema: { type: 'object', properties: {} } },
  policy: { authorize: () => 'allow' }, handler,
}];

for (const placement of ['inSite', 'appData'] as const) test(`${placement}: reads B's posts/media/forms and owner chats through the real catalog; audits only A`, async t => {
  const f = await peerFixture(t, placement);
  // A distinct first theme catches a missing preference; matching ids on A catch a leaked roster.
  for (const site of [f.a, f.b]) {
    for (const id of ['decoy', 'selected']) {
      const dir = path.join(site.dir, 'themes', 'static', id);
      fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'theme.json'), JSON.stringify({ id, name: id, version: '1.0.0', tier: 'declarative', engine: 1 }));
      fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify({ '--ink': site.name === 'B' && id === 'selected' ? '#123456' : '#ff0000' }));
      fs.writeFileSync(path.join(dir, 'styles.css'), 'body{margin:0}');
      for (const template of ['home', 'entry']) fs.writeFileSync(path.join(dir, 'templates', `${template}.json`), '{"type":"doc","content":[]}');
    }
    await new SqlitePresentationSettingsRepo(site.kernel).save({ workspaceId: site.workspaceId,
      activeThemeId: site.name === 'B' ? 'selected' : 'decoy', updatedAt: site.clock.nowIso() });
  }
  const files = [f.b.paths.contentDbPath, f.b.paths.chatDbPath, f.b.journalPath];
  const before = files.map(file => ({ bytes: fs.readFileSync(file), mtime: fs.statSync(file).mtimeMs }));
  for (const [id, input, text] of [
    ['content_post_list', { kind: 'post' }, 'B post'],
    ['media_list_assets', {}, 'B media'],
    ['forms_list_definitions', {}, 'B form'],
  ] as const) {
    const result = JSON.stringify(await f.call(id, { ...input, site: 'B' }));
    assert.ok(result.includes(text), `${id}: B data`);
    assert.ok(!result.includes(text.replace('B ', 'A ')), `${id}: no A data`);
  }
  const chats = await f.call('assistant_chats_list', { site: 'B' }) as { chats: Array<{ id: string }> };
  assert.deepEqual(chats.chats.map(chat => chat.id), ['owner-chat']);
  const chat = await f.call('assistant_chat_read', { site: 'B', chatId: 'owner-chat' }) as { messages: Array<{ content: string }> };
  assert.equal(chat.messages[0]!.content, 'B owner-chat');
  const html = await f.call('pages_read_html', { site: 'B', id: 'page' }) as { html: string; theme: unknown };
  assert.match(html.html, /B page/);
  assert.deepEqual(html.theme, { id: 'selected', tokens: { '--ink': '#123456' }, tokensLight: {} });
  const image = await f.call('media_view_image', { site: 'B', mediaId: 'media' }) as { content: Array<{ type: string; data?: string }> };
  const block = image.content.find(block => block.type === 'image'); assert.ok(block?.data);
  const pixels = await sharp(Buffer.from(block.data, 'base64')).removeAlpha().raw().toBuffer();
  assert.ok(pixels[2]! > 180 && pixels[0]! < 70, 'B blue pixels, not A red pixels');
  for (const chatId of ['staff-chat', 'foreign-chat', 'missing']) {
    await assert.rejects(f.call('assistant_chat_read', { site: 'B', chatId }), /Chat is unavailable to this caller/);
  }
  assert.equal(f.a.db.$client.open, true);
  assert.equal(f.audits.length, 10, 'one active-site audit row per successful peer resolution, including domain refusals');
  for (const event of f.audits) {
    assert.equal(event.detail, 'cross-site read: B (B)');
    assert.equal(event.workspaceId, f.a.workspaceId);
    assert.equal(event.principalId, f.a.ownerId);
  }
  assert.equal((f.a.db.$client.prepare('SELECT COUNT(*) AS n FROM agent_tool_attempts WHERE detail = ?').get('cross-site read: B (B)') as { n: number }).n, 10);
  assert.equal((f.b.db.$client.prepare('SELECT COUNT(*) AS n FROM agent_tool_attempts').get() as { n: number }).n, 0);
  await f.peer.close();
  files.forEach((file, index) => {
    assert.deepEqual(fs.readFileSync(file), before[index]!.bytes, `${path.basename(file)} byte-identical`);
    assert.equal(fs.statSync(file).mtimeMs, before[index]!.mtime);
  });
});

test('foreign-site writes never reach a handler; the current registry name is stripped and runs on A', async t => {
  const f = await peerFixture(t);
  let calls = 0;
  const post = f.contributions.contributors.list({}).find(slice => slice.domain === 'post')!;
  f.contributions.contributors.register({ contribution: { ...post, build: (deps, surfaces) => post.build(deps, surfaces).map(registration =>
    registration.descriptor.id !== 'content_post_create' ? registration : { ...registration, handler: async ctx => { calls++; assert.equal(Object.hasOwn(ctx.input as object, 'site'), false); return deps.workspaceId; } }) } });
  await assert.rejects(f.call('content_post_create', { site: 'B', title: 'No' }), { message: 'Writes run only on the active site. Switch with sites_switch_site first.' });
  assert.equal(calls, 0);
  assert.equal(await f.call('content_post_create', { site: 'A', title: 'Yes' }), f.a.workspaceId);
  assert.equal(calls, 1);
  assert.equal(f.audits.length, 0);
});

test("forms_delivery_status on B reads only B's delivery rows, never A's, and never answers (security pin)", async t => {
  const f = await peerFixture(t);
  // Both sites hold a plan for the SAME submission id: a fallback to A's kernel or workspace would surface A's binding.
  for (const site of [f.a, f.b]) {
    await planFormDeliveries({ workspaceId: site.workspaceId, submissionId: 's1', formId: 'form', deps: {
      plans: new SqlFormDeliveryRepo({ kernel: site.kernel }),
      bindings: async () => [{ bindingId: `${site.name}-binding`, adapterId: 'adapter', connectionRef: 'conn', enabled: true, config: {} }],
      snapshot: async () => ({ form: { slug: 'form', fields: [{ name: 'email', required: true }] },
        submission: { id: 's1', answers: { email: `${site.name}-answer@example.com` }, submittedAt: site.clock.nowIso() } }),
      newId: () => `${site.name}-job`, nowIso: () => site.clock.nowIso(),
    } });
  }
  for (const input of [{ submissionId: 's1' }, {}]) {
    const result = await f.call('forms_delivery_status', { ...input, site: 'B' }) as { deliveries: Array<{ bindingId: string }> };
    assert.deepEqual(result.deliveries.map(row => row.bindingId), ['B-binding']);
    assert.ok(!JSON.stringify(result).includes('answer@example.com'), 'status rows never carry answers');
  }
});

test('non-owner refuses before registry discovery, including any peer SQL opens', async t => {
  const f = await peerFixture(t);
  let discoveries = 0;
  f.deps.peerSiteReads = { ...f.peer, resolve: async () => { discoveries++; throw new Error('must not discover'); } };
  await assert.rejects(f.call('content_post_list', { site: 'B', kind: 'post' }, 'admin'), { message: "Only this installation's owner can read other sites." });
  assert.equal(discoveries, 0);
  assert.equal(f.contentHandles.length, 0);
  assert.equal(f.audits.length, 0);
});

test('local-host/name/trash/live-db-alias/storage/schema refusals are fixed and path-free', async t => {
  const f = await peerFixture(t);
  const required = { siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId, buildRegistrations: () => inspection(async () => null) };
  const rejects = async (port: ReturnType<typeof createPeerSiteReads>, siteName: string, message: string) => {
    await assert.rejects(port.resolve({ ...required, siteName }), error => {
      assert.ok(error instanceof ToolInputError);
      assert.equal(error.message, message);
      assert.ok(!error.message.includes(f.home));
      return true;
    });
  };
  const remote = createPeerSiteReads({ currentSiteDir: f.a.dir }, { ...f.options, localHost: false });
  await rejects(remote, 'B', 'Reading another site needs a local Tovu host.');
  assert.equal(f.contentHandles.length, 0);
  const unknown = 'No readable local site has that name. Use sites_list to find a site.';
  for (const name of ['unknown', '../B', f.b.dir]) await rejects(f.peer, name, unknown);
  const trashDir = path.join(f.home, 'site-trash', 'B');
  fs.mkdirSync(path.dirname(trashDir)); fs.renameSync(f.b.dir, trashDir);
  f.workspace.registry({}).relocate({ from: f.b.dir, to: trashDir });
  await rejects(f.peer, 'B', unknown);
  fs.renameSync(trashDir, f.b.dir);
  f.workspace.registry({}).relocate({ from: trashDir, to: f.b.dir });
  // Use a new catalog entry with a symlink to A, without removing B's open fixture database.
  const alias = path.join(f.home, 'alias'); fs.mkdirSync(alias);
  fs.writeFileSync(path.join(alias, '.site-meta.json'), JSON.stringify({ siteId: 'alias', storage: { kind: 'sqlite' } }));
  fs.symlinkSync(f.a.paths.contentDbPath, path.join(alias, 'content.db'));
  f.workspace.registry({}).merge({ entries: [{ id: 'alias', name: 'alias', path: alias, createdBy: 'peer-test', lastOpened: null }] });
  await rejects(f.peer, 'alias', unknown);
  const meta = path.join(f.b.dir, '.site-meta.json');
  fs.writeFileSync(meta, JSON.stringify({ siteId: 'B', storage: { kind: 'pglite' } }));
  await rejects(f.peer, 'B', 'Only local SQLite sites can be read.');
  fs.writeFileSync(meta, JSON.stringify({ siteId: 'B', storage: { kind: 'sqlite' } }));
  // ADR-066: adopted sites track pending steps in the TS ledger; the frozen Drizzle chain stays intact.
  await f.b.kernel.execute(sql`DELETE FROM ${sql.table(LEDGER_TABLE)} WHERE id = ${CONTENT_MIGRATIONS.at(-1)!.id}`);
  await rejects(f.peer, 'B', 'Open B in Tovu once to upgrade it.');
});

test('peer content/chat/journal connections reject writes; missing dependencies poison every operation except await', async t => {
  const f = await peerFixture(t);
  // Read-only composition must not rediscover/seed an owner by the bootstrap username.
  f.b.db.$client.prepare('UPDATE identity_users SET username = ? WHERE principal_id = ?').run('renamed-owner', f.b.ownerId);
  let peerDeps: Parameters<typeof buildAssistantToolRegistrations>[0] | undefined;
  const resolved = await f.peer.resolve({ siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: deps => { peerDeps = deps; return inspection(async () => deps.workspaceId); } });
  assert.notEqual(resolved, 'current');
  assert.equal(resolved !== 'current' && (resolved.principal as { toolAccess?: string }).toolAccess, 'read-only');
  for (const handle of f.contentHandles) await assert.rejects(handle.execute(sql`CREATE TABLE forbidden(id TEXT)`), /readonly|read-only/i);
  assert.throws(() => f.chatHandles[0]!.exec("UPDATE ai_chats SET title='forbidden'"), /readonly|read-only/i);
  const poison = (peerDeps as unknown as Record<string, any>).siteAssistantSecretSealer;
  assert.equal(await poison, poison, 'promise assimilation finishes');
  for (const use of [() => poison.seal, () => poison(), () => new poison(), () => String(poison)]) {
    assert.throws(use, error => error instanceof CrossSiteUnavailable && error.field === 'siteAssistantSecretSealer');
  }
  assert.throws(() => (peerDeps as unknown as Record<string, any>).toolAttemptAuditSink.append, CrossSiteUnavailable);
  assert.throws(() => (peerDeps as unknown as Record<string, any>).apiKeyRepo.findById, CrossSiteUnavailable);
});

test('zero or multiple target owners refuse and close every provisional connection', async t => {
  const f = await peerFixture(t);
  const role = await f.b.identity.roleRepo.findByName({ workspaceId: f.b.workspaceId, name: 'owner' }); assert.ok(role);
  // A second owner role link is enough: the identity query joins real site-local users.
  await f.b.identity.principalRepo.save({ id: 'second', workspaceId: f.b.workspaceId, kind: 'user', displayName: 'Second', status: 'active', createdAt: f.b.clock.nowIso() });
  await f.b.identity.userRepo.save({ principalId: 'second', workspaceId: f.b.workspaceId, username: 'second', passwordHash: 'unused' });
  await f.b.identity.principalRoleRepo.save({ id: 'second-link', workspaceId: f.b.workspaceId, principalId: 'second', roleId: role.id });
  const required = { siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId, buildRegistrations: () => inspection(async () => null) };
  await assert.rejects(f.peer.resolve(required), /exactly one owner/);
  f.b.db.$client.prepare('DELETE FROM principal_roles WHERE role_id = ?').run(role.id);
  await assert.rejects(f.peer.resolve(required), /exactly one owner/);
  for (const handle of f.contentHandles) await assert.rejects(handle.query(sql`SELECT 1`));
  assert.equal(f.chatHandles.length, 0);
});

test('LRU eviction closes the oldest bag; warm reads reuse it and idle callbacks close every handle', async t => {
  const f = await peerFixture(t);
  await f.addSite('C'); await f.addSite('D');
  let clock = 0;
  const callbacks: Array<() => void> = [];
  const schedule = ((callback: () => void) => { callbacks.push(callback); return { unref() {} }; }) as unknown as typeof setTimeout;
  let closes = 0, builds = 0;
  const port = createPeerSiteReads({ currentSiteDir: f.a.dir }, { ...f.options, maxSites: 2, idleMs: 100, now: () => clock, schedule,
    openContent: (<DB>(file: string, optional: { readOnly?: boolean } = {}) => {
      const kernel = openSqliteFileKernel<DB>(file, optional);
      return { ...kernel, close: async () => { closes++; await kernel.close(); } };
    }) as typeof openSqliteFileKernel,
  });
  t.after(() => port.close());
  const read = (siteName: string) => port.resolve({ siteName, toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: () => { builds++; return inspection(async () => null); } });
  await read('B'); clock++; await read('C'); clock++; await read('B'); clock++; await read('D');
  assert.equal(builds, 3, 'B was cached'); assert.equal(closes, 2, 'C content and journal handles evicted');
  assert.equal(f.chatHandles[1]!.open, false, 'C chat closed');
  clock += 101;
  callbacks.at(-1)!();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.chatHandles[2]!.open, false, 'D closes on its idle callback before port.close');
  assert.equal(f.chatHandles[0]!.open, true, 'B remains until its own timer or shutdown');
  assert.equal(closes, 4, 'idle closed D content+journal');
  await port.close();
  assert.equal(closes, 6, 'three bags, content+journal closed once each');
  assert.ok(f.chatHandles.every(handle => !handle.open));
});

test('missing peer chat files refuse without creating a replacement database', async t => {
  const f = await peerFixture(t);
  fs.renameSync(f.b.paths.chatDbPath, `${f.b.paths.chatDbPath}.hidden`);
  await assert.rejects(f.call('assistant_chats_list', { site: 'B' }), { message: "This site's chat database is missing. Open the site in Tovu first." });
  assert.equal(fs.existsSync(f.b.paths.chatDbPath), false);
  assert.equal(f.chatHandles.length, 0);
});

test('a missing journal refuses without creating it and closes the provisional content/chat handles', async t => {
  const f = await peerFixture(t);
  fs.renameSync(f.b.journalPath, `${f.b.journalPath}.hidden`);
  await assert.rejects(f.call('database_query_timeline', { site: 'B' }), { message: "This site's database journal is missing. Open the site in Tovu first." });
  assert.equal(fs.existsSync(f.b.journalPath), false);
  assert.ok(f.chatHandles.every(handle => !handle.open));
  for (const handle of f.contentHandles) await assert.rejects(handle.query(sql`SELECT 1`));
});

test('batch shared site and collapsed content_read dispatch reach B through the same wrappers', async t => {
  const f = await peerFixture(t);
  const registrations = buildAssistantToolRegistrations(f.deps, undefined, { contributions: f.contributions,
    includeContentReadCollapse: false, batchableTools: [{ toolId: 'content_post_list' }] });
  const list = registrations.find(tool => tool.descriptor.id === 'content_post_list')!;
  const batch = await invokeRegisteredTool(list, { ...context({ site: 'B', kind: 'post', items: [{}, {}] }), principal: { id: f.a.ownerId } }) as {
    succeeded: number; results: Array<{ result: unknown }>;
  };
  assert.equal(batch.succeeded, 2);
  for (const item of batch.results) assert.match(JSON.stringify(item.result), /B post/);
  const collapsed = f.build(true).find(tool => tool.descriptor.id === 'content_read.content_post')!;
  const result = await collapsed.handler({ ...context({ site: 'B', kind: 'post' }), principal: { id: f.a.ownerId } });
  assert.match(JSON.stringify(result), /B post/);
  assert.equal(f.audits.length, 3);
});

for (const bounds of [{ maxSites: 0 }, { maxSites: 1.5 }, { idleMs: 0 }, { idleMs: Infinity }]) {
  test(`L058a invalid peer bounds ${JSON.stringify(bounds)} refuse before discovery`, () => {
    assert.throws(() => createPeerSiteReads({ currentSiteDir: '/unused' }, bounds), { message: 'Invalid peer cache bounds' });
  });
}
test('L058a concurrent cold opens share one bag; unregistered tools refuse; current and closed resolutions stay distinct', async t => {
  const f = await peerFixture(t);
  let builds = 0;
  const required = { siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: () => { builds++; return inspection(async () => 'B'); } };
  const [first, second] = await Promise.all([f.peer.resolve(required), f.peer.resolve(required)]);
  assert.notEqual(first, 'current'); assert.notEqual(second, 'current');
  assert.equal(builds, 1);
  assert.equal(f.contentHandles.length, 2);
  await assert.rejects(f.peer.resolve({ ...required, toolId: 'missing' }), { message: "This tool can't read another site." });
  assert.equal(await f.peer.resolve({ ...required, siteName: 'A' }), 'current');
  await f.peer.close();
  await assert.rejects(f.peer.resolve(required), { message: 'Cross-site reads are closed.' });
  if (first !== 'current') await assert.rejects(first.handler(context()), { message: 'This site read expired. Try again.' });
});
test('L058a busy bags resist eviction and close drains the active handler', async t => {
  const f = await peerFixture(t);
  await f.addSite('C');
  const port = createPeerSiteReads({ currentSiteDir: f.a.dir }, { ...f.options, maxSites: 1 });
  t.after(() => port.close());
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const required = { siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: () => inspection(async () => { await gate; return 'done'; }) };
  const selected = await port.resolve(required);
  assert.notEqual(selected, 'current');
  if (selected === 'current') return;
  const reading = selected.handler(context());
  try {
    await assert.rejects(port.resolve({ ...required, siteName: 'C' }), { message: 'Other-site reads are busy. Try again.' });
    let closed = false;
    const closing = port.close().then(() => { closed = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false);
    release();
    assert.equal(await reading, 'done');
    await closing;
    assert.ok(f.chatHandles.every(handle => !handle.open));
  } finally { release(); await reading; }
});

test("a peer's blob store reads only files inside its own uploads folder, and theme links added later are refused on roster access", async t => {
  const f = await peerFixture(t);
  let peerDeps: Record<string, any> | undefined;
  await f.peer.resolve({ siteName: 'B', toolId: 'inspect', callerPrincipalId: f.a.ownerId,
    buildRegistrations: deps => { peerDeps = deps as unknown as Record<string, any>; return inspection(async () => deps.workspaceId); } });
  assert.ok(peerDeps);
  const uploads = path.join(f.b.dir, 'uploads');
  const stored = (fs.readdirSync(uploads, { recursive: true, withFileTypes: true }) as fs.Dirent[]).find(entry => entry.isFile());
  assert.ok(stored, 'the fixture stored one blob for B');
  const storageKey = path.relative(uploads, path.join(stored.parentPath, stored.name));
  const blobStore = peerDeps.blobStore;
  assert.equal(await blobStore.exists({ storageKey }), true);
  assert.equal(await blobStore.sizeOf({ storageKey }), fs.statSync(path.join(uploads, storageKey)).size);
  assert.deepEqual(Buffer.from(await blobStore.get({ storageKey })), fs.readFileSync(path.join(uploads, storageKey)));
  assert.equal(await blobStore.exists({ storageKey: 'missing.bin' }), false);
  assert.equal(await blobStore.sizeOf({ storageKey: 'missing.bin' }), null);

  // A link planted in B's uploads that points at A's files must never be followed.
  const outside = path.join(f.a.dir, '.site-meta.json');
  fs.symlinkSync(outside, path.join(uploads, 'escape.bin'));
  for (const read of [() => blobStore.exists({ storageKey: 'escape.bin' }), () => blobStore.sizeOf({ storageKey: 'escape.bin' }), () => blobStore.get({ storageKey: 'escape.bin' })]) {
    await assert.rejects(read(), (error: unknown) => error instanceof ToolInputError && (error as Error).message === 'This site has files outside its local folder.');
  }

  fs.symlinkSync(outside, path.join(f.b.dir, 'themes', 'linked.json'));
  assert.throws(() => peerDeps!.themes, (error: unknown) => error instanceof ToolInputError && (error as Error).message === 'Linked theme files cannot be read from another site.');
});
