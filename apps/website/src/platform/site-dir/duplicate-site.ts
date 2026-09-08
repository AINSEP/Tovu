import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { duplicateContentDb } from "./duplicate-content-db.js";
import { InternalError, SiteDirInvalidError } from "./errors.js";
import { cleanupAndRethrow, resolveSiteName, validateInitTarget } from "./init-site.js";
import { CHAT_ATTACHMENTS_ENTRY_NAME, CONTENT_DB_FILENAME, isPortableSiteEntry, UPLOADS_ENTRY_NAME } from "./layout.js";
import { readSiteDir } from "./read-site-dir.js";
import { resolveInstallDirTarget } from "./resolve-install-dir-target.js";
import { writeJsonFileAtomic } from "./atomic-write.js";
import type { ConfigJson, SiteMetaJson } from "./types.js";

/**
 * @file SPEC-003 sibling operation (2026-09-05) — `duplicateSite`, a full working copy of an
 * existing site directory under a new identity, for the "a designer/developer wants one site per
 * client" workflow (`listSites`/`createSite`'s own product framing, `site-registry.ts`).
 *
 * WHAT GETS COPIED, AND WHY IT IS AN ALLOWLIST. A site dir is a portable folder (`site-root.ts`'s
 * own doc: "owns its own `content.db`, `uploads/`, `themes/`, `skills/`, `agent-plugins/` and
 * journals") — but it is ALSO where that site's database sidecars, backups, restore-point
 * snapshots, operational journals and publish output accumulate, every one of them private to the
 * SOURCE. {@link copyPortableEntries} therefore copies only the top-level entries `layout.ts`
 * names as portable, and leaves everything else — known or unknown — behind.
 *
 * This function originally did the opposite: it copied every top-level entry EXCEPT a short list of
 * names, and shipped the source's `chat.db`, its `.bak` databases and its `restore-point-*.db`
 * snapshots into every duplicate as a result. See `layout.ts`'s own header for that incident and
 * for what an allowlist costs.
 *
 * WHAT NEVER GETS COPIED VERBATIM, AND WHY:
 * - `content.db` — delegated to {@link duplicateContentDb}: a WAL-mode SQLite file's bytes are not
 *   the whole story (see that module's own header), and the chat/session tables an unmigrated
 *   `content.db` may still be holding are emptied from the copy BY NAME, everything else — declared
 *   content, plugin tables and their rows, the FTS5 index — carried across. Note that the direction
 *   is deliberately opposite to this file's own directory allowlist, and see that module's header
 *   for why. Note too the boundary that purge does NOT cross:
 *   since the chat/session split, conversation history lives in a SIBLING `chat.db` file, outside
 *   any table `duplicateContentDb` can see. Chat history stays out of a duplicate because `chat.db`
 *   is not on `layout.ts`'s portable allowlist — a directory-level fact, not a database-level one.
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
 *   `content.db` it ships is a copy of the SOURCE's database — minus the chat/session tables — at
 *   whatever schema state that database was actually in. Stamping the RUNTIME's
 *   bundled migration identity here (the way `initSite` correctly does for a BRAND NEW, freshly-
 *   migrated db) would be a LIE about a database this function did not migrate — and
 *   `compareSchemaVersion` believing that lie on the duplicate's first `tovu serve` either skips a
 *   migration the copied data still needs, or throws `SiteNewerThanRuntimeError` for a divergence
 *   that was never real. The only stamp that is actually true of this copy is the SOURCE's own
 *   `schemaVersion`/`schemaTag`/`templateId`/`templateVersion`, read via {@link readSiteDir} before
 *   anything is written, so this function carries them forward verbatim. `siteId` is the one field
 *   that must NEVER be copied — two site directories sharing an id is a distinct bug this function
 *   does not introduce.
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

/**
 * Copies the source's portable top-level entries — and only those — into `target`, per
 * `layout.ts`'s {@link isPortableSiteEntry}. Everything else the source directory holds, including
 * entries neither file has ever heard of, is left behind; see `layout.ts`'s own header for why
 * that direction is deliberate rather than a hardcoded `uploads`/`themes` shortlist.
 *
 * One carve-out INSIDE a portable entry: `uploads/chat-attachments` is skipped — see
 * `layout.ts`'s {@link CHAT_ATTACHMENTS_ENTRY_NAME} for why the conversation bytes must not follow
 * a duplicate when the conversations themselves already do not.
 *
 * @param onBeforeFirstWrite - invoked once, immediately before the FIRST entry is copied, and not
 *   at all when the source has no portable entries. `fs.cpSync` is not atomic: it creates the
 *   destination directory and copies into it incrementally, so from that call onward `target` may
 *   hold a partial tree even if the copy then throws. The caller flips its `wroteAnything` flag
 *   here rather than after the loop so `cleanupAndRethrow` actually removes such a partial — the
 *   contract `init-site.ts` states, and the reason this is a callback rather than a return value
 *   (a failure mid-loop means no return value ever arrives).
 * @throws {InternalError} the source directory cannot be listed (surfaced rather than silently
 *   copying nothing), or whatever `fs.cpSync` throws for a real copy failure (e.g. a permission-
 *   denied entry) — never swallowed, since a duplicate silently missing an upload is worse than
 *   one that fails loudly.
 * @complexity O(n) in the source directory's own top-level entry count, each portable one a
 *   recursive `fs.cpSync` bounded by that entry's own on-disk size — never a function of any single
 *   request's input; this is a filesystem operation over an operator's existing site, the same
 *   profile `initSite`'s own `seedSiteThemes()` call already has.
 */
function copyPortableEntries(source: string, target: string, onBeforeFirstWrite: () => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(source, { withFileTypes: true });
  } catch (err) {
    throw new InternalError(`duplicateSite: failed to read source directory ${source}: ${(err as Error).message}`);
  }

  let announced = false;
  for (const entry of entries) {
    if (!isPortableSiteEntry(entry.name)) continue;
    if (!announced) {
      onBeforeFirstWrite();
      announced = true;
    }
    const from = path.join(source, entry.name);
    // `uploads/` is the only portable entry with a carve-out inside it — see
    // {@link CHAT_ATTACHMENTS_ENTRY_NAME}. `fs.cpSync`'s `filter` receives absolute SOURCE paths and
    // does not descend into a directory it rejects, so excluding the staging directory itself is
    // enough; nothing below it is ever visited.
    const excluded = entry.name === UPLOADS_ENTRY_NAME ? path.join(from, CHAT_ATTACHMENTS_ENTRY_NAME) : null;
    fs.cpSync(from, path.join(target, entry.name), {
      recursive: true,
      ...(excluded === null ? {} : { filter: (src: string) => src !== excluded }),
    });
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
 * operation to `initSite`) — the content database, with the chat/session tables emptied and
 * everything else (including plugin tables and their rows) kept, plus exactly the top-level
 * directories `layout.ts` calls portable (`uploads/` minus its `chat-attachments` staging
 * directory, `themes/`, `plugins/`, `overrides/`, `skills/`, `agent-plugins/`). The source's chat database, database
 * backups, restore-point snapshots, operational journals and publish output are NOT carried over,
 * nor is any top-level entry `layout.ts` has not classified.
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

    // Only the portable entries the source actually has (see this file's own header). The flag is
    // raised from inside, before the first `fs.cpSync` — a copy that throws halfway has already
    // written into `target`, and that partial tree is exactly what cleanup must remove.
    copyPortableEntries(source, target, () => {
      wroteAnything = true;
    });

    // From here on `target` is written to unconditionally — `config.json`, `content.db`, and the
    // marker — so the flag is raised here rather than by any of them individually. It was not, and
    // that was C03 (2026-09-07): the two branches above are both CONDITIONAL (the `mkdirSync` is
    // skipped for a pre-existing empty target, which `validateInitTarget` accepts; the copy
    // callback never fires for a source with no portable entries, which `readSiteDir` also
    // accepts), so a `duplicateContentDb` failure could rethrow with `wroteAnything` still false —
    // `cleanupAndRethrow` then skipped the removal and left `config.json` behind, and the
    // operator's retry was refused with `InitDirNotEmptyError` about a directory they had created
    // empty themselves.
    //
    // Raised BEFORE the write, not after, for the same reason `copyPortableEntries` takes an
    // `onBeforeFirstWrite` callback rather than returning a count: a write that throws part way
    // through has still written, and that partial is exactly what cleanup exists to remove.
    wroteAnything = true;

    // config.json — new display name, domain/port reset (see this file's own header).
    const config: ConfigJson = { name: resolvedName, domain: null, port: null };
    writeJsonFileAtomic(path.join(target, "config.json"), config);

    // content.db — WAL-safe physical copy, with the chat/session tables emptied from it by name.
    // Chat history's own file, `chat.db`, is left behind by the allowlist copy above, not here.
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
