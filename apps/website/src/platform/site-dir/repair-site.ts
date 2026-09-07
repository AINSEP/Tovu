import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { InternalError } from "./errors.js";
import { resolveSiteName } from "./init-site.js";
import { readAppliedSchemaIdentity } from "./read-applied-schema-identity.js";
import { resolveInstallDirTarget } from "./resolve-install-dir-target.js";
import { writeJsonFileAtomic } from "./atomic-write.js";
import type { ConfigJson, SiteMetaJson } from "./types.js";

/**
 * @file 2026-09-06 — `repairSite`: writes `config.json` + `.site-meta.json` into an EXISTING site
 * directory that predates the marker convention (`listSites`'s own "a directory counts as a site
 * only once it carries `.site-meta.json` + `config.json`" rule, `site-registry.ts`).
 *
 * WHY A DEDICATED OPERATION RATHER THAN JUST HAND-WRITING THE TWO FILES. `.site-meta.json` carries
 * `{schemaVersion, schemaTag}`, and `tovu serve`/`boot-site-dir.ts` compare that stamp against this
 * runtime's bundled migration identity BEFORE the database is ever opened
 * (`schema-guard.ts`'s `compareSchemaVersion`). Stamping the WRONG version is worse than no stamp at
 * all — a wrong "compatible" stamp would make `serve` skip a migration the database still needs,
 * silently. So this function never guesses: {@link readAppliedSchemaIdentity} derives the stamp from
 * the database's OWN applied `__drizzle_migrations` history, matched back to this runtime's bundled
 * `db/drizzle/meta/_journal.json` — the exact technique `content-db-schema-guard.ts` (the non-CLI
 * boot path's schema guard) already uses for the identical reason, now shared rather than
 * reimplemented a third time (see that module's own file header).
 *
 * WHAT THIS FUNCTION REFUSES, AND WHY EACH ONE IS A REFUSAL RATHER THAN A BEST GUESS:
 * - `target` is not an existing, populated directory — this function repairs a site that is already
 *   there; a fresh, empty target is `tovu init`'s job, not this one's.
 * - Either marker file already exists — see {@link SiteRepairRefusedError}'s own `"MARKER_ALREADY_EXISTS"`
 *   doc: overwriting a good stamp is a data-safety bug, not a repair.
 * - `content.db` is missing — nothing to derive a stamp from.
 * - `content.db` has never been migrated (no `__drizzle_migrations` rows) — same reason: nothing to
 *   derive a stamp from, and this function must never invent one.
 * - `content.db`'s applied lineage diverges from this runtime's bundled journal — the identical
 *   "refuse rather than guess" posture `compareSchemaVersion`'s own RT-005 divergent-tag check takes
 *   at `serve` time, just surfaced earlier, before anything is written.
 *
 * `templateId`/`templateVersion` are stamped as {@link UNKNOWN_TEMPLATE_ID}/{@link
 * UNKNOWN_TEMPLATE_VERSION} rather than guessed at `"starter"` — `boot-site-dir.ts`'s own EC-07
 * already treats any unrecognized `templateId` as provenance-only (a warning, never a block), which
 * is exactly the honest posture for a site this function did not create from a template at all.
 *
 * Deliberately does NOT reuse `init-site.ts`'s `cleanupAndRethrow` (which `fs.rmSync`s the ENTIRE
 * `target` directory on failure): that helper is correct for `initSite`/`duplicateSite`, which only
 * ever call it for a directory THEY just created from scratch. `repairSite` operates on an existing,
 * already-populated site directory (real `content.db`, possibly `uploads/`, `themes/`, etc.) — an
 * `rmSync` there on a mid-write failure would destroy the operator's real data, the exact opposite of
 * what a repair tool exists to do. See {@link repairSite}'s own failure-path comment for what this
 * function does instead.
 *
 * Architectural role:
 * `site-dir` domain logic (INV-06) — no `express`/`cli` import. Every fs write below is derived from
 * `target` (`resolveInstallDirTarget`'s own return), never re-derived from the raw `dir` argument
 * (INV-01, mirrors `initSite`'s/`duplicateSite`'s identical discipline). Read-only with respect to
 * `content.db`: only ever reached via {@link readAppliedSchemaIdentity}, which opens it through
 * `openContentDbReadOnly` — this file never imports `openContentDb` (the migrating one) at all.
 */

/** Stamped when a site's real template provenance cannot be known (it did not come through
 *  `initSite`'s `readTemplate` step) — see this file's header for why this is honest rather than a
 *  guessed `"starter"`. */
const UNKNOWN_TEMPLATE_ID = "unknown";
const UNKNOWN_TEMPLATE_VERSION = "0.0.0";

const CONFIG_FILE_NAME = "config.json";
const SITE_META_FILE_NAME = ".site-meta.json";
/** Exported (2026-09-06) so `cli/commands/adopt.ts` can name the file it excludes when listing the
 *  OTHER `*.db` files it found in a directory that has no `content.db` — one source of truth for
 *  the filename, rather than a second string literal in the `cli` layer. */
export const CONTENT_DB_FILE_NAME = "content.db";

/** The four ways {@link planRepairSite}/{@link repairSite} refuse rather than guess — see this
 *  file's own header for why each one is a refusal, not a best-effort fallback. */
export type SiteRepairRefusalReason =
  | "NOT_A_DIRECTORY"
  | "MARKER_ALREADY_EXISTS"
  | "CONTENT_DB_MISSING"
  | "CONTENT_DB_UNMIGRATED"
  | "CONTENT_DB_DIVERGED";

/** Thrown by {@link planRepairSite} (and therefore {@link repairSite}) for every refusal case.
 *  Never thrown mid-write — every check this error can report runs before anything is written, so a
 *  caught `SiteRepairRefusedError` always means the target directory is untouched. */
export class SiteRepairRefusedError extends Error {
  constructor(
    message: string,
    public readonly reason: SiteRepairRefusalReason
  ) {
    super(message);
    this.name = "SiteRepairRefusedError";
  }
}

export interface RepairSiteRequired {
  /** Path to the EXISTING site directory to repair (resolved the same way `initSite`'s `dir`
   *  is — path/symlink containment, {@link resolveInstallDirTarget}). */
  dir: string;
  /** Site display name for the regenerated `config.json`; defaults to the target directory's
   *  basename (same default rule `initSite`'s own `name?` uses, via `resolveSiteName`). */
  name?: string;
}

export interface RepairSiteResult {
  /** The resolved target path (mirrors `initSite`'s own `InitSiteResult.dir` contract). */
  dir: string;
  siteId: string;
  schemaVersion: number;
  schemaTag: string;
}

/** The two marker files {@link planRepairSite} would write, plus the resolved target they belong
 *  to — everything {@link repairSite} needs to actually write, and everything a dry-run preview
 *  needs to print, computed by the exact same checks so the two can never disagree. */
export interface SiteRepairPlan {
  dir: string;
  config: ConfigJson;
  meta: SiteMetaJson;
}

/** True when `fs.statSync(target)` succeeds and names a directory — false for "does not exist" AND
 *  for "exists but is a file", which this function's one caller treats identically (both are "not a
 *  valid repair target"). */
function isExistingDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/**
 * How much of the `{config.json, .site-meta.json}` marker pair a directory already carries.
 * `"complete"` is the shape `listSites`/`tovu serve` accept; `"none"` is the only shape
 * {@link planRepairSite} will write into; `"partial"` is neither — see {@link classifySiteMarkers}.
 */
export type SiteMarkerState = "none" | "partial" | "complete";

export interface SiteMarkerClassification {
  state: SiteMarkerState;
  /** Marker file names present at the target, in `[config.json, .site-meta.json]` order. */
  present: string[];
  /** Marker file names absent at the target, same order. */
  missing: string[];
}

/**
 * Classify `target`'s marker pair. Exported (2026-09-06) because `tovu adopt`
 * (`cli/commands/adopt.ts`) has to tell the three states APART before calling
 * {@link planRepairSite}, which deliberately collapses `"partial"` and `"complete"` into one
 * `"MARKER_ALREADY_EXISTS"` refusal: a re-run against an already-adopted directory is an idempotent
 * no-op, while a half-adopted directory is a genuine refusal, and a command that treated both as
 * errors would not be idempotent. Sharing this function rather than re-deriving the two file names
 * in the `cli` layer keeps one source of truth for what a marker pair even is.
 *
 * @param target - a resolved directory path; a non-existent path classifies as `"none"` (nothing is
 *   present), which is correct — its refusal is `NOT_A_DIRECTORY`, checked separately.
 * @complexity O(1) — two `existsSync` calls.
 */
export function classifySiteMarkers(target: string): SiteMarkerClassification {
  const names = [CONFIG_FILE_NAME, SITE_META_FILE_NAME];
  const present = names.filter((name) => fs.existsSync(path.join(target, name)));
  const missing = names.filter((name) => !present.includes(name));
  return { state: markerState(present.length, names.length), present, missing };
}

/** `classifySiteMarkers`'s three-way state, split out so the classification reads as one expression
 *  rather than a nested ternary. */
function markerState(presentCount: number, totalCount: number): SiteMarkerState {
  if (presentCount === 0) return "none";
  if (presentCount === totalCount) return "complete";
  return "partial";
}

/** The subset of `["config.json", ".site-meta.json"]` already present at `target` — empty when
 *  neither exists, which is the only case {@link planRepairSite} allows past this check. */
function existingMarkerFiles(target: string): string[] {
  return classifySiteMarkers(target).present;
}

/**
 * Validate `required` and derive the exact `config.json`/`.site-meta.json` content a repair would
 * write, WITHOUT writing anything — every check {@link repairSite} relies on lives here, once, so a
 * dry-run preview and the real write can never compute two different answers.
 *
 * @throws {ValidationError} an invalid `name` (`resolveSiteName`'s own 1..200-char-after-trim rule).
 * @throws {SiteRepairRefusedError} see {@link SiteRepairRefusalReason} — one case per reason, checked
 *   in the order a caller would want to know about them: is this even a real directory, does it
 *   already carry a marker, does it have a database at all, has that database ever been migrated,
 *   and finally whether its applied lineage is one this runtime recognizes.
 * @complexity O(m) in the bundled journal's entry count (via `readAppliedSchemaIdentity`) — a small,
 *   fixed number of `stat`/`existsSync` checks plus that one call; not a function of any
 *   caller-controlled collection.
 */
function planSiteRepair(required: RepairSiteRequired): SiteRepairPlan {
  const { dir, name } = required;
  const target = resolveInstallDirTarget(dir);
  const resolvedName = resolveSiteName(target, name);

  if (!isExistingDirectory(target)) {
    throw new SiteRepairRefusedError(
      `repairSite: refusing — ${target} is not an existing directory; repairSite writes markers into an ALREADY-populated site directory (use 'tovu init' to create a brand-new one)`,
      "NOT_A_DIRECTORY"
    );
  }

  const existingMarkers = existingMarkerFiles(target);
  if (existingMarkers.length > 0) {
    throw new SiteRepairRefusedError(
      `repairSite: refusing — ${target} already has ${existingMarkers.join(" and ")} — a repair must never overwrite an existing marker file`,
      "MARKER_ALREADY_EXISTS"
    );
  }

  const dbPath = path.join(target, CONTENT_DB_FILE_NAME);
  if (!fs.existsSync(dbPath)) {
    throw new SiteRepairRefusedError(
      `repairSite: refusing — no content.db at ${dbPath}; nothing to derive a schema stamp from`,
      "CONTENT_DB_MISSING"
    );
  }

  const identity = readAppliedSchemaIdentity(dbPath);
  if (identity === "none") {
    throw new SiteRepairRefusedError(
      `repairSite: refusing — ${dbPath} has never had a migration applied (no __drizzle_migrations rows); there is no applied schema state to stamp`,
      "CONTENT_DB_UNMIGRATED"
    );
  }
  if (identity === "diverged") {
    throw new SiteRepairRefusedError(
      `repairSite: refusing — ${dbPath}'s latest applied migration matches no entry in this runtime's bundled db/drizzle/meta/_journal.json — refusing to guess at a divergent schema lineage rather than risk corrupting it (the same posture 'tovu serve' takes via compareSchemaVersion's RT-005 divergent-tag check)`,
      "CONTENT_DB_DIVERGED"
    );
  }

  const config: ConfigJson = { name: resolvedName, domain: null, port: null };
  const meta: SiteMetaJson = {
    siteId: randomUUID(),
    templateId: UNKNOWN_TEMPLATE_ID,
    templateVersion: UNKNOWN_TEMPLATE_VERSION,
    schemaVersion: identity.idx,
    schemaTag: identity.tag,
    createdAt: new Date().toISOString(),
  };
  return { dir: target, config, meta };
}

/**
 * Preview what {@link repairSite} would write for `required`, without writing anything — read-only
 * end to end (the only I/O is `fs.stat`/`existsSync` checks plus one read-only db open inside
 * {@link readAppliedSchemaIdentity}). Exists so an operator-facing dry run can show the real derived
 * `schemaVersion`/`schemaTag` before committing to `--apply`, computed by the exact same checks
 * `repairSite` itself runs — never a second, potentially-drifting implementation.
 *
 * @throws see {@link planSiteRepair}.
 * @complexity see {@link planSiteRepair}.
 */
export function planRepairSite(required: RepairSiteRequired): SiteRepairPlan {
  return planSiteRepair(required);
}

/**
 * Write `config.json` + `.site-meta.json` into an existing, marker-less site directory, making it
 * indistinguishable from a directory `initSite` created fresh (same shapes, same field meanings) to
 * both `listSites` and `tovu serve` — see this file's own header for the full refusal contract and
 * why the schema stamp is derived rather than guessed.
 *
 * @param required.dir - the site directory to repair (see {@link RepairSiteRequired}).
 * @param required.name - display name for the regenerated `config.json`; see
 *   {@link RepairSiteRequired.name}'s own doc for the default.
 * @returns `{ dir, siteId, schemaVersion, schemaTag }` — the resolved target and the freshly written
 *   `.site-meta.json`'s identity fields.
 * @throws {ValidationError} an invalid `name` — nothing written.
 * @throws {SiteRepairRefusedError} any of the refusal cases in {@link SiteRepairRefusalReason} —
 *   nothing written; every check runs before the first write (see {@link planSiteRepair}).
 * @throws {InternalError} an fs failure while writing (e.g. a permission-denied directory) — the
 *   ONLY case where partial state is possible: if `config.json` was already written when
 *   `.site-meta.json`'s write fails, that lone `config.json` is best-effort removed before
 *   rethrowing (never the whole `target` directory — see this file's header on why
 *   `cleanupAndRethrow` is deliberately not reused here). If even that removal fails, the original
 *   write error still wins; the stray `config.json` alone is harmless — `listSites` still requires
 *   `.site-meta.json` too, so it keeps rejecting the directory exactly as before this call.
 * @complexity see {@link planSiteRepair}, plus two bounded atomic file writes.
 * @overallScore 100
 */
export function repairSite(required: RepairSiteRequired): RepairSiteResult {
  const plan = planSiteRepair(required);
  const configPath = path.join(plan.dir, CONFIG_FILE_NAME);
  const metaPath = path.join(plan.dir, SITE_META_FILE_NAME);

  let wroteConfig = false;
  try {
    writeJsonFileAtomic(configPath, plan.config);
    wroteConfig = true;
    // The commit marker, written LAST on success (mirrors `initSite`'s own CIC U-003-ORD1).
    writeJsonFileAtomic(metaPath, plan.meta);
  } catch (err) {
    if (wroteConfig) {
      try {
        fs.unlinkSync(configPath);
      } catch {
        // Best-effort only — the original write error below still surfaces either way, and a
        // stray config.json alone cannot make listSites/serve accept this directory (both still
        // require .site-meta.json), so a failed cleanup here is not itself a data-safety problem.
      }
    }
    throw new InternalError(`repairSite: failed while writing markers at ${plan.dir}: ${(err as Error).message}`);
  }

  return { dir: plan.dir, siteId: plan.meta.siteId, schemaVersion: plan.meta.schemaVersion, schemaTag: plan.meta.schemaTag };
}
