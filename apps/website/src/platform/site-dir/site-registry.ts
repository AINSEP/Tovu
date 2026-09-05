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
export function describeSiteBinding(optional: ListSitesOptional = {}): SiteBinding {
  const dir = resolveSiteRoot(optional);
  const env = optional.env ?? process.env;
  return { dir, name: path.basename(dir), dirOverridden: env.TOVU_SITE_DIR !== undefined };
}
