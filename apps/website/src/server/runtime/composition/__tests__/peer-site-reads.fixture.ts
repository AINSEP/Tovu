import { invokeRegisteredTool } from "../../../../assistant/__tests__/fixtures/execute-registered-tool.js";
import '../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { TestContext } from 'node:test';
import { createContributionRegistry, type ToolExecutionContext } from '@jini-ai/core';
import type { ToolAttemptAuditSink } from '@jini-ai/daemon/tool-audit';
import type { ToolContributor, DerivedToolContributor } from '@jini-ai/core';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { buildAssistantToolRegistrations } from '#src/assistant/tool-registrations';
import { toAssistantRegistryDeps } from '#src/assistant/__tests__/fixtures/registry-deps';
import { createChatStoreFactory } from '#src/assistant/persistence/store-factory';
import { openContentDb } from '#src/platform/db/sqlite/content-db';
import { openChatDb } from '#src/platform/db/sqlite/chat-db';
import { contentKernel } from '#src/platform/db/content-kernel';
import { openDatabaseJournalDb } from '#src/platform/db/sqlite/database-journal-db';
import { openNativeSqlite, openSqliteFileKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { createSitesWorkspace, assertTestHomeIsolation } from '#src/platform/site-dir/sites-home';
import { resolveSiteDatabasePaths } from '#src/platform/site-dir/site-databases';
import { createSqliteIdentityRouteDeps, DEFAULT_OWNER_CREDENTIALS } from '#src/features/identity/wiring';
import { createSettingsPrincipalLookup } from '#src/features/settings/index';
import { createPost, SqlitePostRepo } from '#src/features/post/index';
import { PagesHtmlDocumentStore } from '#src/features/pages/index';
import { LocalFsBlobStore } from '#src/features/media/index';
import { SqliteFormDefinitionRepo } from '#src/features/forms/repo.sqlite';
import { SqliteToolAttemptAuditSink } from '#src/features/tool-audit/repo.sqlite';
import { installCommentsDataModule } from '#src/features/comments/data-module-install';
import { installNewsletterDataModule } from '#src/features/newsletter/data-module-manifest';
import { SqliteMediaRepo, SqliteAssetBlobRepo, SqliteMediaContentTypeStore } from '#src/platform/db/sqlite/media-repo.sqlite';
import { createRouteDeps } from '../app.js';
import { createAppPermissionGrants } from '../app-permission-grants.js';
import { installFirstPartyToolContributors } from '../tool-catalog-manifest.js';
import { createPeerSiteReads } from '../peer-site-reads.js';

/** Real migrated content/chat/journal files, distinct principals and content on two temporary sites.
 * All catalog/env discovery stays under the shared isolated-home helper; never boots a real site.
 */
export async function peerFixture(t: TestContext, placement: 'inSite' | 'appData' = 'inSite') {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tovu-peer-reads-')));
  assertTestHomeIsolation({ homeDir: home });
  const workspace = createSitesWorkspace({}, { homeDir: home, cwd: home, env: {}, sourceRoots: [], appDataDir: path.join(home, 'app') });
  const close: Array<() => void | Promise<void>> = [];
  t.after(async () => { for (const dispose of close.reverse()) await dispose(); fs.rmSync(home, { recursive: true, force: true }); });
  /** Seed a fixture using the existing open/migration and repository owners, then keep its writer for assertions. */
  const addSite = async (name: string) => {
    const dir = path.join(home, name);
    fs.mkdirSync(dir);
    fs.mkdirSync(path.join(dir, 'themes'));
    fs.mkdirSync(path.join(dir, 'uploads'));
    fs.writeFileSync(path.join(dir, '.site-meta.json'), JSON.stringify({ siteId: name, storage: { kind: 'sqlite' } }));
    workspace.registry({}).merge({ entries: [{ id: name, path: dir, name, createdBy: 'peer-test', lastOpened: null }] });
    const paths = resolveSiteDatabasePaths({ dir }, { workspace, placement, reserveIdentity: false });
    fs.mkdirSync(path.dirname(paths.contentDbPath), { recursive: true });
    const db = openContentDb(paths.contentDbPath), kernel = contentKernel(db);
    close.push(() => { db.$client.close(); });
    const workspaceId = `${name}-workspace`, at = '2026-10-16T00:00:00.000Z';
    db.$client.prepare('INSERT INTO workspaces(id,name,slug,created_at) VALUES(?,?,?,?)').run(workspaceId, name, name, at);
    let sequence = 0;
    const clock = { nowMs: () => Date.parse(at), nowIso: () => at }, idGen = { newId: () => `${name}-id-${++sequence}` };
    const identity = createSqliteIdentityRouteDeps({ db: contentKernel(db), workspaceId, ownerCredentials: DEFAULT_OWNER_CREDENTIALS,
      permissionGrants: createAppPermissionGrants({}), clock, idGen });
    await identity.identityReady;
    await installCommentsDataModule({ db: kernel, dbPath: paths.contentDbPath });
    await installNewsletterDataModule({ db: kernel, dbPath: paths.contentDbPath });
    const ownerId = await identity.ownerPrincipalId;
    const postRepo = new SqlitePostRepo(kernel), mediaRepo = new SqliteMediaRepo(kernel), formDefinitionRepo = new SqliteFormDefinitionRepo(kernel);
    await createPost({ deps: { repo: postRepo, clock }, input: { workspaceId, id: 'post', title: `${name} post`, actorId: ownerId } });
    await createPost({ deps: { repo: postRepo, clock }, input: { workspaceId, id: 'page', kind: 'page', title: `${name} page`, actorId: ownerId } });
    await new PagesHtmlDocumentStore({ workspaceId, postId: 'page', actorId: ownerId }, { db: kernel, clock }).ensureHtmlFormat(`<main>${name} page</main>`);
    const bytes = await sharp({ create: { width: 2, height: 1, channels: 3, background: name === 'A' ? 'red' : 'blue' } }).png().toBuffer();
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const blobStore = new LocalFsBlobStore({ rootDir: path.join(dir, 'uploads') });
    const { storageKey } = await blobStore.put({ workspaceId, sha256, bytes });
    await new SqliteAssetBlobRepo(kernel).save({ id: 'blob', workspaceId, sha256, storageKey, status: 'active', createdAt: at, createdByPrincipal: ownerId });
    await new SqliteMediaContentTypeStore(kernel).set({ workspaceId, sha256, contentType: 'image/png' });
    await mediaRepo.save({ id: 'media', workspaceId, title: `${name} media`, slug: 'media', alt: '', caption: '', credit: '',
      source: { sha256 }, status: 'active', version: 1, createdAt: at, updatedAt: at,
      width: null, height: null, cssClass: null, htmlAttributes: null, createdBy: ownerId });
    await formDefinitionRepo.create({ id: 'form', workspaceId, name: `${name} form`, slug: 'form', fields: [],
      notify: { enabled: false, recipients: [] }, status: 'active', createdAt: at, updatedAt: at, version: 1 });
    const chat = openChatDb(paths.chatDbPath), chatHistory = createChatStoreFactory(chat);
    const staffId = `${name}-staff`;
    for (const [id, userId, scope] of [['owner-chat', ownerId, workspaceId], ['staff-chat', staffId, workspaceId], ['foreign-chat', ownerId, 'foreign']]) {
      const store = chatHistory({ kind: 'user', workspaceId: scope!, userId: userId! });
      await store.create({ id: id!, title: `${name} theme plan` });
      await store.appendMessage({ conversationId: id!, message: { id: `${id}-message`, role: 'user', content: `${name} ${id}` } });
    }
    close.push(() => { chat.close(); });
    const journalPath = path.join(path.dirname(paths.contentDbPath), 'ops', 'database-journal.db');
    fs.mkdirSync(path.dirname(journalPath), { recursive: true });
    const journal = openDatabaseJournalDb(journalPath);
    await journal.ready;
    close.push(() => journal.close());
    return { name, dir, paths, journalPath, db, kernel, identity, ownerId, staffId, workspaceId, postRepo, mediaRepo, formDefinitionRepo, chatHistory, clock, idGen };
  };
  const a = await addSite('A'), b = await addSite('B');
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  const contentHandles: ReturnType<typeof openSqliteFileKernel<any>>[] = [], chatHandles: ReturnType<typeof openNativeSqlite>[] = [];
  const options = { workspace, localHost: true,
    openContent: (<DB>(file: string, optional: { readOnly?: boolean } = {}) => {
      assert.equal(optional.readOnly, true);
      const handle = openSqliteFileKernel<DB>(file, optional);
      contentHandles.push(handle); return handle;
    }) as typeof openSqliteFileKernel,
    openChat: ((file, optional) => {
      assert.deepEqual(optional, { readonly: true, fileMustExist: true, timeout: 5000 });
      const handle = openNativeSqlite(file, optional); chatHandles.push(handle); return handle;
    }) as typeof openNativeSqlite,
  };
  const peer = createPeerSiteReads({ currentSiteDir: a.dir }, options);
  close.push(() => peer.close());
  const base = createRouteDeps();
  await base.identityReady;
  const audits: Array<Record<string, unknown>> = [];
  const activeAudit = new SqliteToolAttemptAuditSink(a.kernel);
  const toolAttemptAuditSink: ToolAttemptAuditSink = { append: async (required, optional) => {
    audits.push({ ...required, ...optional });
    await activeAudit.append(required, optional);
  } };
  const deps = toAssistantRegistryDeps({ routeDeps: { ...base, ...a.identity, workspaceId: a.workspaceId, postRepo: a.postRepo, mediaRepo: a.mediaRepo,
    // Replacing identity must also rebind the settings lookup to A's principal repository.
    principalRepo: {
      ...createSettingsPrincipalLookup({ repo: a.identity.principalRepo }),
      findById: a.identity.principalRepo.findById.bind(a.identity.principalRepo),
      list: a.identity.principalRepo.list.bind(a.identity.principalRepo),
      save: a.identity.principalRepo.save.bind(a.identity.principalRepo),
    },
    formDefinitionRepo: a.formDefinitionRepo, chatHistory: a.chatHistory, peerSiteReads: peer,
    toolAttemptAuditSink,
  } });
  const build = (collapsed = false) => buildAssistantToolRegistrations(deps, undefined, { contributions, includeContentReadCollapse: collapsed });
  /** Invoke actual assembled handlers with A's identity; peer scoping must replace it with B's owner. */
  const call = (id: string, input: unknown, principalId = a.ownerId) => {
    const registration = build().find(tool => tool.descriptor.id === id);
    assert.ok(registration, id);
    const ctx: ToolExecutionContext = { executionId: 'execution', run: { id: 'run' }, principal: { id: principalId }, input, signal: new AbortController().signal };
    return typeof input === 'object' && input !== null && Object.hasOwn(input, 'items')
      ? invokeRegisteredTool(registration, ctx)
      : registration.handler(ctx);
  };
  return { home, workspace, a, b, addSite, options, peer, deps, contributions, audits, contentHandles, chatHandles, build, call, close };
}
