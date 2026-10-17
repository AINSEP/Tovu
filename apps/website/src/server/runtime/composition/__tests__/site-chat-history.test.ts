import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import { createChatStoreFactory } from '#src/assistant/persistence/store-factory';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { openChatDb } from '#src/platform/db/sqlite/chat-db';
import { openNativeSqlite, openSqliteFileKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { createSitesWorkspace, assertTestHomeIsolation } from '#src/platform/site-dir/sites-home';
import { resolveSiteDatabasePaths } from '#src/platform/site-dir/site-databases';
import { createSqliteIdentityRouteDeps, DEFAULT_OWNER_CREDENTIALS } from '#src/features/identity/wiring';
import { createAppPermissionGrants } from '../app-permission-grants.js';
import { createSiteChatHistory } from '../site-chat-history.js';

/** Real temporary registry/identity/chat databases; no source boot or owner-home access. */
async function fixture(t: TestContext, placement: 'inSite' | 'appData' = 'inSite') {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-site-chat-history-')));
  assertTestHomeIsolation({ homeDir: home });
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, sourceRoots: [], appDataDir: path.join(home, 'app') });
  const site = (name: string) => {
    const dir = path.join(home, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '.site-meta.json'), JSON.stringify({ siteId: name, storage: { kind: 'sqlite' } }));
    workspace.registry({}).merge({ entries: [{ id: name, path: dir, name, createdBy: 'history-test', lastOpened: null }] });
    return dir;
  };
  const currentSiteDir = site('current'), otherDir = site('other');
  const currentPaths = resolveSiteDatabasePaths({ dir: currentSiteDir }, { workspace, placement, reserveIdentity: false });
  fs.mkdirSync(path.dirname(currentPaths.contentDbPath), { recursive: true });
  openContentDb(currentPaths.contentDbPath).$client.close();
  const paths = resolveSiteDatabasePaths({ dir: otherDir }, { workspace, placement, reserveIdentity: false });
  fs.mkdirSync(path.dirname(paths.contentDbPath), { recursive: true });
  const db = openContentDb(paths.contentDbPath);
  t.after(() => db.$client.close());
  const workspaceId = 'target-workspace';
  db.$client.prepare('INSERT INTO workspaces(id,name,slug,created_at) VALUES(?,?,?,?)').run(workspaceId, 'Target', 'target', '2026-01-01T00:00:00.000Z');
  let sequence = 0;
  const identity = createSqliteIdentityRouteDeps({ db, workspaceId, ownerCredentials: DEFAULT_OWNER_CREDENTIALS,
    permissionGrants: createAppPermissionGrants({}), clock: { nowIso: () => '2026-01-01T00:00:00.000Z' }, idGen: { newId: () => `target-id-${++sequence}` } });
  await identity.identityReady;
  const ownerId = await identity.ownerPrincipalId;
  const adminId = 'target-admin';
  await identity.principalRepo.save({ id: adminId, workspaceId, kind: 'user', displayName: 'Other admin', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' });
  await identity.userRepo.save({ principalId: adminId, workspaceId, username: 'staff', passwordHash: 'unused-test-hash' });
  const role = await identity.roleRepo.findByName({ workspaceId, name: 'admin' });
  assert.ok(role);
  await identity.principalRoleRepo.save({ id: 'admin-link', workspaceId, principalId: adminId, roleId: role.id });
  const chat = openChatDb(paths.chatDbPath);
  const factory = createChatStoreFactory(chat);
  for (const [id, userId, scope] of [['owner-chat', ownerId, workspaceId], ['admin-chat', adminId, workspaceId], ['foreign-workspace', ownerId, 'foreign']]) {
    const store = factory({ kind: 'user', workspaceId: scope!, userId: userId! });
    await store.create({ id: id!, title: 'Theme plan' });
    await store.appendMessage({ conversationId: id!, message: { id: `${id}-message`, role: 'user', content: `content of ${id}` } });
  }
  chat.close();
  const handles: Database.Database[] = [];
  let contentClosed = 0;
  const options = { workspace, localHost: true, openChat: ((file, options) => {
    const connection = openNativeSqlite(file, options); handles.push(connection); return connection;
  }) as typeof openNativeSqlite, openContent: (<DB>(file: string, options: { readOnly?: boolean } = {}) => {
    assert.equal(options.readOnly, true);
    const kernel = openSqliteFileKernel<DB>(file, options);
    return { ...kernel, close: async () => { contentClosed++; await kernel.close(); } };
  }) as typeof openSqliteFileKernel };
  t.after(() => { for (const handle of handles) if (handle.open) handle.close(); });
  return { required: { currentSiteDir }, options, handles, paths, otherDir, db, identity, workspaceId, ownerId, adminId,
    contentCloses: () => contentClosed, history: createSiteChatHistory({ currentSiteDir }, options) };
}

for (const placement of ['inSite', 'appData'] as const) test(`${placement}: another site's owner scope is read-only and closes`, async t => {
  const f = await fixture(t, placement);
  assert.deepEqual(await f.history.listSiteNames({ principalId: 'current-owner' }), ['other']);
  const opened = await f.history.openStore({ principalId: 'current-owner', siteName: 'other' });
  assert.ok(opened);
  assert.equal(f.contentCloses(), 1);
  assert.equal(f.handles[0]!.readonly, true);
  assert.equal(f.handles[0]!.pragma('busy_timeout', { simple: true }), 5000);
  assert.throws(() => f.handles[0]!.exec("UPDATE ai_chats SET title = 'forbidden'"), /readonly|read-only/i);
  assert.deepEqual((await opened.store.history!.list({})).map(row => row.id), ['owner-chat']);
  assert.equal((await opened.store.history!.read({ chatId: 'owner-chat' })).messages[0]?.content, 'content of owner-chat');
  for (const id of ['admin-chat', 'foreign-workspace', 'missing']) {
    assert.equal(await opened.store.get({ id }), null);
    assert.deepEqual((await opened.store.history!.read({ chatId: id })).messages, []);
  }
  await opened.close();
  assert.equal(f.handles[0]!.open, false);
});

test('only registered other-site names open; current-site detection uses exact names', async t => {
  const f = await fixture(t);
  for (const siteName of ['unknown', '../other', f.otherDir, 'current']) {
    assert.equal(await f.history.openStore({ principalId: 'current-owner', siteName }), undefined);
  }
  assert.equal(f.handles.length, 0);
  assert.equal(f.contentCloses(), 0);
  assert.equal(f.history.isCurrentSite({ siteName: 'current' }), true);
  for (const siteName of ['other', '../current', f.required.currentSiteDir]) assert.equal(f.history.isCurrentSite({ siteName }), false);
});

test('nonlocal hosts refuse before source connections; non-SQLite and missing chat files refuse', async t => {
  const f = await fixture(t);
  const remote = createSiteChatHistory(f.required, { ...f.options, localHost: false });
  await assert.rejects(remote.openStore({ principalId: 'owner', siteName: 'other' }), /needs a local Tovu host/);
  await assert.rejects(remote.listSiteNames({ principalId: 'owner' }), /needs a local Tovu host/);
  assert.throws(() => remote.isCurrentSite({ siteName: 'current' }), /needs a local Tovu host/);
  fs.writeFileSync(path.join(f.otherDir, '.site-meta.json'), JSON.stringify({ siteId: 'other', storage: { kind: 'pglite' } }));
  await assert.rejects(f.history.openStore({ principalId: 'owner', siteName: 'other' }), /Only local SQLite sites can be read/);
  fs.writeFileSync(path.join(f.otherDir, '.site-meta.json'), JSON.stringify({ siteId: 'other', storage: { kind: 'sqlite' } }));
  fs.rmSync(f.paths.chatDbPath);
  await assert.rejects(f.history.openStore({ principalId: 'owner', siteName: 'other' }), /chat database.*missing/i);
  assert.equal(fs.existsSync(f.paths.chatDbPath), false);
  assert.equal(f.handles.length, 0);
});

test('zero or multiple target owners refuse and close the content connection', async t => {
  const f = await fixture(t);
  const ownerRole = await f.identity.roleRepo.findByName({ workspaceId: f.workspaceId, name: 'owner' });
  assert.ok(ownerRole);
  await f.identity.principalRoleRepo.save({ id: 'second-owner', workspaceId: f.workspaceId, principalId: f.adminId, roleId: ownerRole.id });
  await assert.rejects(f.history.openStore({ principalId: 'current-owner', siteName: 'other' }), /exactly one owner/);
  f.db.$client.prepare('DELETE FROM principal_roles WHERE role_id = ?').run(ownerRole.id);
  await assert.rejects(f.history.openStore({ principalId: 'current-owner', siteName: 'other' }), /exactly one owner/);
  assert.equal(f.contentCloses(), 2);
  assert.equal(f.handles.length, 0);
});
