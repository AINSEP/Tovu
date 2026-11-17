import { existsSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { isInMemoryDbPath } from "#src/features/plugins/snapshot";
// Path reads must not initialize the site registry or database adapters.
import { resolveProductRoot } from "#src/platform/site-dir/product-root";
import { resolveSiteRoot } from "#src/platform/site-dir/site-root";
import { resolveSiteDatabasePaths, resolveSiteDirForDatabase } from "#src/platform/site-dir/site-databases";
import type { SiteStoragePaths } from "../../routes/types.js";
import { resolveChatAttachmentUploadDirectory } from "../../inbound/assistant/chat-attachment-directory.js";

/**
 * The one site folder this process serves — the root every other runtime path below derives from.
 *
 * Replaces the old `infra/` convention (2026-08-27). `infra/` conflated two different things: the
 * repo's own scratch space, and the SITE's data. They have opposite lifecycles — upgrading Tovu
 * should replace the first and never touch the second — and keeping them in one directory is why
 * a site's themes ended up living inside the package (`src/themes/`), where an upgrade destroys
 * them along with their own "reset to original" backups.
 *
 * A site is a portable folder that owns its own `content.db`, `uploads/`, `themes/`, and journals
 * — ADR-012's install-dir model, already implemented for the CLI by SPEC-003's `tovu init` /
 * `tovu serve <dir>` (`site-dir/boot-site-dir.ts`). This function is that same model's DEFAULT for
 * the non-CLI boot path (`src/index.ts`), which previously had no site folder at all and derived
 * everything from `process.cwd()`.
 *
 * A thin `process`-reading wrapper, not the rule itself: {@link resolveSiteRoot} (`site-dir/`) owns
 * the `TOVU_SITE_DIR` / `TOVU_SITE` precedence, because `features/skills/layout.ts` and
 * `features/agent-plugins/layout.ts` need the same answer and must not import this composition
 * root to get it. Every `TOVU_*_DIR` below still overrides its own subpath independently, so a
 * deployment that relocates exactly one directory (a large uploads volume, say) does not have to
 * move the rest.
 */
export function siteDir(): string {
  return resolveSiteRoot();
}

/**
 * The optional inputs every `<site>/...` path resolver below shares. `env` defaults to
 * `process.env`; injectable so the `TOVU_*_DIR` precedence is testable without mutating the test
 * runner's own environment. Each resolver's `siteDir` input is the site the caller is serving: the
 * composition root passes its booted `siteBinding.dir`, never {@link siteDir}, because the two
 * differ for any composition that does not also pin `TOVU_SITE_DIR` (see
 * {@link resolveExportOutputRootDir}).
 */
export interface SitePathResolverOptional {
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Root directory `LocalFsBlobStore` writes blob bytes under (ADR-012 `uploads/` convention,
 * mirroring `defaultContentDbPath()` below).
 *
 * `optional.siteDir` defaults to {@link siteDir} — this process's env/cwd site — for the callers
 * outside a composition root that have no booted site in hand. `deployment-overview.ts` used to be
 * one; it now reads `RouteDeps.siteStoragePaths` ({@link resolveSiteStoragePaths}) instead. The
 * composition root passes its booted `siteBinding.dir`.
 */
export function mediaUploadsDir(optional: SitePathResolverOptional & { siteDir?: string } = {}): string {
  // Sibling of `defaultContentDbPath()`'s `<site>/content.db` — both now derive from the same
  // {@link siteDir}. Note this one is NOT derived from `dirname(contentDbPath)`, so a deployment
  // that overrides `TOVU_CONTENT_DB` alone still leaves uploads here; that independence is why
  // `uploads/` was historically the one runtime directory that did not follow the database
  // automatically, and it is preserved deliberately.
  const env = optional.env ?? process.env;
  return env.TOVU_MEDIA_UPLOADS_DIR ?? join(optional.siteDir ?? siteDir(), "uploads");
}

/**
 * The read-only STOCK themes tree that ships with the product: `content/themes/`, copied to
 * `dist/content/themes/` at build time (mirrors `content/templates/` -> `dist/content/templates/`)
 * and resolved package-relative to this file — never `process.cwd()` (CR-R04 fix: `tovu serve` used
 * to read `process.cwd()/themes`, which is wrong whenever the CLI is invoked from outside the repo
 * checkout).
 *
 * Walks up to find the product root rather than counting `../` segments — see `product-root.ts`'s
 * header for why a fixed count can't be correct in both the source and compiled trees after the
 * 2026-08-28 `apps/website/` rename (this file's own source and compiled locations are no longer
 * the same number of levels from `content/`, only the compiled one used to be assumed here).
 *
 * SEED SOURCE ONLY as of 2026-08-27. Nothing serves or writes this tree at runtime any more —
 * `RouteDeps.themesDir` is {@link siteThemesDir}, and `seedSiteThemes()` copies this into a site
 * once, on the first boot where the site has no `themes/` of its own. That split is the whole point
 * of the `infra/` -> `sites/` move: an upgrade replaces `src/` (and therefore this tree), so a
 * site's edited themes and their `__original-themes__/` backups cannot live here.
 *
 * The env var is `TOVU_STOCK_THEMES_DIR`, NOT `TOVU_THEMES_DIR` — the latter moved to
 * {@link siteThemesDir}, where "where MY themes live" is what an operator setting it actually
 * means.
 */
export function builtInThemesDir(): string {
  return process.env.TOVU_STOCK_THEMES_DIR ?? join(resolveProductRoot({}), "content", "themes");
}

/**
 * `TOVU_EXPORT_DIR` env, then `<site>/out/export` — the static-site export engine's default output
 * directory root. Build OUTPUT, grouped under the site's `out/` so it is visibly regenerable and
 * never confused with the site's own source data (`content.db`, `uploads/`, `themes/`).
 * Read ONCE here (mirrors `siteThemesDir()`/`mediaUploadsDir()` immediately
 * above) rather than re-read deep in `features/deployments/export-run.ts` (the admin route's export
 * trigger + the `deployment_trigger_export` agent tool) or `cli/commands/export.ts` (`tovu export`)
 * — both now read `RouteDeps.exportOutputRootDir` instead, which this function feeds in both
 * composition roots (`apps/website/src/server/runtime/composition/app.ts`'s `createRouteDeps()` and this file's
 * `createSiteRouteDeps()`). See `routes/types.ts`'s `exportOutputRootDir` doc for the full
 * reasoning.
 *
 * `required.siteDir` is the site being served, not {@link siteDir}: `createSiteRouteDeps` passes
 * its booted `siteBinding.dir`. It used to call `siteDir()` here, the `TOVU_SITE_DIR` env var or
 * `<cwd>/sites/<name>`, which only `tovu serve` pins. Any other composition (`tovu export <dir>`,
 * a programmatic `createSiteRouteDeps` with an explicit `siteBinding`) wrote an admin-triggered
 * export under whatever site the working directory named, possibly another site's folder.
 */
export function resolveExportOutputRootDir(required: { siteDir: string }, optional: SitePathResolverOptional = {}): string {
  const env = optional.env ?? process.env;
  return env.TOVU_EXPORT_DIR !== undefined ? resolve(env.TOVU_EXPORT_DIR) : join(required.siteDir, "out", "export");
}

/**
 * `TOVU_SOURCE_CONTROL_EXPORT_DIR` env, then `<site>/out/source-control-export` — the
 * `source-control` domain's own export scratch directory, deliberately separate from
 * {@link resolveExportOutputRootDir} above so a static-site export and a source-control commit
 * export never race over the same on-disk output (see `features/source-control/commit-site.ts`'s
 * header). Read ONCE here, same reasoning (and same served-site `required.siteDir`) as
 * {@link resolveExportOutputRootDir}.
 */
export function resolveSourceControlExportRootDir(required: { siteDir: string }, optional: SitePathResolverOptional = {}): string {
  const env = optional.env ?? process.env;
  return env.TOVU_SOURCE_CONTROL_EXPORT_DIR !== undefined
    ? resolve(env.TOVU_SOURCE_CONTROL_EXPORT_DIR)
    : join(required.siteDir, "out", "source-control-export");
}

/**
 * `TOVU_PUBLISH_DIR` env, then `<site>/out/publish` — the static-publish flow's parent output
 * directory; each target gets its own subdirectory under it (see
 * `features/deployments/static-publish/adapter.ts`'s `publishOutputDir`). Read ONCE here, same
 * reasoning (and same served-site `required.siteDir`) as {@link resolveExportOutputRootDir}.
 */
export function resolvePublishOutputRootDir(required: { siteDir: string }, optional: SitePathResolverOptional = {}): string {
  const env = optional.env ?? process.env;
  return env.TOVU_PUBLISH_DIR !== undefined ? resolve(env.TOVU_PUBLISH_DIR) : join(required.siteDir, "out", "publish");
}

/**
 * @file SQLite-backed composition of route dependencies.
 *
 * Purpose:
 * Builds the same `RouteDeps` shape the in-memory path produces, but with the
 * three feature repos backed by a persistent content.db.
 *
 * How it relates to the project:
 * - Used by the process entrypoint (`index.ts`) for the running server.
 * - Tests keep using the in-memory default in `apps/website/src/server/runtime/composition/app.ts` (hermetic).
 *
 * Note: outbox + event bus remain in-memory for now (events are fire-on-write
 * side effects, not yet durable across restarts) — a durable outbox is a later
 * slice. Persistence here covers the content model (workspaces/posts/themes).
 */
export function defaultContentDbPath(): string {
  // `sites/<name>/content.db` (2026-08-27), via {@link siteDir}. Was `infra/content.db`, and before
  // that the bare working directory. ADR-012's model is unchanged — a site is a portable folder
  // owning its own content/assets — but the *default* names a real site rather than shared
  // scratch space. Database journals/snapshots follow content.db into data.nosync or app-data;
  // uploads/chat-attachments stay under the site root. A deployment passes an explicit dir, and `TOVU_CONTENT_DB` still
  // overrides this outright. ABSOLUTE now, where the old `join("infra", "content.db")` was relative.
  return assertContentDbFileName({ dbPath: process.env.TOVU_CONTENT_DB ?? resolveSiteDatabasePaths({ dir: siteDir() }).contentDbPath });
}

/**
 * The database folder is the site's identity: chat.db, ops/database-journal.db and ops/shares sit
 * beside content.db, so two databases in one folder would share all three (design 2026-10-27 I-A).
 * Placement only ever names the file content.db; this refuses the legacy paths that do not.
 * @throws When a file database is named anything but `content.db`.
 */
export function assertContentDbFileName({ dbPath }: { dbPath: string }, _optional = {}): string {
  // Only the driver's own in-memory names: better-sqlite3 opens with URI interpretation off, so
  // `file:a.db?mode=memory` is a real disk file and gets the content.db rule like any other path.
  if (dbPath === ":memory:" || dbPath === "") return dbPath;
  if (!dbPath.startsWith("file:") && basename(dbPath) === "content.db") return dbPath;
  throw new Error(`Give each database its own folder, named content.db: move ${dbPath} to <its own folder>/content.db and point TOVU_CONTENT_DB at that file.`);
}

/**
 * `RouteDeps.siteStoragePaths`: the served site's storage locations, from the SAME `dbPath` this root
 * opened and the SAME uploads root its blob store writes under, so a request handler never
 * re-derives them from `defaultContentDbPath()`/{@link siteDir} — the env/cwd site, which is not
 * necessarily this composition's `siteBinding.dir` (hardwiring audit #19).
 *
 * An in-memory `dbPath` (`:memory:`, tests) has no directory to anchor chat attachments to, so they
 * fall back to `<siteDir>/content.db`'s directory — the served site's own folder, never the cwd.
 *
 * @complexity O(1).
 */
export function resolveSiteStoragePaths(
  required: { contentDbPath: string; siteDir: string; uploadsDir: string },
  optional: SitePathResolverOptional = {}
): SiteStoragePaths {
  // Uploads/attachments stay in the site even when the database moves to app-data.
  const anchor = join(required.siteDir, "content.db");
  return {
    contentDbPath: required.contentDbPath,
    mediaUploadsDir: required.uploadsDir,
    chatAttachmentsDir: resolveChatAttachmentUploadDirectory({ contentDbPath: anchor }, optional),
  };
}

/**
 * Agent Plugins that ship WITH the product: `content/agent-plugins/`, or the composed root
 * `TOVU_BUNDLED_AGENT_PLUGINS_DIR` names. Defined beside {@link resolveProductRoot} in
 * `platform/site-dir/product-root.ts` (the full why lives there) so features and the CLI can call
 * the same owner without importing this composition root; re-exported here so every product path
 * stays listed in one file.
 */
export { bundledAgentPluginsDir } from "#src/platform/site-dir/product-root";

/**
 * Tovu's host overlays for portable Agent Plugins: `content/agent-plugin-overlays/<pluginId>/`
 * (`GUIDANCE.md` plus `host/*.md`), copied to `dist/content/agent-plugin-overlays/` at build time and
 * resolved package-relative like {@link bundledAgentPluginsDir} above; `TOVU_AGENT_PLUGIN_OVERLAYS_DIR`
 * overrides. Product-shipped, read-only, never site data. Defined in the feature that reads it
 * (`features/agent-plugins/host-plugin-guidance.ts`) because the module-level lifecycle binding has no
 * composition root to receive it from; re-exported here so every product path stays listed in one file.
 */
export { agentPluginOverlaysDir } from "#src/features/agent-plugins/host-plugin-guidance";

/**
 * `TOVU_THEMES_DIR` env, then `<site>/themes` — the site's OWN themes root, and the only theme tree
 * anything reads or writes at runtime (`RouteDeps.themesDir`: the Theme Studio's file editor, the
 * agent theme tools, `__original-themes__/` resets, and both static-asset
 * mounts in `apps/website/src/server/runtime/composition/app.ts`).
 *
 * Seeded from {@link builtInThemesDir} on a site's first boot — see `seedSiteThemes()`'s own header
 * for why that copies the whole ~19MB tree rather than filling in on demand.
 *
 * `optional.siteDir` defaults to {@link siteDir}, same split as {@link mediaUploadsDir}.
 */
export function siteThemesDir(optional: SitePathResolverOptional & { siteDir?: string } = {}): string {
  const env = optional.env ?? process.env;
  return env.TOVU_THEMES_DIR ?? join(optional.siteDir ?? siteDir(), "themes");
}

/**
 * The read-only STOCK content seed a self-hosted container image ships for one specific site:
 * `content/seed-sites/<site>/content.seed.db`, copied there — from the tracked
 * `sites/<site>/content.seed.db` (`npm run seed:site`, development/scripts/seed-site.mjs) — by the
 * Dockerfile's OWN build stage only, deliberately never by the shared `npm run build` that
 * {@link builtInThemesDir} above also relies on: that script also produces the npm-publishable CLI
 * package, which must ship blank starter content, not this owner's own pruned site.
 *
 * SEED SOURCE ONLY, same split as {@link builtInThemesDir}/{@link siteThemesDir}:
 * `hydrateContentDbFromSeed()` copies this into {@link defaultContentDbPath} once, on a site's first
 * boot where `content.db` does not exist yet, and never again — an existing `content.db` is
 * production data, and overwriting it on a later redeploy is unrecoverable data loss. Living under
 * `content/`, not `sites/`, is what lets it survive a hosting plugin's generated volume mount over
 * `/workspace/Tovu/sites`: that mount shadows the ENTIRE image `sites/` tree at runtime, so anything
 * shipped there for a fresh volume to read would be invisible the moment the mount takes effect.
 *
 * The env var is `TOVU_STOCK_CONTENT_SEED_DIR`, mirroring `TOVU_STOCK_THEMES_DIR`'s own escape
 * hatch. `siteName` is the served site's (`siteBinding.name`) — decoupled from
 * `TOVU_CONTENT_DB`, which can relocate `content.db` itself without changing which site's stock
 * seed applies. It used to default to `basename(siteDir())`, the env/cwd site, which is a different
 * one for any composition that does not pin `TOVU_SITE_DIR` (see {@link resolveExportOutputRootDir}).
 */
export function builtInContentSeedDbPath({ siteName }: { siteName: string }, _optional = {}): string {
  const stockRoot = process.env.TOVU_STOCK_CONTENT_SEED_DIR ?? join(resolveProductRoot({}), "content", "seed-sites");
  return join(stockRoot, siteName, "content.seed.db");
}

/**
 * The read-only STOCK upload payload a self-hosted container image ships for one specific site:
 * `content/seed-sites/<site>/uploads/`, the sibling the Dockerfile's build stage now stages
 * alongside `content.seed.db` (see that file's comment at the extraction loop). Same stock root as
 * {@link builtInContentSeedDbPath} — deliberately not a second env var: the two are always shipped
 * together, at the same physical location, as one seed payload for one site.
 *
 * SOURCE ONLY, consumed by `hydrateBlobStoreFromSeed()` — see that function's own header for why it
 * tops up the live `blobStore` one content-addressed key at a time rather than copying this
 * directory wholesale the way {@link builtInThemesDir}/`seedSiteThemes()` copy `themes/`.
 */
export function builtInSeedUploadsDir({ siteName }: { siteName: string }, _optional = {}): string {
  const stockRoot = process.env.TOVU_STOCK_CONTENT_SEED_DIR ?? join(resolveProductRoot({}), "content", "seed-sites");
  return join(stockRoot, siteName, "uploads");
}



/**
 * `TOVU_PLUGINS_DIR` env, then `<site>/plugins` — the per-site root `discoverPlugins()`
 * scans for site-installed plugins (SPEC-005 REQ-02's `<install-dir>/plugins/<id>/<version>/`
 * layout; this function resolves the `<install-dir>/plugins` segment itself, matching what
 * `discoverPlugins({ installDir })`'s own fixtures pass — see `discovery.ts`'s
 * `listInstalledPluginIdFolders`, which lists `<installDir>/<id>/` directly).
 *
 * Deliberately instance-wide, not per-workspace (unlike `src/features/agent-plugins/layout.ts`'s
 * `ws/<workspaceId>/` tenant isolation, a DIFFERENT feature with its own later, separate tenancy
 * decision): SPEC-005's `plugin_activations` table is already the per-workspace boundary (REQ-07,
 * `workspaceId`+`pluginId` primary key) — an installed plugin ARTIFACT is shared across every
 * workspace on this instance, same as `siteThemesDir()`'s themes; only its enabled/disabled
 * state is workspace-scoped. Read ONCE here, same reasoning (and same served-site
 * `required.siteDir`) as {@link resolveExportOutputRootDir}.
 */
export function pluginsInstallDir(required: { siteDir: string }, optional: SitePathResolverOptional = {}): string {
  const env = optional.env ?? process.env;
  return env.TOVU_PLUGINS_DIR !== undefined ? resolve(env.TOVU_PLUGINS_DIR) : join(required.siteDir, "plugins");
}

/**
 * ADR-041 §2 — the sidecar `ops/database-journal.db` lives as a sibling of `content.db` in the
 * install-dir tree, never inside it (a physically separate SQLite file so a `content.db` restore
 * never erases the incident record narrating that very restore). Defaults to `<dirname of
 * content.db>/ops/database-journal.db`; overridable independently via `TOVU_DATABASE_JOURNAL_DB`
 * for deployments that relocate the sidecar journal on its own.
 */
export function defaultDatabaseJournalDbPath(
  _required: Record<string, never> = {},
  { contentDbPath = defaultContentDbPath() }: { contentDbPath?: string } = {}
): string {
  return process.env.TOVU_DATABASE_JOURNAL_DB ?? join(dirname(contentDbPath), "ops", "database-journal.db");
}

/**
 * `chat.db` lives as a sibling of `content.db` (ADS-memory/reports/2026-09-05-db-split-scoping.md
 * §6), for the same physical-separation reason `defaultDatabaseJournalDbPath` above exists: a
 * whole-file restore/duplicate of `content.db` must never carry (or erase) conversation history.
 * Defaults to `<dirname of content.db>/chat.db`; overridable independently via `TOVU_CHAT_DB`.
 */
export function defaultChatDbPath(
  _required: Record<string, never> = {},
  { contentDbPath = defaultContentDbPath() }: { contentDbPath?: string } = {}
): string {
  if (process.env.TOVU_CHAT_DB !== undefined) return process.env.TOVU_CHAT_DB;
  if (isInMemoryDbPath({ dbPath: contentDbPath })) return join(dirname(contentDbPath), "chat.db");
  const root = resolveSiteDirForDatabase({ dbPath: contentDbPath });
  const paths = resolveSiteDatabasePaths({ dir: root });
  return paths.contentDbPath === contentDbPath ? paths.chatDbPath : join(dirname(contentDbPath), "chat.db");
}

/**
 * Where this site's shares live: `<database dir>/ops/shares` (the site folder for an in-memory database).
 * `ops/` is the site's private runtime folder beside its database, next to the journal and logs, and every
 * backup, duplicate and publish walk already leaves it out. The database placement is the site's
 * identity: an in-site database moves with its folder, an app-data one is keyed by a siteId the sites
 * registry keeps unique, and boot refuses any database not named content.db, so two catalogs collide only
 * when two boots open the same database, and then they are the same site. Keying by workspace id merged
 * every starter site's catalog (`workspace-local`) and a copied `.site-meta.json` id merged a Finder copy's (Codex checks
 * 2026-10-26/27, design 2026-10-27). Only the transient export snapshot must stay out of the site (tmpdir).
 * @throws When the folder is inside a served content root.
 * @complexity O(content roots).
 */
export function resolveShareDirectory(required: { siteDir: string; dbPath: string; contentRoots: readonly string[] }): string {
  const shareDirectory = resolve(isInMemoryDbPath({ dbPath: required.dbPath }) ? required.siteDir : dirname(required.dbPath), "ops", "shares");
  const refuse = ({ target }: { target: string }, _optional = {}): void => {
    if (isInsideAny({ target, roots: required.contentRoots })) throw new Error("A site's ops/shares must not be inside a served content folder; give its database its own folder.");
  };
  // Checked before anything is created, so a refused folder is never made inside a served root;
  // checked again on the real path, so a symlink cannot smuggle it back in.
  refuse({ target: shareDirectory });
  mkdirSync(shareDirectory, { recursive: true, mode: 0o700 });
  const physicalShares = realpathSync(shareDirectory);
  refuse({ target: physicalShares });
  return physicalShares;
}

/** `target` equals or sits under one of `roots`, compared as given and as real paths. @complexity O(roots). */
export function isInsideAny(required: { target: string; roots: readonly string[] }): boolean {
  return required.roots.some(root => [resolve(root), existsSync(root) ? realpathSync(root) : resolve(root)]
    .some(candidate => required.target === candidate || required.target.startsWith(candidate + sep)));
}
