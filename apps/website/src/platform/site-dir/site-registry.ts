import fs from "node:fs";
import { withFileLock, type DirectoryRecord, type DirectoryRunningRecord } from "@jini-ai/platform/fs";
import path from "node:path";

import { ValidationError, InitDirNotEmptyError } from "./errors.js";
import type { InitSitePort, InitSiteResult, InitSiteRestorePort } from "./init-site.js";
import { resolveSiteDatabasePaths } from "./site-databases.js";
import { readSiteDir } from "./read-site-dir.js";
import { resolveSiteRoot, SITE_SELECTION_PINNED_ENV, type ResolveSiteRootOptional } from "./site-root.js";
import { createSitesWorkspace, type SitesWorkspace } from "./sites-home.js";
import { readSiteRunning } from "./site-running.js";
import { isSiteSwitcherEnabled } from "./site-switcher-enabled.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";

/**
 * @file Admin "Sites" screen backend, list + create half (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`).
 *
 * Historical rationale (before the 2026-10-09 shared-home registry): `sites/<name>/` had always been a pure filesystem convention — no registry file, no DB table
 * (confirmed: `sites/README.md`, no code anywhere builds a "which sites exist" list before this).
 * `listSites` is the first thing that enumerates it, and it does so by directory scan plus the
 * SAME `readSiteDir` validator `serve` already trusts, rather than inventing a second notion of
 * "what makes a directory a site."
 *
 * `createSite` is a thin wrapper over `initSite` — the exact function `tovu init <dir>` calls —
 * so a site created here and one created by the CLI are byte-identical (same template, same seed,
 * same `.site-meta.json` commit-marker discipline, INV-02). Nothing here duplicates that logic.
 *
 * Deliberately read-only with respect to boot state: neither function here touches
 * `resolveSiteRoot`'s `TOVU_SITE_DIR`/`TOVU_SITE` precedence, the running process's own binding,
 * or any already-open `content.db` handle. `listSites`'s `active` flag is a fresh, read-only
 * re-derivation of `resolveSiteRoot()`, computed fresh on every call (never cached), so it always
 * reflects whatever this process actually booted with. See `active-site.ts` for the one function
 * in this feature slice that DOES write boot-relevant state — and even that one only writes a
 * file a FUTURE boot reads, never anything the live process consults.
 *
 * Today the shared catalog owns discovery across apps and arbitrary adopted folders; checkout
 * scanning remains a compatibility source. Creation targets the configured home.
 *
 * Architectural role: `site-dir` domain logic (INV-06) — no `express`/`cli` import, so a future
 * non-CLI caller (the desktop host, ADR-011) can reuse this directly, same as every sibling module
 * in this directory.
 */

/**
 * Site-folder-name format: lowercase letters, digits, dashes only. Deliberately narrower than
 * `initSite`'s own free-text `--name` (a display name, 1..200 chars, no format constraint) —
 * THIS value doubles as a path segment (`path.join(sitesRoot, name)`), so it must stay
 * filesystem- and URL-safe, and specifically must reject `.`, `/`, and empty segments so a
 * caller-supplied name can never resolve outside `sitesRoot` (no `..` is even expressible in this
 * character class). Mirrors `post.ts`'s `SLUG_FORMAT_PATTERN` shape for the same reason slugs use
 * it: a narrow, unambiguous, easy-to-audit charset.
 */
export const SITE_NAME_PATTERN = /^[a-z0-9-]+$/;
const MAX_SITE_NAME_LENGTH = 100;

export interface SiteListEntry {
  /** The folder name under `sites/` — also the stable identifier `activateSite`'s route takes. */
  name: string;
  /** Absolute path to `sites/<name>/`. */
  dir: string;
  /** `config.json.name` — the site's own display name (may differ from the folder name). */
  displayName: string;
  /** `.site-meta.json.createdAt`, from `initSite`'s own commit-marker write. */
  createdAt: string;
  /** True when `dir` is the site THIS process is currently bound to (`resolveSiteRoot()`), i.e.
   *  the one that would still be served by a request handled right now, not any pending choice a
   *  not-yet-actioned `activateSite` call may have persisted for the NEXT boot. */
  active: boolean;
  id?: string;
  running?: DirectoryRunningRecord | null;
}

export type ListSitesOptional = ResolveSiteRootOptional;

/**
 * Enumerate every real site under `<cwd>/sites/`. A directory counts as a site only once it
 * carries a valid `.site-meta.json` + `config.json` (init's own commit-marker discipline, INV-02),
 * so a partial/interrupted `initSite` never appears half-listed, and a stray non-site entry
 * (`.DS_Store`, a scratch folder, a future `out/`-style build artifact some site keeps beside
 * `sites/`) is silently skipped rather than surfaced as a corrupt site — this is a best-effort
 * discovery scan, not a validator whose job is to fail loudly on every stray file.
 *
 * @complexity O(n) in the number of entries directly under `sites/` — bounded by how many sites an
 *   operator has actually created, never by a single request's own input.
 */
export function listSites(optional: ListSitesOptional = {}): SiteListEntry[] {
  const workspace = createSitesWorkspace({}, optional);
  const currentSiteDir = resolveSiteRoot(optional);
  const registry = workspace.registry({});
  const sites: SiteListEntry[] = [];
  const discovered: DirectoryRecord[] = [];
  const usedNames = new Set<string>();
  const listedPaths = new Set<string>();
  for (const candidate of candidateSiteDirs({ workspace })) {
    const site = readSiteCandidate({ dir: candidate });
    if (!site) continue;
    const dir = fs.realpathSync(candidate);
    if (listedPaths.has(dir)) continue;
    listedPaths.add(dir);
    const { config, meta } = site;
    const name = routeName({ basename: path.basename(dir), siteId: meta.siteId }, { usedNames });
    usedNames.add(name);
    discovered.push({ id: meta.siteId, name: config.name, path: dir, createdBy: "discovered", lastOpened: null });
    sites.push({ id: meta.siteId, name, dir, displayName: config.name, createdAt: meta.createdAt,
      active: dir === currentSiteDir, running: readSiteRunning({ dir }, { workspace }) });
  }
  if (discovered.length) registry.merge({ entries: discovered });
  return sites;
}

/** Catalog rows first, then every immediate subdirectory of each discovery root (unvalidated).
 * @complexity O(r + n): r catalog rows plus n entries across the roots.
 */
function candidateSiteDirs({ workspace }: { workspace: Pick<SitesWorkspace, "registry" | "roots"> }): Set<string> {
  const known = new Set(workspace.registry({}).list({}).map((entry) => entry.path));
  for (const root of workspace.roots({})) {
    for (const entry of readRootEntries({ root })) if (entry.isDirectory()) known.add(path.join(root, entry.name));
  }
  return known;
}

function readRootEntries({ root }: { root: string }): fs.Dirent[] {
  try { return fs.readdirSync(root, { withFileTypes: true }); }
  catch (error) {
    // No sites directory at all is an honest empty discovery result on a fresh checkout.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function readSiteCandidate({ dir }: { dir: string }): ReturnType<typeof readSiteDir> | undefined {
  try { return readSiteDir({ dir }); }
  catch {
    // Not a valid site (missing/corrupt config.json or .site-meta.json) — skip it rather than
    // fail the whole listing over one stray or half-written directory (see listSites's doc).
    return undefined;
  }
}

/** The folder name when it is a safe, unused route; otherwise the marker's site id. */
function routeName({ basename, siteId }: { basename: string; siteId: string }, { usedNames }: { usedNames: ReadonlySet<string> }): string {
  // Arbitrary adopted folders can share basenames or contain spaces. The marker ID supplies a
  // safe route identifier in those cases; no caller ever supplies an arbitrary filesystem path.
  return SITE_NAME_PATTERN.test(basename) && basename.length <= MAX_SITE_NAME_LENGTH && !usedNames.has(basename) ? basename : siteId;
}

/** Folder-name validation (distinct from `initSite`'s own `--name` display-name rule — see
 *  {@link SITE_NAME_PATTERN}'s doc for why format matters here and not there). */
function validateSiteName({ name }: { name: string }, _optional = {}): string {
  assertPortableSiteName({ name });
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SITE_NAME_LENGTH || !SITE_NAME_PATTERN.test(trimmed)) {
    throw new ValidationError(`createSite: name must be 1..${MAX_SITE_NAME_LENGTH} lowercase letters, digits, and dashes`);
  }
  return trimmed;
}

/** Refuse site names Windows treats as devices or cannot create, even when this host is Unix.
 * @throws {ValidationError} A device name (including extensions), trailing dot or space.
 * @complexity O(name length), no I/O.
 */
export function assertPortableSiteName({ name }: { name: string }, _optional = {}): void {
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name.trimStart()) || /[. ]$/.test(name)) {
    throw new ValidationError("Site names must not use Windows device names or end with a dot or space.");
  }
}

export interface CreateSiteRequired {
  name: string;
  adminPassword?: string;
  displayName?: string;
}

export interface SiteCreationAllocation extends InitSiteResult { name: string; dbPath: string }

export interface CreateSiteResult extends InitSiteResult {
  name: string;
}

export type CreateSiteOptions = ListSitesOptional & { initSite?: InitSitePort; workspace?: SitesWorkspace; verifiedRestore?: InitSiteRestorePort; collisionSafe?: boolean; onAllocated?: (required: SiteCreationAllocation) => void; beforeRegister?: (required: CreateSiteResult) => void };
export type CreateSitePort = (required: CreateSiteRequired, optional?: CreateSiteOptions) => Promise<CreateSiteResult>;

/**
 * Create a new site under `sites/<name>/` through the SAME `initSite` orchestration `tovu init`
 * uses (BR-01's 8-step ordering, commit-marker discipline included) — never a parallel
 * implementation. `name` doubles as both the folder name and `config.json`'s display-name default
 * (`initSite`'s own `resolveSiteName` falls back to the target's basename, which is `name` here).
 * @param required.deps - the initializer bound by the embedding host.
 *
 * @throws {ValidationError} an invalid `name` (this function's own folder-name format check, run
 *   BEFORE `initSite` is even called — nothing is written for a malformed name).
 * @throws whatever `initSite` throws for an occupied target or an internal failure (e.g.
 *   `InitDirNotEmptyError` when `sites/<name>/` already exists) — see that function's own contract;
 *   nothing here re-classifies those errors.
 * @complexity initSite's byte cost plus O(sites + name collisions) for collision-safe imports;
 *   name selection is bounded to 10,000 candidates under a shared home lock.
 */
export async function createSite(required: CreateSiteRequired & { deps: { initSite: InitSitePort } }, optional: CreateSiteOptions = {}): Promise<CreateSiteResult> {
  const name = validateSiteName({ name: required.name });
  const workspace = optional.workspace ?? createSitesWorkspace({}, optional);
  const home = workspace.home({});
  if (!workspace.homeAvailable({})) throw new ValidationError(`Sites home volume is unavailable: ${home}. Mount it or choose a local folder in Sites settings.`);
  fs.mkdirSync(home, { recursive: true });
  const create = async (picked: string): Promise<CreateSiteResult> => {
    const dir = path.join(home, picked);
    return withFileLock({ lockPath: `${dir}.creation.lock`, run: async () => {
      if (optional.collisionSafe && fs.existsSync(dir)) throw new InitDirNotEmptyError("Import target was occupied while waiting for its creation lock.");
      const result = await (optional.initSite ?? required.deps.initSite)({ dir, name: required.displayName ?? picked, adminPassword: required.adminPassword }, { workspace, onAllocated: allocation => optional.onAllocated?.({ ...allocation, name: picked }), ...(optional.verifiedRestore ? { verifiedRestore: optional.verifiedRestore } : {}) });
      try {
        optional.beforeRegister?.({ ...result, name: picked });
        workspace.registry({}).merge({ entries: [{ id: result.siteId, name: picked, path: result.dir, createdBy: "Web", lastOpened: null }] });
      } catch (error) {
        if (optional.verifiedRestore) {
          // The catalog write can fail after init committed. Roll back only this fresh import.
          removeUncommittedSite({ dir: result.dir, contentDbPath: () => resolveSiteDatabasePaths({ dir: result.dir, siteId: result.siteId },
            { workspace, placement: workspace.config({}).databases, reserveIdentity: false }).contentDbPath });
          workspace.registry({}).remove({ path: result.dir });
        }
        throw error;
      }
      return { ...result, name: picked };
    } }, { staleMs: Infinity });
  };
  if (!optional.collisionSafe) return create(name);
  // Name selection and import creation share a home-level lane; ordinary creators retain their
  // per-name lock, so an intervening ordinary create is retried with the next suffix.
  return withFileLock({ lockPath: path.join(home, ".import-creation.lock"), run: async () => {
    const occupied = new Set(workspace.registry({}).list({}).map(row => row.name));
    for (let suffix = 1; suffix <= 10_000; suffix++) {
      const candidate = suffix === 1 ? name : name.slice(0, 90) + "-" + suffix;
      if (fs.existsSync(path.join(home, candidate)) || occupied.has(candidate)) continue;
      try { return await create(candidate); }
      catch (error) {
        if ((error as Error).name !== "InitDirNotEmptyError") throw error;
      }
    }
    throw new ValidationError("No collision-free import site name is available.");
  } }, { staleMs: Infinity });
}

/** Reconcile a journaled fresh import under the same locks as creation. A catalog commit
 * plus initSite's marker is authoritative; otherwise discard only the allocated fresh files.
 * Throws on conflicting ownership rather than removing another site. O(catalog + site bytes).
 */
/** Undo an uncommitted creation: the commit marker first (so the database path is resolved as for a
 * markerless folder), then an app-data database folder outside the site, then the site folder.
 */
function removeUncommittedSite({ dir, contentDbPath }: { dir: string; contentDbPath: () => string }): void {
  fs.rmSync(path.join(dir, ".site-meta.json"), { force: true });
  const dbPath = contentDbPath();
  if (!dbPath.startsWith(dir + path.sep)) fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
}

export async function reconcileSiteCreation(required: { allocation: SiteCreationAllocation; workspace: SitesWorkspace }, _options: Record<string, never> = {}): Promise<"ready" | "failed"> {
  const { allocation, workspace } = required;
  return withFileLock({ lockPath: path.join(path.dirname(allocation.dir), ".import-creation.lock"), run: () =>
    withFileLock({ lockPath: `${allocation.dir}.creation.lock`, run: () => {
      const entries = workspace.registry({}).list({});
      const owner = entries.find(entry => entry.path === allocation.dir || entry.id === allocation.siteId);
      if (owner) {
        if (owner.path !== allocation.dir || owner.id !== allocation.siteId || readSiteDir({ dir: allocation.dir }).meta.siteId !== allocation.siteId) throw new ValidationError("Interrupted import has conflicting site ownership; manual recovery required.");
        return "ready" as const;
      }
      if (fs.existsSync(path.join(allocation.dir, ".site-meta.json")) && readSiteDir({ dir: allocation.dir }).meta.siteId !== allocation.siteId) throw new ValidationError("Interrupted import directory belongs to another site; manual recovery required.");
      removeUncommittedSite({ dir: allocation.dir, contentDbPath: () => allocation.dbPath });
      return "failed" as const;
    } }, { staleMs: Infinity })
  }, { staleMs: Infinity });
}

/**
 * Whether a listed directory carries `initSite`'s own commit markers (`config.json` +
 * `.site-meta.json`, INV-02) — which is exactly the difference between a folder `tovu serve` would
 * accept and one it would refuse with `SiteDirInvalidError`.
 *
 * A distinct STATE rather than a loosened validator. {@link listSites} still means "directories
 * `serve` would accept", because that is what its two write-path callers (this route's Activate,
 * and `features/sites/tool-registrations.ts`'s duplicate-source lookup) need it to mean.
 */
export type SiteRegistration = "registered" | "unregistered";

/**
 * A {@link SiteListEntry} carrying the one fact the strict listing has no way to express: whether
 * this row is a real initialized site or the directory this process happens to be serving without
 * one. Every field except {@link ServingSiteListEntry.registration} means what it does on the base
 * type; see {@link includeServingSite} for what an `unregistered` row's fields are derived from.
 */
export interface ServingSiteListEntry extends SiteListEntry {
  registration: SiteRegistration;
}

export interface IncludeServingSiteOptional {
  /** Directory stat port; node:fs by default. */
  stat?: (dir: string) => fs.Stats;
}

export interface IncludeServingSiteRequired {
  /** {@link listSites}'s own output — unmodified, and every entry becomes `registered`. */
  sites: readonly SiteListEntry[];
  /** {@link describeSiteBinding}'s output for the SAME `cwd`/`env`, so the two agree about which
   *  directory "serving" means. */
  binding: SiteBinding;
}

/** The served directory's `fs.Stats` when it exists and is a directory, `null` otherwise. One
 *  `statSync`, reused for the entry's `createdAt`, so the existence check and the timestamp can
 *  never describe two different states of the filesystem.
 *
 *  @complexity O(1) — a single stat. */
function readServingDirStat(dir: string, { stat: statDir }: { stat: (dir: string) => fs.Stats }): fs.Stats | null {
  try {
    const stat = statDir(dir);
    return stat.isDirectory() ? stat : null;
  } catch {
    return null;
  }
}

/**
 * The synthetic row for a served directory that {@link listSites} rejected.
 *
 * Every field is a fact about the directory itself rather than a guess at what its missing
 * `config.json`/`.site-meta.json` would have said:
 * - `displayName` is the folder name, because no `config.json` exists to read one from.
 * - `createdAt` is the FOLDER's own creation time, not `initSite`'s commit-marker timestamp (there
 *   isn't one). `birthtime` where the filesystem records it, `mtime` where it reports zero.
 * - `active` is unconditionally `true`: this function is only ever called for the directory this
 *   process is bound to, which is what makes the `unregistered`-implies-`active` invariant hold.
 *
 * @complexity O(1).
 */
function describeUnregisteredServingSite(binding: SiteBinding, stat: fs.Stats): ServingSiteListEntry {
  const born = stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime;
  return {
    name: binding.name,
    dir: binding.dir,
    displayName: binding.name,
    createdAt: born.toISOString(),
    active: true,
    registration: "unregistered",
  };
}

/**
 * The listing the admin Sites screen renders: every real site, plus the directory this process is
 * actually serving when that directory is not one of them.
 *
 * ## Why this exists rather than a change to `listSites`
 *
 * This repo's own `sites/tovu-dev` carries neither marker file, so `readSiteDir` rejects it,
 * `listSites` drops it, and the screen showed "All sites 0" while that exact folder was being
 * served. Loosening `readSiteDir` would have fixed the screen by breaking the contract two write
 * paths depend on: Activate uses `listSites` as its existence check, and `sites_duplicate_site`
 * uses it to find a duplicate SOURCE — and `duplicateSite` reads the source's `.site-meta.json`
 * schema stamp, so handing it a marker-less directory turns a clean refusal into a thrown
 * `SiteDirInvalidError` mid-operation. Composing here instead leaves both untouched.
 *
 * ## The invariant callers may rely on
 *
 * An `unregistered` entry is ALWAYS the served one (`active: true`), because that is the only
 * entry this function ever adds. So a UI that disables Activate for whatever is already serving —
 * as the Sites screen does — can never route an `unregistered` name to Activate's strict
 * `listSites` lookup and collect a `SITE_NOT_FOUND`.
 *
 * A directory that does not exist, or a path that is a file, adds nothing: a card for a folder
 * that is not there would be its own kind of lie.
 *
 * @param required.sites - `listSites()`'s output for some `cwd`/`env`.
 * @param required.binding - `describeSiteBinding()`'s output for that SAME `cwd`/`env`.
 * @returns Every input entry as `registered`, in input order, plus at most one appended
 *   `unregistered` entry for the served directory.
 * @complexity O(n) in the number of sites already listed, plus one `stat`.
 */
export function includeServingSite(required: IncludeServingSiteRequired, { stat = (dir: string) => fs.statSync(dir) }: IncludeServingSiteOptional = {}): ServingSiteListEntry[] {
  const { binding } = required;
  const registered: ServingSiteListEntry[] = required.sites.map((site) => ({ ...site, registration: "registered" }));
  if (registered.some((site) => site.dir === binding.dir)) return registered;
  const served = readServingDirStat(binding.dir, { stat });
  if (served === null) return registered;
  return [...registered, describeUnregisteredServingSite(binding, served)];
}

/** What THIS process is actually bound to right now — see {@link describeSiteBinding}. */
export interface SiteBinding {
  /** Absolute path this process resolved at boot (`resolveSiteRoot()`), re-derived fresh. */
  dir: string;
  /** `dir`'s folder name — the `TOVU_SITE` vocabulary `persistActiveSite` writes in. */
  name: string;
  /**
   * True when `TOVU_SITE_DIR` is set in this process's environment.
   *
   * Load-bearing for the admin Sites screen, not a diagnostic nicety: `resolveSiteRoot`'s
   * precedence puts `TOVU_SITE_DIR` ABOVE the `TOVU_SITE` line `persistActiveSite` writes, so when
   * this is true an activate is inert — the next boot resolves the override and ignores the
   * persisted choice entirely. A UI that offered Activate without saying so would promise a switch
   * that cannot happen.
   */
  dirOverridden: boolean;
  /**
   * False when `dir` was resolved from an explicit, arbitrary install-dir argument (`tovu serve
   * <dir>` / `bootSiteDir`) rather than from THIS function's own `{cwd, env}`-relative
   * `<cwd>/sites/<name>` convention.
   *
   * `listSites`/`createSite`/`persistActiveSite`/`sites_duplicate_site` all resolve their OWN
   * `sites/` root from a `cwd` — `process.cwd()` by default, which is a DIFFERENT computation from
   * whatever `dir` this binding names. The Sites routes and tools therefore never let it default:
   * they pass {@link switcherBaseForBinding}'s base, which exists only when this is `true`. `false`
   * tells those write paths to refuse rather than silently write under an unrelated `<cwd>/sites`.
   *
   * `describeSiteBinding` used to hardcode this `true`, on the stated reasoning that its own
   * `{cwd, env}` resolution always agrees with the switcher's. That reasoning did not cover
   * `TOVU_SITE_DIR`, which `resolveSiteRoot` honors outright and which can name any path on the
   * disk — so an override pointing outside `<cwd>/sites` produced a binding that CLAIMED to be
   * switchable while the switcher's own root was somewhere else entirely. It is computed now (see
   * {@link describeSiteBinding}), and additionally forced off by
   * {@link SITE_BINDING_NOT_SWITCHABLE_ENV} for the one case no path comparison can detect: a
   * `tovu serve <dir>` boot whose `<dir>` happens to sit under `<cwd>/sites` but was still pinned
   * by an explicit argument rather than chosen through the switcher.
   */
  switcherCompatible: boolean;
  /** Repo base is independent of the selected shared home; .env remains repo-owned. */
  switcherBase?: string;
}

/**
 * Describe the site binding this process is serving from, read-only and re-derived on every call
 * (never cached), so it always reflects what a request handled right now would actually see.
 *
 * Separate from {@link listSites}'s per-entry `active` flag because the two answer different
 * questions, and the difference is exactly what the admin Sites screen has to be honest about:
 * `active` can be `false` on EVERY row (the live site directory carries no `.site-meta.json`
 * commit marker, so `listSites` skips it — the pre-marker `sites/tovu-dev` in this repo is that
 * case today), and a screen that only had the list would then render "no sites" while a site is
 * plainly being served.
 *
 * @complexity O(n) registered sites and home entries, plus the binding membership lookup.
 */
/**
 * Set (to any value) by a boot that was pinned to an explicit install-dir argument — `tovu serve
 * <dir>`, via `cli/commands/serve.ts`'s `pinServedSiteDirIntoEnv`. Written into the SERVING
 * process's own environment so the agent daemon it `spawn()`s inherits it (2026-09-07 audit, claim
 * #4).
 *
 * WHY AN ENV FLAG AND NOT JUST THE PATH CHECK BELOW: the API process gets its non-switchable
 * binding handed to it directly (`composition/deps.ts`'s `siteBinding` override), but the daemon is
 * a separate process that builds its OWN `RouteDeps` via `createSiteRouteDepsForWorkspace` and so
 * falls back to this function. The daemon is also where `sites_duplicate_site` actually executes —
 * so the guard `features/sites/tool-registrations.ts` raises for a non-switchable binding was
 * enforced by the HTTP routes and bypassed by the agent tool. A path comparison alone cannot close
 * it: `tovu serve ./sites/tovu-dev` names a directory that IS `<cwd>/sites`-relative, yet was still
 * pinned by argument rather than chosen through the switcher, and the two processes must agree
 * about that either way.
 */
export const SITE_BINDING_NOT_SWITCHABLE_ENV = "TOVU_SITE_BINDING_NOT_SWITCHABLE";

/** Whether `dir` is a direct child of the `<cwd>/sites` root the Sites-switcher's own write paths
 *  resolve — the condition that makes a binding safe to switch/duplicate against. @complexity O(1). */
function isUnderSwitcherSitesRoot(dir: string, optional: ListSitesOptional): boolean {
  const cwd = optional.cwd ?? process.cwd();
  return path.dirname(dir) === path.resolve(cwd, "sites") || isInSitesWorkspace({ dir, workspace: createSitesWorkspace({}, optional) });
}

/** One workspace answers both questions: directly under the shared home, or a catalog-registered folder.
 * Windows compares resolved paths without case/separator differences. No filesystem probes.
 * @complexity O(n × path length) for n catalog entries.
 */
export function isInSitesWorkspace({ dir, workspace }: { dir: string; workspace: Pick<SitesWorkspace, "home" | "registry"> }, { platform = process.platform }: { platform?: NodeJS.Platform } = {}): boolean {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const canonical = (value: string) => platform === "win32" ? paths.resolve(value).toLowerCase() : paths.resolve(value);
  return canonical(paths.dirname(paths.resolve(dir))) === canonical(workspace.home({})) ||
    workspace.registry({}).list({}).some((entry) => canonical(entry.path) === canonical(dir));
}

export function describeSiteBinding(optional: ListSitesOptional = {}): SiteBinding {
  const dir = resolveSiteRoot(optional);
  const env = optional.env ?? process.env;
  return {
    dir,
    name: path.basename(dir),
    dirOverridden: env.TOVU_SITE_DIR !== undefined && env[SITE_SELECTION_PINNED_ENV] !== "1",
    switcherBase: optional.cwd ?? process.cwd(),
    switcherCompatible:
      env[SITE_BINDING_NOT_SWITCHABLE_ENV] === undefined && isUnderSwitcherSitesRoot(dir, optional),
  };
}

/**
 * The base directory the Sites-switcher's `sites/` root and `.env` live under, read off the boot
 * binding — `null` when the binding is not switchable (an install-dir boot has no `sites/` tree).
 *
 * WHY THIS AND NOT `process.cwd()`: `listSites`/`createSite`/`persistActiveSite`/
 * `readPersistedActiveSite` all default their base to `process.cwd()`. A request handler that let
 * them default listed, created and activated in whatever tree the process happened to be standing
 * in, while `siteBinding` named another one (development/todos.md, "The sites route and
 * `sites_duplicate_site` re-derive the site binding from `process.cwd()`"). A switchable binding's
 * `dir` is, by {@link describeSiteBinding}'s own definition, a direct child of `<base>/sites`, so
 * the base is recoverable from the binding alone — every Sites route and tool passes this instead.
 *
 * @complexity O(1) — path arithmetic only.
 */
export function switcherBaseForBinding(binding: SiteBinding): string | null {
  return binding.switcherCompatible ? binding.switcherBase ?? path.dirname(path.dirname(binding.dir)) : null;
}

/**
 * The base a NEW sibling site (an import) is created from, or `null` when this process must not
 * create local sites. Absorbs {@link switcherBaseForBinding}: an enabled switcher keeps its base.
 * A pinned boot (desktop's `tovu serve <home>/<name>`) whose site already lives in the shared sites
 * home also qualifies — creating a sibling there never switches what this process serves, so the
 * switcher flag (which also gates Activate) is not the right question. Production never qualifies.
 * @complexity O(n) registered sites, one workspace resolution.
 */
export function siteCreationBaseForBinding(required: { binding: SiteBinding }, optional: ListSitesOptional = {}): string | null {
  const { binding } = required;
  const env = optional.env ?? process.env;
  // NODE_ENV is the image's own signal; TOVU_RUNTIME_MODE also covers a hand-run `npm start` server.
  if (env.NODE_ENV === "production" || resolveRuntimeMode({ env }) === "production") return null;
  const switcherBase = isSiteSwitcherEnabled(env) ? switcherBaseForBinding(binding) : null;
  if (switcherBase !== null) return switcherBase;
  const cwd = binding.switcherBase ?? optional.cwd ?? process.cwd();
  return isInSitesWorkspace({ dir: binding.dir, workspace: createSitesWorkspace({}, { ...optional, env, cwd }) }) ? cwd : null;
}

/** The served install dir as a one-row listing when `tovu serve` would accept it, else nothing.
 *  @complexity O(1) — one `readSiteDir`. */
function listServedSiteOnly(binding: SiteBinding): SiteListEntry[] {
  try {
    const { config, meta } = readSiteDir({ dir: binding.dir });
    return [{ name: binding.name, dir: binding.dir, displayName: config.name, createdAt: meta.createdAt, active: true }];
  } catch {
    return [];
  }
}

export interface ListSitesForBindingRequired {
  binding: SiteBinding;
}

export interface ListSitesForBindingOptional {
  /** Defaults to {@link listSites}. Called with the binding's own base, never left to default. */
  listSites?: (optional?: ListSitesOptional) => readonly SiteListEntry[];
}

/**
 * {@link listSites} for the tree the process is BOUND to, not the one it is standing in.
 *
 * - Switchable binding: `listSites` over `<base>/sites` ({@link switcherBaseForBinding}), with
 *   `active` re-read against `binding.dir` — `listSites`'s own `active` re-derives the served dir
 *   from `{cwd, env}`, which is exactly the re-derivation this function exists to avoid.
 * - Install-dir binding (`tovu serve <dir>`): there is no related `sites/` tree, so the only site is
 *   the served one, listed when `tovu serve` would accept it. Listing `<cwd>/sites` here reported an
 *   unrelated checkout's sites as this server's.
 *
 * @complexity O(n) in the entries under the bound `sites/`, or one `readSiteDir` for an install dir.
 */
export function listSitesForBinding(required: ListSitesForBindingRequired, optional: ListSitesForBindingOptional = {}): SiteListEntry[] {
  const { binding } = required;
  const base = switcherBaseForBinding(binding);
  if (base === null) return listServedSiteOnly(binding);
  return (optional.listSites ?? listSites)({ cwd: base }).map((site) => ({ ...site, active: site.dir === binding.dir }));
}
