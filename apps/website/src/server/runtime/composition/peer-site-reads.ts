/** Write-free host composition for owner-only reads of registered local SQLite sites. */
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import { isReadOnlyTool, ToolInputError, type Principal, type ToolRegistration, type ToolExecutionContext, type ToolExecutionOptions } from '@jini-ai/core';
import { createSystemClock, createRandomUuidGenerator, nowIso } from '@jini-ai/core/primitives';
import { getEffective } from '@jini-ai/core/settings';
import { constrainPrincipalToReadOnlyTools } from '@jini-ai/daemon/read-only-tools';
import { SqliteDbOpsAdapter } from '@jini-ai/db/sqlite';
import { OriginRegistry } from '@jini-ai/http-kit/verified-origin';
import { SharpImageTransformer } from '@jini-ai/cms/media/node';
import type { AssistantToolRegistryDeps } from '#src/assistant/tool-registrations';
import type { PeerSiteReads } from '#src/assistant/tool-registrations';
export type { PeerSiteReads } from '#src/assistant/tool-registrations';
import { createChatStoreFactory } from '#src/assistant/persistence/store-factory';
import type { ContentDatabase } from '#src/platform/db/content-database.generated';
import type { JournalDatabase } from '#src/platform/db/journal-kernel';
import { openNativeSqlite, openSqliteFileKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { SqliteDatabaseIntrospectionAdapter } from '#src/platform/db/sqlite/database-introspection-adapter.sqlite';
import { SqliteDatabaseLedgerRepo, SqliteMigrationRunsRepo, SqliteRestorePointsRepo } from '#src/platform/db/sqlite/database-journal-repo';
import { SqliteChangeSetRepo } from '#src/platform/db/sqlite/change-set-repo.sqlite';
import { SqliteEntryRefsRepo } from '#src/platform/db/sqlite/entry-refs-repo.sqlite';
import { SqliteOriginSettingRepo } from '#src/platform/db/sqlite/origin-repo.sqlite';
import { SqliteAssetBlobRepo, SqliteAssetRenditionRepo, SqliteMediaContentTypeStore, SqliteMediaRepo, SqliteTransformDefinitionRepo } from '#src/platform/db/sqlite/media-repo.sqlite';
import { createSitesWorkspace, type SitesWorkspace } from '#src/platform/site-dir/sites-home';
import { resolveSiteDatabasePaths } from '#src/platform/site-dir/site-databases';
import { resolveSiteStorage } from '#src/platform/site-dir/site-storage';
import { resolveWorkspace } from '#src/platform/site-dir/resolve-workspace';
import { SqlitePostRepo, postSearchIndexFor } from '#src/features/post/index';
import { PagesHtmlDocumentStore } from '#src/features/pages/index';
import { SqlitePresentationSettingsRepo, resolveActiveThemeId } from '#src/features/presentation/index';
import { LocalFsBlobStore } from '#src/features/media/index';
import { createSqliteIdentityRouteDeps, DEFAULT_OWNER_CREDENTIALS } from '#src/features/identity/wiring';
import { SqliteSettingsRepo } from '#src/features/settings/repo.sqlite';
import { SqliteWorkspaceRepo } from '#src/features/workspace/index';
import { SqliteFormDefinitionRepo, SqliteFormSubmissionRepo } from '#src/features/forms/repo.sqlite';
import { SqlFormDeliveryRepo } from '#src/platform/db/repos/form-delivery-repo';
import { SqliteTaxonomyRepo, SqliteTermRepo, SqliteEntryTermRepo, SqliteTaxonomyRevisionRepo } from '#src/features/taxonomy/repo.sqlite';
import { SqliteMenuRepo, SqliteNavLocationBindingRepo } from '#src/features/navigation/repo.sqlite';
import { SqliteEntryRepo } from '#src/features/entries/repo.sqlite';
import { SqliteContentTypeRepo } from '#src/features/content-types/repo.sqlite';
import { discoverAllBuiltInThemes } from '#src/features/theme/index';
import { SqliteCommentRepo } from '#src/features/comments/repo.sqlite';
import { SqliteMemberRepo, SqliteMemberTierRepo, SqliteMemberSubscriptionRepo } from '#src/features/members/index';
import { SqliteNewsletterCampaignRepo, SqliteNewsletterListRepo, SqliteNewsletterSubscriptionRepo, SqliteNewsletterAudienceSnapshotRepo, SqliteNewsletterSendRepo } from '#src/features/newsletter/repo.sqlite';
import { SqliteRedirectRepo } from '#src/features/redirects/repo.sqlite';
import { createSeoDeps } from '#src/features/seo/index';
import { SqliteWidgetRegionBindingRepo } from '#src/features/widgets/repo.sqlite';
import { SqliteTrashRepo } from '#src/features/trash/repo.sqlite';
import { buildTrashRegistry } from '#src/features/trash/registry';
import { REDIRECT_ENTITY_TYPE } from '#src/features/trash/index';
import { buildGatewayDeps, buildOwnerOnlyInstanceAuthorize } from '#src/contracts/core/gated-mutations/composition';
import { createAppPermissionGrants } from './app-permission-grants.js';
import { registeredSources, isLocalTovuHost, type RegisteredSiteSource } from './registered-sites.js';

const CHAT_SURFACE_DESCRIPTION = "Chat UI surface, independent of site data.";

/** Contributor domain names, not tool prefixes. Only explicitly read-only registrations qualify. */
export const CROSS_SITE_READ_DOMAINS: ReadonlySet<string> = new Set([
  'post', 'content-stats', 'pages', 'media', 'media-view', 'forms', 'taxonomy', 'menus',
  'content-types', 'entries', 'themes', 'settings', 'comments', 'members', 'newsletter',
  'redirects', 'seo', 'widgets', 'workspace', 'identity',
  'identity-policy-list-permissions', 'database', 'trash', 'change-sets', 'assistant-history',
  'theme-preview-switcher',
]);

/** Every other read contributor has an explicit boundary; catalog tests reject unclassified additions. */
export const CROSS_SITE_EXCLUDED: Readonly<Record<string, string>> = {
  'custom-credentials': 'Credential stores and sealed secrets are site-local.',
  integrations: 'Webhook subscriptions and integration credentials are secret-bearing.',
  'external-mcp': 'External servers require site-local credentials and live connections.',
  'external-mcp-operations': 'External MCP operations use live daemon admissions and credentials.',
  deployments: 'Deployment providers use credentials.',
  'deploy-ops': 'Installed deployment operations capture the active registry and credentials.',
  'static-publish': 'Publishing uses host credentials and peer trust.',
  'publish-content': 'Publishing uses tokens and peer trust.',
  'source-control': 'Source-control providers use credentials.',
  'domain-dns': 'Live DNS/TLS probes and saved hosting credentials are not peer data reads.',
  'email-templates': 'Email templates are read on the active site only; peer reads were not designed for them yet.',
  'site-backup': 'Backup planning uses credentials and the active backup source layout.',
  'database-transfer': 'Transfer planning uses sealed destination credentials.',
  'media-generation': 'Generation providers require credentials.',
  'media-providers': 'Provider configuration is credential-bearing.',
  'system-mail': 'Mail status belongs to the active process and provider credentials.',
  'system-mail-providers': 'Mail provider configuration is credential-bearing and belongs to the active process.',
  'system-mail-delivery': 'Mail readiness and send history belong to the active process and its own mail ledgers.',
  'agent-plugin-search': 'Search reads installed plugin packages and activation state.',
  'agent-plugin-skill': 'Installed skill packages may run code.',
  'agent-plugin-memory': 'Plugin runtime memory belongs to its installed execution context.',
  plugins: 'Plugin discovery and capabilities run installed code.',
  'plugin-source': 'Installed source packages are outside the read-only repository bag.',
  'plugin-capability': 'Capabilities run installed code.',
  skill: 'Skills run installed code.',
  'fs-files': 'Filesystem roots are captured from the active installation.',
  'system-server-logs': 'Logs describe the active process.',
  'tool-gaps': 'Tool gap observability reads the active site owner\'s native CLI audit.',
  web: 'Public web reads are site-agnostic.',
  'web-screenshot': 'Browser capture uses the active server and attachment paths.',
  'site-inspection': 'Inspection reads the live server and process configuration.',
  'post-preview': 'Preview renders through the live server and installed code.',
  analytics: 'Analytics describes the running site.',
  search: 'Search uses the active site index and its installed provider; peer composition supplies no search capability.',
  'site-evidence': 'Evidence capture reads the live server.',
  'media-video-view': 'The contributor captures the active attachment reader at installation.',
  recovery: 'Recovery status uses the process operation lock and live in-memory site status; restore-point lists remain available in database.',
  'site-guide': 'Guide construction loads installed plugin contributions and activation code.',
  sites: 'The installation registry is site-agnostic.',
  'sites-list': 'The installation registry is site-agnostic.',
  'settings-ui-locales': 'UI locale inventory is site-agnostic.',
  'demo-choices': CHAT_SURFACE_DESCRIPTION,
  'demo-a2ui': CHAT_SURFACE_DESCRIPTION,
  'demo-image': CHAT_SURFACE_DESCRIPTION,
  'render-ui': CHAT_SURFACE_DESCRIPTION,
  'ask-choice': CHAT_SURFACE_DESCRIPTION,
  'component-catalog': 'UI component inventory is site-agnostic.',
  'admin-screen-link': 'Links refer to the active admin UI.',
  'external-mcp-reauth': 'Reauthentication belongs to the active UI and credentials.',
  consent: 'Consent readiness diagnoses the active site middleware and deploy gate; peer composition supplies no consent service.',
  'visitor-tools': 'Visitor tool modes and limits are read on the active site only; peer composition supplies no visitor-tools service.',
  'project-keys': 'Saved project keys are credential metadata for the active project.',
  'provider-status': 'Provider status reads installed plugins and their live provider state in the active process.',
};

/** Reads refused on a peer although their domain is cross-site; catalog tests pin each one. */
export const CROSS_SITE_EXCLUDED_TOOLS: Readonly<Record<string, string>> = {
  comments_get_provider: 'The provider selection and its readiness come from the active process\'s installed provider adapters; a peer has no provider registry, so a vendor selection would read as wrong data.',
  // No cross-site caller needs these (checked 2026-10-27); a per-key filter would have to track every provider/credential key.
  settings_get_raw: 'Settings hold provider configuration (core.comments.provider, core.mail.provider); another site\'s provider setup is not readable from here.',
  settings_get_effective: 'Settings hold provider configuration (core.comments.provider, core.mail.provider); another site\'s provider setup is not readable from here.',
};

/** A dependency omitted by peer composition must fail visibly, never fall back to active data. */
export class CrossSiteUnavailable extends ToolInputError {
  readonly field: string;
  constructor(field: string) {
    super({ message: `This read needs ${field}, which isn't available for another site.` });
    this.field = field;
    this.name = 'CrossSiteUnavailable';
  }
}

/** Poison every operation except promise assimilation, which must terminate immediately.
 * @param required.field - Dependency name only, never a path.
 * @returns A callable poison; property access/call/construction throws CrossSiteUnavailable.
 * @complexity O(1).
 */
function unavailable({ field }: { field: string }, _options = {}): never {
  // A normal function remains constructible, so `new poison()` reaches the same refusal trap.
  function fail(): never { throw new CrossSiteUnavailable(field); }
  return new Proxy(fail, {
    get: (_target, key) => key === 'then' ? undefined : fail(),
    apply: fail, construct: fail,
  }) as never;
}

type PeerBag = {
  deps: AssistantToolRegistryDeps;
  principal: Principal;
  registrations: Map<string, ToolRegistration>;
  usedAt: number;
  busy: number;
  timer?: ReturnType<typeof setTimeout>;
  close(): Promise<void>;
};

/** Refuse directory/blob symlinks escaping the target's own tree before any file read.
 * @returns The canonical path. @throws ToolInputError with path-free text on escape.
 * @complexity O(depth) filesystem resolution, no directory traversal.
 */
function confinedPath({ root, file }: { root: string; file: string }, _options = {}): string {
  const canonical = fs.realpathSync(file);
  const relative = path.relative(fs.realpathSync(root), canonical);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ToolInputError({ message: 'This site has files outside its local folder.' });
  }
  return canonical;
}

/** Theme discovery itself reads files before individual theme handlers can apply containment.
 * Reject symlinks in the peer tree, including engine roots and manifest/template files, so discovery
 * cannot expose another site's files. Rechecked on roster access because other processes edit themes.
 * @returns void. @throws ToolInputError on an escaping root or any linked file/directory.
 * @complexity O(f) directory entries for f theme files; native recursive enumeration never follows symlinks.
 */
function assertPeerThemes({ siteDir, themesDir }: { siteDir: string; themesDir: string }, _options = {}): void {
  if (!fs.existsSync(themesDir)) return;
  confinedPath({ root: siteDir, file: themesDir });
  if (fs.readdirSync(themesDir, { withFileTypes: true, recursive: true }).some(entry => entry.isSymbolicLink())) {
    throw new ToolInputError({ message: 'Linked theme files cannot be read from another site.' });
  }
}

/** Build only plain repositories over borrowed, read-only handles. No boot/seed/migration services.
 * @param required - Target paths, checked schema, owner and open kernels.
 * @returns A fail-closed dependency bag for the existing domain builders.
 * @throws CrossSiteUnavailable on use of an omitted dependency; filesystem/SQL errors propagate to the resolver.
 * @complexity O(r + t) wiring for r repositories and t discovered theme files; no per-record SQL fan-out.
 */
async function composePeer({ source, contentDbPath, kernel, chat, journal, introspection, ownerId, workspaceId }: {
  contentDbPath: string;
  source: RegisteredSiteSource; kernel: ReturnType<typeof openSqliteFileKernel<ContentDatabase>>;
  chat: ReturnType<typeof openNativeSqlite>; journal: ReturnType<typeof openSqliteFileKernel<JournalDatabase>>;
  introspection: SqliteDatabaseIntrospectionAdapter; ownerId: string; workspaceId: string;
}, _options = {}): Promise<AssistantToolRegistryDeps> {
  const systemClock = createSystemClock(), idGen = createRandomUuidGenerator();
  const clock = { ...systemClock, nowIso: () => nowIso({ clock: systemClock }) };
  const identity = createSqliteIdentityRouteDeps({ db: kernel, workspaceId, clock, idGen,
    ownerCredentials: DEFAULT_OWNER_CREDENTIALS, permissionGrants: createAppPermissionGrants({}),
    reconcileGrantsOnBoot: false, readOnlyOwnerPrincipalId: ownerId }, { apiKeyRepo: unavailable({ field: 'apiKeyRepo' }) });
  await identity.identityReady;
  const postRepo = new SqlitePostRepo(kernel), settingsRepo = new SqliteSettingsRepo(kernel);
  const presentationRepo = new SqlitePresentationSettingsRepo(kernel);
  const entryRefsRepo = new SqliteEntryRefsRepo(kernel), mediaRepo = new SqliteMediaRepo(kernel);
  const mediaContentTypeStore = new SqliteMediaContentTypeStore(kernel);
  const transformDefinitionRepo = new SqliteTransformDefinitionRepo(kernel);
  const originRegistry = new OriginRegistry({ repo: new SqliteOriginSettingRepo(kernel) });
  const themesDir = path.join(source.dir, 'themes'), uploadsDir = path.join(source.dir, 'uploads');
  for (const file of [themesDir, uploadsDir]) if (fs.existsSync(file)) confinedPath({ root: source.dir, file });
  assertPeerThemes({ siteDir: source.dir, themesDir });
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: 'built-in' });
  const blobs = new LocalFsBlobStore({ rootDir: uploadsDir });
  // Reuse the SQLite adapter's capability answer without granting its backup/restore effects.
  const dbOps = new SqliteDbOpsAdapter({ connection: { backup: unavailable({ field: 'dbOps.captureRestorePoint' }) },
    filePath: contentDbPath, readWatermark: unavailable({ field: 'dbOps.readWatermark' }) });
  const trashRepo = new SqliteTrashRepo(kernel);
  const formDeliveryRepo = new SqlFormDeliveryRepo({ kernel });
  const seoDeps = createSeoDeps({ deps: { postRepo, settingsRepo, mediaRepo, mediaContentTypeStore, transformDefinitionRepo, originRegistry, clock } }, {});
  const bag = {
    ...identity, contentKernel: kernel, workspaceId, clock, idGen, settingsRepo, getEffective,
    // Optional build-time settings are explicit so builders don't iterate a poison value.
    extraDeniedSettings: [], settingsUiTabsReady: Promise.resolve(), settingsReady: Promise.resolve(), siteTitleReady: Promise.resolve(),
    peerSiteReads: undefined, isSiteSwitcherEnabled: () => false, devRestart: null,
    postRepo, postSearch: postSearchIndexFor(kernel), entryRefsRepo,
    pagesHtmlStore: (scope: Parameters<AssistantToolRegistryDeps['pagesHtmlStore']>[0], options: Parameters<AssistantToolRegistryDeps['pagesHtmlStore']>[1] = {}) => new PagesHtmlDocumentStore(scope, { ...options, db: kernel, clock, entryRefsRepo, revisions: postRepo }),
    mediaRepo, assetBlobRepo: new SqliteAssetBlobRepo(kernel), assetRenditionRepo: new SqliteAssetRenditionRepo(kernel), mediaContentTypeStore, transformDefinitionRepo,
    imageCodec: new SharpImageTransformer(),
    // Only read capabilities are exposed; neither a stray blob write nor an escaping stored key can reach disk.
    blobStore: {
      get: async ({ storageKey }: { storageKey: string }) => {
        confinedPath({ root: source.dir, file: uploadsDir });
        confinedPath({ root: uploadsDir, file: path.join(uploadsDir, storageKey) });
        return blobs.get({ storageKey });
      },
      exists: async ({ storageKey }: { storageKey: string }) => {
        if (fs.existsSync(uploadsDir)) confinedPath({ root: source.dir, file: uploadsDir });
        if (!fs.existsSync(path.join(uploadsDir, storageKey))) return false;
        confinedPath({ root: uploadsDir, file: path.join(uploadsDir, storageKey) });
        return blobs.exists({ storageKey });
      },
      sizeOf: async ({ storageKey }: { storageKey: string }) => {
        if (fs.existsSync(uploadsDir)) confinedPath({ root: source.dir, file: uploadsDir });
        if (!fs.existsSync(path.join(uploadsDir, storageKey))) return null;
        confinedPath({ root: uploadsDir, file: path.join(uploadsDir, storageKey) });
        return blobs.sizeOf({ storageKey });
      },
      put: unavailable({ field: 'blobStore.put' }), putIfAbsent: unavailable({ field: 'blobStore.putIfAbsent' }), delete: unavailable({ field: 'blobStore.delete' }),
    },
    // The existing factories borrow their connection; construction/get/history reads never write.
    workspaceRepo: new SqliteWorkspaceRepo(kernel), chatHistory: createChatStoreFactory(chat),
    formDefinitionRepo: new SqliteFormDefinitionRepo(kernel), formSubmissionRepo: new SqliteFormSubmissionRepo(kernel),
    // Status reads only (the repo's plan-once write stays unreachable), over the peer's own outbox rows;
    // the handler scopes them to the peer workspaceId above, and rows carry ids and safe codes, never answers.
    formDeliveryStatus: { forSubmission: formDeliveryRepo.forSubmission.bind(formDeliveryRepo), recentUnfinished: formDeliveryRepo.recentUnfinished.bind(formDeliveryRepo) },
    taxonomyRepo: new SqliteTaxonomyRepo({ db: kernel, workspaceId }), termRepo: new SqliteTermRepo({ db: kernel, workspaceId }),
    entryTermRepo: new SqliteEntryTermRepo({ db: kernel, workspaceId }), taxonomyRevisionRepo: new SqliteTaxonomyRevisionRepo({ db: kernel, workspaceId }),
    menuRepo: new SqliteMenuRepo(kernel), navLocationBindingRepo: new SqliteNavLocationBindingRepo(kernel),
    entryRepo: new SqliteEntryRepo(kernel), contentTypeRepo: new SqliteContentTypeRepo(kernel),
    themesDir, get themes() { assertPeerThemes({ siteDir: source.dir, themesDir }); return themes; },
    // Preview-switcher reads the peer preference through the existing resolver; expose no writer.
    presentationRepo: { findByWorkspaceId: presentationRepo.findByWorkspaceId.bind(presentationRepo),
      save: unavailable({ field: 'presentationRepo.save' }), listAll: unavailable({ field: 'presentationRepo.listAll' }) },
    // Use the renderer's resolver over the peer's read-only settings, never the active site's closure.
    resolveActiveThemeId: () => resolveActiveThemeId({ presentationRepo, workspaceId }),
    commentRepo: new SqliteCommentRepo({ store: kernel }, {}), commentsReady: Promise.resolve(), commentsSettingsReady: Promise.resolve(),
    memberRepo: new SqliteMemberRepo(kernel), memberTierRepo: new SqliteMemberTierRepo(kernel), memberSubscriptionRepo: new SqliteMemberSubscriptionRepo(kernel),
    newsletterReady: Promise.resolve(), newsletterCampaignRepo: new SqliteNewsletterCampaignRepo(kernel), newsletterListRepo: new SqliteNewsletterListRepo(kernel),
    newsletterSubscriptionRepo: new SqliteNewsletterSubscriptionRepo(kernel), newsletterAudienceSnapshotRepo: new SqliteNewsletterAudienceSnapshotRepo(kernel), newsletterSendRepo: new SqliteNewsletterSendRepo(kernel),
    redirectRepo: SqliteRedirectRepo({ store: kernel }, {}), originRegistry, seoDeps, seoReady: Promise.resolve(),
    // redirects_list hides Trashed rules (03fb27a27) by reading the PEER's Trash rows; every write stays poisoned.
    redirectsWriteDeps: readsOnly({ field: 'redirectsWriteDeps', reads: { isInTrash: async ({ workspaceId: id, id: entityId }: { workspaceId: string; id: string }) =>
      (await trashRepo.findByEntity({ workspaceId: id, entityType: REDIRECT_ENTITY_TYPE, entityId })) !== null } }),
    widgetBindingRepo: new SqliteWidgetRegionBindingRepo(kernel), changeSets: new SqliteChangeSetRepo(kernel),
    registry: buildTrashRegistry(), trash: { list: trashRepo.list.bind(trashRepo) },
    databaseIntrospection: introspection, dbOps: { getCapabilities: dbOps.getCapabilities.bind(dbOps) },
    gatedMutations: { gatewayDeps: buildGatewayDeps({ clock, idGen, authorize: identity.authorize,
      authorizeInstance: buildOwnerOnlyInstanceAuthorize({ ownerPrincipalId: identity.ownerPrincipalId }), tokens: unavailable({ field: 'gatedMutations.tokens' }) }) },
    databaseLedgerRepo: new SqliteDatabaseLedgerRepo({ db: journal, siteId: workspaceId }),
    migrationRunsRepo: new SqliteMigrationRunsRepo({ db: journal, siteId: workspaceId }),
    restorePointsRepo: new SqliteRestorePointsRepo({ db: journal, siteId: workspaceId }),
  };
  // Spreading active deps would let a read silently return the ACTIVE site's data under another site's label.
  return new Proxy(bag, { get: (target, field, receiver) => {
    if (Reflect.has(target, field)) return Reflect.get(target, field, receiver);
    return field === 'then' ? undefined : unavailable({ field: String(field) });
  } }) as unknown as AssistantToolRegistryDeps;
}

/** A peer port that exposes only the named reads; every other member is a CrossSiteUnavailable poison.
 * @complexity O(1) per access. */
function readsOnly({ field, reads }: { field: string; reads: Record<string, unknown> }, _options = {}): never {
  return new Proxy(reads, { get: (target, key) => {
    if (Reflect.has(target, key)) return Reflect.get(target, key);
    return key === 'then' ? undefined : unavailable({ field: `${field}.${String(key)}` });
  } }) as never;
}

/** Reject invalid cache bounds before registry access or database opens. O(1). */
function validatePeerCacheBounds({ maxSites, idleMs }: { maxSites: number; idleMs: number }, _options = {}): void {
  if (!Number.isInteger(maxSites) || maxSites < 1 || !Number.isFinite(idleMs) || idleMs <= 0) throw new TypeError('Invalid peer cache bounds');
}

/** Resolve safe registry names and cache at most maxSites write-free peer bags.
 * @param required.currentSiteDir - The boot-selected active site, never request input.
 * @param optional - Workspace/open/clock/timer ports and small LRU bounds for hermetic tests.
 * @returns A resolver whose close releases all handles and idle timers.
 * @throws ToolInputError with fixed, path-free refusals for unavailable peers or behind schemas.
 * @complexity O(n + t + f) per cold resolution for n registered sites, t tools and f theme files; warm lookup is O(n).
 * @example createPeerSiteReads({ currentSiteDir }, { workspace, localHost: true });
 */
export function createPeerSiteReads({ currentSiteDir }: { currentSiteDir: string }, {
  workspace, localHost = isLocalTovuHost({}, {}), openContent = openSqliteFileKernel, openChat = openNativeSqlite,
  maxSites = 3, idleMs = 5 * 60_000, now = Date.now, schedule = setTimeout,
}: { workspace?: SitesWorkspace; localHost?: boolean; openContent?: typeof openSqliteFileKernel; openChat?: typeof openNativeSqlite;
  maxSites?: number; idleMs?: number; now?: () => number; schedule?: typeof setTimeout } = {}): PeerSiteReads {
  validatePeerCacheBounds({ maxSites, idleMs });
  const cache = new Map<string, PeerBag>();
  const running = new Set<Promise<unknown>>();
  let closed = false;
  // Serialize cold opens, evictions and close: concurrent first reads must not create duplicate bags.
  let pending: Promise<unknown> = Promise.resolve();
  // Lazy workspace resolution keeps registry/filesystem access behind the adapter's owner gate.
  const catalog = () => (workspace ??= createSitesWorkspace({}));
  const assertLocal = () => {
    if (!localHost) throw new ToolInputError({ message: 'Reading another site needs a local Tovu host.' });
  };
  const isCurrentSite: PeerSiteReads['isCurrentSite'] = ({ siteName }) => {
    assertLocal();
    try {
      return catalog().registry({}).list({}).some(entry => {
        if (entry.name !== siteName) return false;
        try { return fs.realpathSync(entry.path) === fs.realpathSync(currentSiteDir); } catch { return false; }
      });
    } catch { throw new ToolInputError({ message: 'The local site registry cannot be read.' }); }
  };
  /** Close an evicted/idle entry exactly once. @complexity O(1), at most three handles. */
  const remove = async (key: string, entry: PeerBag) => {
    if (cache.get(key) !== entry || entry.busy) return;
    cache.delete(key);
    clearTimeout(entry.timer);
    await entry.close();
  };
  /** Reset an unref'd idle timer; an injected clock can also expire entries on the next resolve. */
  const touch = (key: string, entry: PeerBag) => {
    entry.usedAt = now();
    cache.delete(key); cache.set(key, entry);
    clearTimeout(entry.timer);
    entry.timer = schedule(() => {
      pending = pending.then(() => remove(key, entry)).catch(() => {});
    }, idleMs);
    entry.timer.unref();
  };
  /** Open and compose one read-only peer; failed provisional opens close all acquired handles.
   * @complexity O(t + f) for t registrations and f theme files, plus bounded schema/owner reads. */
  const openPeer = async ({ source, paths, request }: {
    source: RegisteredSiteSource;
    paths: ReturnType<typeof resolveSiteDatabasePaths>;
    request: Parameters<PeerSiteReads['resolve']>[0];
  }, _options = {}): Promise<PeerBag> => {
    const kernel = openContent<ContentDatabase>(paths.contentDbPath, { readOnly: true });
    let chat: ReturnType<typeof openChat> | undefined, journal: ReturnType<typeof openContent<JournalDatabase>> | undefined;
    try {
      const introspection = new SqliteDatabaseIntrospectionAdapter({ db: kernel, dbPath: paths.contentDbPath });
      const schema = await introspection.getSchemaState(), pendingMigrations = await introspection.listPendingMigrations();
      if (schema.status === 'behind' || pendingMigrations.items.length > 0) throw new ToolInputError({ message: `Open ${source.name} in Tovu once to upgrade it.` });
      if (schema.status !== 'in-sync') throw new ToolInputError({ message: 'This site has an unsupported database schema. Open it in Tovu first.' });
      const workspaceId = (await resolveWorkspace({ kernel })).id;
      // Users are site-local: never reuse the caller's principal or infer ownership from username/email.
      const owners = await kernel.query<{ principal_id: string }>(sql`SELECT DISTINCT u.principal_id
        FROM identity_users u JOIN principal_roles pr ON pr.principal_id=u.principal_id AND pr.workspace_id=u.workspace_id
        JOIN roles r ON r.id=pr.role_id AND r.workspace_id=pr.workspace_id
        WHERE u.workspace_id=${workspaceId} AND r.name='owner' LIMIT 2`);
      if (owners.length !== 1) throw new ToolInputError({ message: 'The target site must have exactly one owner to read it.' });
      if (!fs.existsSync(paths.chatDbPath)) throw new ToolInputError({ message: "This site's chat database is missing. Open the site in Tovu first." });
      const chatOptions = { readonly: true, fileMustExist: true, timeout: 5000 };
      chat = openChat(paths.chatDbPath, chatOptions);
      const journalPath = path.join(path.dirname(paths.contentDbPath), 'ops', 'database-journal.db');
      if (!fs.existsSync(journalPath)) throw new ToolInputError({ message: "This site's database journal is missing. Open the site in Tovu first." });
      journal = openContent<JournalDatabase>(journalPath, { readOnly: true });
      const deps = await composePeer({ source, contentDbPath: paths.contentDbPath, kernel, chat, journal, introspection, ownerId: owners[0]!.principal_id, workspaceId });
      const registrations = new Map(request.buildRegistrations(deps).filter(registration => isReadOnlyTool({ descriptor: registration.descriptor })).map(registration => [registration.descriptor.id, registration]));
      const peerChat = chat, peerJournal = journal;
      const entry: PeerBag = { deps, registrations, usedAt: now(), busy: 0, principal: constrainPrincipalToReadOnlyTools({ principal: { id: owners[0]!.principal_id } }),
        close: async () => { try { peerChat.close(); } finally { try { await peerJournal?.close(); } finally { await kernel.close(); } } } };
      return entry;
    } catch (error) {
      await Promise.allSettled([Promise.resolve().then(() => chat?.close()), journal?.close(), kernel.close()]);
      throw error;
    }
  };
  /** Expire idle bags, then evict the least recently used idle bag only for a cold open. O(cache size). */
  const cachedOrMakeRoom = async ({ key }: { key: string }, _options = {}): Promise<PeerBag | undefined> => {
    for (const [id, entry] of cache) if (now() - entry.usedAt >= idleMs) await remove(id, entry);
    const entry = cache.get(key);
    if (entry) return entry;
    while (cache.size >= maxSites) {
      const candidate = [...cache].find(([, bag]) => bag.busy === 0);
      if (!candidate) throw new ToolInputError({ message: 'Other-site reads are busy. Try again.' });
      const [id, oldest] = candidate;
      await remove(id, oldest);
    }
    return undefined;
  };
  const resolve: PeerSiteReads['resolve'] = required => {
    const work = pending.then(async () => {
      assertLocal();
      if (closed) throw new ToolInputError({ message: 'Cross-site reads are closed.' });
      try {
        if (isCurrentSite({ siteName: required.siteName })) return 'current' as const;
        const active = resolveSiteDatabasePaths({ dir: currentSiteDir }, { workspace: catalog(), reserveIdentity: false });
        const matches = registeredSources({ workspace: catalog(), targetSiteId: active.siteId, targetSiteDir: currentSiteDir, targetFile: active.contentDbPath }).filter(source => source.name === required.siteName);
        if (matches.length !== 1) throw new ToolInputError({ message: 'No readable local site has that name. Use sites_list to find a site.' });
        const source = matches[0]!;
        if (resolveSiteStorage(source.dir).kind !== 'sqlite') throw new ToolInputError({ message: 'Only local SQLite sites can be read.' });
        const paths = resolveSiteDatabasePaths({ dir: source.dir }, { workspace: catalog(), reserveIdentity: false });
        const key = `${source.siteId}:${paths.contentDbPath}`;
        let entry = await cachedOrMakeRoom({ key });
        if (!entry) {
          entry = await openPeer({ source, paths, request: required });
          cache.set(key, entry);
        }

        touch(key, entry);
        const registration = entry.registrations.get(required.toolId);
        if (!registration) throw new ToolInputError({ message: "This tool can't read another site." });
        const selected = entry;
        return { principal: entry.principal, site: source, handler: async (ctx: ToolExecutionContext, optional?: ToolExecutionOptions) => {
          if (closed || cache.get(key) !== selected) throw new ToolInputError({ message: 'This site read expired. Try again.' });
          selected.busy++;
          clearTimeout(selected.timer);
          // Track the entire handler lifetime so close/idle/eviction cannot interrupt an active read.
          const read = Promise.resolve().then(registration.handler.bind(registration, ctx, optional));
          running.add(read);
          try { return await read; }
          finally { running.delete(read); selected.busy--; if (!closed) touch(key, selected); }
        } };
      } catch (error) {
        if (error instanceof ToolInputError) throw error;
        // SQLite/config errors may contain private paths; expose only a fixed refusal to the model.
        throw new ToolInputError({ message: 'This site cannot be read. Open it in Tovu and try again.' });
      }
    });
    pending = work.catch(() => {});
    return work;
  };
  return { readDomains: CROSS_SITE_READ_DOMAINS, excludedReadTools: new Set(Object.keys(CROSS_SITE_EXCLUDED_TOOLS)), isCurrentSite, resolve,
    async close() { closed = true; await pending; await Promise.allSettled([...running]); await Promise.all([...cache].map(([key, entry]) => remove(key, entry))); },
  };
}
