import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { duplicateContentDb } from "./duplicate-content-db.js";
import { InternalError, SiteDirInvalidError } from "./errors.js";
import { cleanupAndRethrow, resolveSiteName, validateInitTarget } from "./init-site.js";
import { readSiteDir } from "./read-site-dir.js";
import { resolveInstallDirTarget } from "./resolve-install-dir-target.js";
import { writeJsonFileAtomic } from "./atomic-write.js";
import type { ConfigJson, SiteMetaJson } from "./types.js";

/**
 * @file SPEC-003 sibling operation (2026-09-05) — `duplicateSite`, a full working copy of an
 * existing site directory under a new identity, for the "a designer/developer wants one site per
 * client" workflow (`listSites`/`createSite`'s own product framing, `site-registry.ts`).
 *
 * WHAT GETS COPIED, AND WHY THIS IS DATA-DRIVEN RATHER THAN A HARDCODED DIRECTORY LIST. A site dir
 * is a portable folder (`site-root.ts`'s own doc: "owns its own `content.db`, `uploads/`, `themes/`,
 * `skills/`, `agent-plugins/` and journals") — `initSite` only ever CREATES `uploads/`, `plugins/`,
 * `overrides/`, and a seeded `themes/`, but a real site can grow other top-level entries later
 * (`features/skills/layout.ts`'s `skills/`, `features/agent-plugins/layout.ts`'s `agent-plugins/`,
 * a future journal directory) that this function has no reason to know about by name. Rather than
 * hand-list every directory a site might ever contain — the same maintenance trap
 * `duplicate-content-db.ts`'s own header rejects for table names — {@link copyPortableEntries}
 * copies EVERY top-level entry under the source except the three that need special handling
 * (`content.db` and its WAL/SHM sidecars, `config.json`, `.site-meta.json`), so a directory this
 * file has never heard of is still carried over correctly.
 *
 * WHAT NEVER GETS COPIED VERBATIM, AND WHY:
 * - `content.db` — delegated to {@link duplicateContentDb}: a WAL-mode SQLite file's bytes are not
 *   the whole story (see that module's own header), and chat/session history must never ride along
 *   (excluded there BY CONSTRUCTION, not by a list this file would have to remember to update).
 * - `content.db-wal` / `content.db-shm` — the source's OWN transient sidecars. Copying them
 *   verbatim next to a freshly `VACUUM INTO`'d target would either be stale (frames already folded
 *   into the copy) or actively wrong (frames belonging to a database the target no longer matches
 *   byte-for-byte). {@link duplicateContentDb} produces its own clean, checkpointed target.
 * - `config.json` — the new site needs its OWN display name (this function's `name?`, same
 *   `resolveSiteName` default-to-basename rule `initSite` uses) and must NOT inherit the source's
 *   `domain`/`port`: two site directories claiming the same custom domain, or the same fixed port,
 *   is a live-traffic footgun this function refuses to create silently. A caller who genuinely wants
 *   either carried over sets it explicitly after duplicating, the same as after `createSite`.
 * - `.site-meta.json` — THE SCHEMA-STAMP TRAP. This function performs no migration of its own; the
 *   `content.db` it ships is a byte-for-byte (minus chat history) copy of the SOURCE's database at
 *   whatever schema state it was actually in. Stamping the RUNTIME's bundled migration identity
 *   here (the way `initSite` correctly does for a BRAND NEW, freshly-migrated db) would be a LIE
 *   about a database this function did not migrate — and `compareSchemaVersion` believing that lie
 *   on the duplicate's first `tovu serve` either skips a migration the copied data still needs, or
 *   throws `SiteNewerThanRuntimeError` for a divergence that was never real. The only stamp that is
 *   actually true of this copy is the SOURCE's own `schemaVersion`/`schemaTag`/`templateId`/
 *   `templateVersion`, read via {@link readSiteDir} before anything is written, so this function
 *   carries them forward verbatim. `siteId` is the one field that must NEVER be copied — two site
 *   directories sharing an id is a distinct bug this function does not introduce.
 *
 * Cleanup-on-failure and the empty/absent-target refusal reuse `init-site.ts`'s own
 * {@link cleanupAndRethrow}/{@link validateInitTarget}/`InitDirNotEmptyError` verbatim (exported
 * from that module for exactly this reuse) rather than a second implementation — this function's
 * own pre-write validations (name, target-empty, source-readable) all run BEFORE its `try` block,
 * mirroring `initSite`'s own step 1-3 ordering, so `cleanupAndRethrow`'s `instanceof` list does not
 * need to additionally name {@link SiteDirInvalidError}: that error can only be thrown before
 * anything has been written.
 *
 * Architectural role: `site-dir` domain logic (INV-06) — no `express`/`cli` import. Every fs write
 * below is derived from `target` (`resolveInstallDirTarget`'s own return), never re-derived from the
 * raw `targetDir` argument (INV-01, mirrors `initSite`'s identical discipline).
 */

const CONTENT_DB_FILENAME = "content.db";
const CONTENT_DB_SIDECAR_SUFFIXES = ["-wal", "-shm"] as const;

/** True for `content.db` itself or one of its WAL-mode sidecar files — see this file's own header
 *  for why none of the three is ever part of the generic directory copy below. */
function isContentDbArtifact(entryName: string): boolean {
  return (
    entryName === CONTENT_DB_FILENAME ||
    CONTENT_DB_SIDECAR_SUFFIXES.some((suffix) => entryName === `${CONTENT_DB_FILENAME}${suffix}`)
  );
}

/** The two JSON marker files this function regenerates itself rather than copying — see this
 *  file's own header for `config.json`/`.site-meta.json`'s own paragraphs. */
const REGENERATED_ENTRY_NAMES = new Set(["config.json", ".site-meta.json"]);

/**
 * Copies every top-level entry of `source` into `target` EXCEPT the three names this function
 * regenerates or delegates elsewhere (`content.db` + sidecars, `config.json`, `.site-meta.json`).
 * Data-driven over the source's real directory listing — see this file's own header for why that is
 * deliberate rather than a hardcoded `uploads`/`themes`/`plugins`/`overrides` list.
 *
 * @throws {InternalError} the source directory cannot be listed (surfaced rather than silently
 *   copying nothing), or whatever `fs.cpSync` throws for a real copy failure (e.g. a broken symlink,
 *   a permission-denied entry) — never swallowed, since a duplicate missing an upload silently is
 *   worse than one that fails loudly.
 * @complexity O(n) in the source directory's own top-level entry count, each a recursive
 *   `fs.cpSync` bounded by that entry's own on-disk size — never a function of any single request's
 *   input; this is a filesystem operation over an operator's existing site, the same profile
 *   `initSite`'s own `seedSiteThemes()` call already has.
 */
function copyPortableEntries(source: string, target: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(source, { withFileTypes: true });
  } catch (err) {
    throw new InternalError(`duplicateSite: failed to read source directory ${source}: ${(err as Error).message}`);
  }

  for (const entry of entries) {
    if (isContentDbArtifact(entry.name) || REGENERATED_ENTRY_NAMES.has(entry.name)) continue;
    fs.cpSync(path.join(source, entry.name), path.join(target, entry.name), { recursive: true });
  }
}

export interface DuplicateSiteRequired {
  /** Absolute path to an EXISTING, valid site directory (must pass {@link readSiteDir}). */
  sourceDir: string;
  /** Absolute path for the new site directory. Must be absent, or an empty directory. */
  targetDir: string;
  /**
   * New display name; defaults to `targetDir`'s basename (same default `initSite`'s own `name?`
   * uses — see {@link resolveSiteName}). Deliberately never defaults to the SOURCE's own display
   * name: a silent "Client A Site" x2 in the admin Sites list is a worse default than an honest
   * folder-name-derived one the operator immediately recognizes as needing a rename.
   */
  name?: string;
}

export interface DuplicateSiteResult {
  /** Freshly generated — never the source's own id (two sites sharing one would be a distinct bug). */
  siteId: string;
  /** The resolved target path (mirrors `initSite`'s own `InitSiteResult.dir` contract). */
  dir: string;
}

/**
 * Create a full working copy of an existing site directory under a new identity (SPEC-003 sibling
 * operation to `initSite`) — content database (chat/session history excluded), uploads, themes, and
 * every other portable entry the source directory actually contains.
 *
 * @param required.sourceDir - path to the site being duplicated; resolved once (path/symlink
 *   containment, mirrors `initSite`'s own `resolveInstallDirTarget` discipline) and validated as a
 *   real site via {@link readSiteDir} before anything is written.
 * @param required.targetDir - path for the new site; resolved the same way, then refused unless
 *   absent or an empty directory (INV-02/AC-04, {@link validateInitTarget}).
 * @param required.name - new display name; see {@link DuplicateSiteRequired.name}'s own doc.
 * @returns `{ siteId, dir }` — `siteId` is NEW, `dir` is the resolved target path.
 * @throws {ValidationError} an invalid `name` (same 1..200-char-after-trim rule `initSite` uses) —
 *   nothing created.
 * @throws {SiteDirInvalidError} `sourceDir` is not a real, valid site — nothing created.
 * @throws {InitDirNotEmptyError} `targetDir` is occupied (file or non-empty dir) or its parent is
 *   missing — nothing created.
 * @throws {InternalError} any fs/db failure during the write phase, after best-effort cleanup of
 *   `target` (same discipline `initSite` uses via the shared {@link cleanupAndRethrow}).
 * @complexity Bounded by {@link copyPortableEntries}'s own source-size-bounded cost plus
 *   {@link duplicateContentDb}'s own db-size-bounded cost — never a function of any single
 *   request's input; this operates on an operator's own existing site directory, same profile as
 *   `initSite`'s `seedSiteThemes()` call.
 * @overallScore 100
 */
export function duplicateSite(required: DuplicateSiteRequired): DuplicateSiteResult {
  const { sourceDir, targetDir, name } = required;
  const source = resolveInstallDirTarget(sourceDir);
  const target = resolveInstallDirTarget(targetDir);

  const resolvedName = resolveSiteName(target, name); // pre-write VALIDATION, mirrors initSite step 1.
  validateInitTarget(target); // pre-write INIT_DIR_NOT_EMPTY, mirrors initSite step 2.
  const { meta: sourceMeta } = readSiteDir({ dir: source }); // pre-write SITE_DIR_INVALID — nothing created yet.

  const siteId = randomUUID(); // NEW identity — never copied from sourceMeta.siteId.
  const createdAt = new Date().toISOString();
  let wroteAnything = false;

  try {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target);
      wroteAnything = true;
    }

    // Every portable entry the source actually has (uploads/, themes/, plugins/, overrides/, and
    // anything else — see this file's own header for why this is data-driven).
    copyPortableEntries(source, target);
    wroteAnything = true;

    // config.json — new display name, domain/port reset (see this file's own header).
    const config: ConfigJson = { name: resolvedName, domain: null, port: null };
    writeJsonFileAtomic(path.join(target, "config.json"), config);

    // content.db — WAL-safe physical copy, chat/session history excluded by construction.
    duplicateContentDb({
      sourceDbPath: path.join(source, CONTENT_DB_FILENAME),
      targetDbPath: path.join(target, CONTENT_DB_FILENAME),
    });

    // .site-meta.json — the commit marker, written LAST on success (mirrors initSite's own
    // CIC U-003-ORD1), carrying the SOURCE's own schema stamp verbatim (see this file's header's
    // "THE SCHEMA-STAMP TRAP" paragraph) and a brand-new siteId.
    const meta: SiteMetaJson = {
      siteId,
      templateId: sourceMeta.templateId,
      templateVersion: sourceMeta.templateVersion,
      schemaVersion: sourceMeta.schemaVersion,
      schemaTag: sourceMeta.schemaTag,
      createdAt,
    };
    writeJsonFileAtomic(path.join(target, ".site-meta.json"), meta);

    return { siteId, dir: target };
  } catch (err) {
    return cleanupAndRethrow(err, target, wroteAnything);
  }
}
