import fs from "node:fs";
import path from "node:path";

import { ValidationError } from "./errors.js";
import { initSite, type InitSiteResult } from "./init-site.js";
import { readSiteDir } from "./read-site-dir.js";
import { resolveSiteRoot, type ResolveSiteRootOptional } from "./site-root.js";

/**
 * @file Admin "Sites" screen backend, list + create half (2026-09-04 sites-switcher decision,
 * `ADS-memory/reports/2026-09-04-sites-switcher-decision.md`).
 *
 * `sites/<name>/` has always been a pure filesystem convention — no registry file, no DB table
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
  const cwd = optional.cwd ?? process.cwd();
  const sitesRoot = path.join(cwd, "sites");
  const currentSiteDir = resolveSiteRoot(optional);

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(sitesRoot, { withFileTypes: true });
  } catch {
    // No `sites/` dir at all — a fresh checkout before the first `tovu init`/boot ever ran.
    // `sites/README.md` is tracked precisely so this stays the rare case, not the common one; an
    // empty list is the honest answer, not an error.
    return [];
  }

  const sites: SiteListEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(sitesRoot, entry.name);
    try {
      const { config, meta } = readSiteDir({ dir });
      sites.push({ name: entry.name, dir, displayName: config.name, createdAt: meta.createdAt, active: dir === currentSiteDir });
    } catch {
      // Not a valid site (missing/corrupt config.json or .site-meta.json) — skip it rather than
      // fail the whole listing over one stray or half-written directory (see this function's doc).
    }
  }
  return sites;
}

/** Folder-name validation (distinct from `initSite`'s own `--name` display-name rule — see
 *  {@link SITE_NAME_PATTERN}'s doc for why format matters here and not there). */
function validateSiteName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_SITE_NAME_LENGTH || !SITE_NAME_PATTERN.test(trimmed)) {
    throw new ValidationError(`createSite: name must be 1..${MAX_SITE_NAME_LENGTH} lowercase letters, digits, and dashes`);
  }
  return trimmed;
}

export interface CreateSiteRequired {
  name: string;
}

export interface CreateSiteResult extends InitSiteResult {
  name: string;
}

/**
 * Create a new site under `sites/<name>/` through the SAME `initSite` orchestration `tovu init`
 * uses (BR-01's 8-step ordering, commit-marker discipline included) — never a parallel
 * implementation. `name` doubles as both the folder name and `config.json`'s display-name default
 * (`initSite`'s own `resolveSiteName` falls back to the target's basename, which is `name` here).
 *
 * @throws {ValidationError} an invalid `name` (this function's own folder-name format check, run
 *   BEFORE `initSite` is even called — nothing is written for a malformed name).
 * @throws whatever `initSite` throws for an occupied target or an internal failure (e.g.
 *   `InitDirNotEmptyError` when `sites/<name>/` already exists) — see that function's own contract;
 *   nothing here re-classifies those errors.
 * @complexity Bounded by `initSite`'s own cost (see that function's doc) plus one name-format
 *   check — never a function of caller-controlled input size.
 */
export function createSite(required: CreateSiteRequired, optional: ListSitesOptional = {}): CreateSiteResult {
  const name = validateSiteName(required.name);
  const cwd = optional.cwd ?? process.cwd();
  const dir = path.join(cwd, "sites", name);
  const result = initSite({ dir, name });
  return { ...result, name };
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
function readServingDirStat(dir: string): fs.Stats | null {
  try {
    const stat = fs.statSync(dir);
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
 * This repo's own `sites/tovu-com` carries neither marker file, so `readSiteDir` rejects it,
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
export function includeServingSite(required: IncludeServingSiteRequired): ServingSiteListEntry[] {
  const { binding } = required;
  const registered: ServingSiteListEntry[] = required.sites.map((site) => ({ ...site, registration: "registered" }));
  if (registered.some((site) => site.dir === binding.dir)) return registered;
  const stat = readServingDirStat(binding.dir);
  if (stat === null) return registered;
  return [...registered, describeUnregisteredServingSite(binding, stat)];
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
   * `sites/` root independently from `process.cwd()` (or an injected `cwd`) — a DIFFERENT
   * computation from whatever `dir` this binding names. `false` tells those write paths to refuse
   * rather than silently write under an unrelated `<cwd>/sites`.
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
}

/**
 * Describe the site binding this process is serving from, read-only and re-derived on every call
 * (never cached), so it always reflects what a request handled right now would actually see.
 *
 * Separate from {@link listSites}'s per-entry `active` flag because the two answer different
 * questions, and the difference is exactly what the admin Sites screen has to be honest about:
 * `active` can be `false` on EVERY row (the live site directory carries no `.site-meta.json`
 * commit marker, so `listSites` skips it — the pre-marker `sites/tovu-com` in this repo is that
 * case today), and a screen that only had the list would then render "no sites" while a site is
 * plainly being served.
 *
 * @complexity O(1) — path computation and two env reads, no I/O.
 */
/**
 * Set (to any value) by a boot that was pinned to an explicit install-dir argument — `tovu serve
 * <dir>`, via `cli/commands/serve.ts`'s `pinServedSiteDirIntoEnv`. Written into the SERVING
 * process's own environment so the agent daemon it `spawn()`s inherits it (2026-09-07 audit, claim
 * #4).
 *
 * WHY AN ENV FLAG AND NOT JUST THE PATH CHECK BELOW: the API process gets its non-switchable
 * binding handed to it directly (`composition/deps.ts`'s `siteBinding` override), but the daemon is
 * a separate process that builds its OWN `RouteDeps` via `createSqliteRouteDepsForWorkspace` and so
 * falls back to this function. The daemon is also where `sites_duplicate_site` actually executes —
 * so the guard `features/sites/tool-registrations.ts` raises for a non-switchable binding was
 * enforced by the HTTP routes and bypassed by the agent tool. A path comparison alone cannot close
 * it: `tovu serve ./sites/tovu-com` names a directory that IS `<cwd>/sites`-relative, yet was still
 * pinned by argument rather than chosen through the switcher, and the two processes must agree
 * about that either way.
 */
export const SITE_BINDING_NOT_SWITCHABLE_ENV = "TOVU_SITE_BINDING_NOT_SWITCHABLE";

/** Whether `dir` is a direct child of the `<cwd>/sites` root the Sites-switcher's own write paths
 *  resolve — the condition that makes a binding safe to switch/duplicate against. @complexity O(1). */
function isUnderSwitcherSitesRoot(dir: string, optional: ListSitesOptional): boolean {
  const cwd = optional.cwd ?? process.cwd();
  return path.dirname(dir) === path.resolve(cwd, "sites");
}

export function describeSiteBinding(optional: ListSitesOptional = {}): SiteBinding {
  const dir = resolveSiteRoot(optional);
  const env = optional.env ?? process.env;
  return {
    dir,
    name: path.basename(dir),
    dirOverridden: env.TOVU_SITE_DIR !== undefined,
    switcherCompatible:
      env[SITE_BINDING_NOT_SWITCHABLE_ENV] === undefined && isUnderSwitcherSitesRoot(dir, optional),
  };
}
