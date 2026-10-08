import fs from "node:fs";
import path from "node:path";

import { writeJsonFileAtomic } from "./atomic-write.js";
import { SiteDirInvalidError } from "./errors.js";
import { readAppliedSchemaIdentityOfFile } from "./read-applied-schema-identity.js";
import { runtimeSchemaVersion } from "./schema-guard.js";
import { parseSiteStorage, SITE_META_FILENAME } from "./site-storage.js";
import type { SiteMetaJson, SiteStorage } from "./types.js";

/**
 * @file 2026-10-05 — the key-only `.site-meta.json`, and completing it into a full one.
 *
 * WHY THIS SHAPE EXISTS. The dev boot (`npm run dev` -> `src/index.ts`) mints a `.site-meta.json`
 * holding only `{ siteKeyId }` (`site-key-ensure.ts`'s `mintMinimalSiteMetaJson`), and
 * `ensureSiteKey` later adds `siteKeyFingerprint`. That was enough while `readSiteDir` accepted any
 * JSON object; since 2026-10-03 (`156526fc7`, F1740) it requires the identity fields and schema
 * stamp, so `tovu serve <dir>` — the desktop's path — refused every dev site with
 * `SITE_DIR_INVALID: .site-meta.json.siteId must be a non-empty string`, and `tovu adopt` refused
 * the same dir as already carrying a marker.
 *
 * WHAT COMPLETING MEANS. Only the recognised shape — an object whose keys are drawn solely from
 * {@link KEY_ONLY_FIELDS} and that names a `siteKeyId` — is completed. Anything else, including a
 * meta with a malformed identity field, is left for `readSiteDir` to refuse exactly as before.
 * - `siteKeyId`/`siteKeyFingerprint` are kept byte-identical: the key file is found by `siteKeyId`
 *   (`site-key-sources.ts`'s `resolveSiteKeyId` reads it before `siteId`), so losing or changing it
 *   would make every sealed secret undecryptable.
 * - `siteId` is set to `siteKeyId`. `initSite` writes the two equal for every new site, so this keeps
 *   that invariant, and a reader that only knew `resolveSiteKeyId`'s `siteId` fallback would still
 *   resolve the same key file.
 * - The schema stamp is DERIVED, never guessed (same rule as `repair-site.ts`): a SQLite site's comes
 *   from `content.db`'s own applied migration history. A Postgres/PGlite site gets this runtime's
 *   identity, exactly as `initSite` stamps one — `bootSiteDir` never compares it for those kinds.
 * - `templateId`/`templateVersion` are {@link UNKNOWN_TEMPLATE_ID}/{@link UNKNOWN_TEMPLATE_VERSION},
 *   `createdAt` the site directory's own birth time.
 *
 * Every value is a function of what is already on disk, so two instances completing the same meta at
 * once write identical bytes (this owner runs many local instances of one site; there is no lock).
 */

/** Stamped when a site's real template provenance cannot be known (it did not come through
 *  `initSite`'s `readTemplate` step) — see `repair-site.ts`'s header for why this is honest rather
 *  than a guessed `"starter"`. */
export const UNKNOWN_TEMPLATE_ID = "unknown";
export const UNKNOWN_TEMPLATE_VERSION = "0.0.0";

/** The only keys a key-only meta may hold. `storage` is allowed because `site-storage.ts` reads it
 *  from a partial meta file too; it is validated and carried forward unchanged. */
const KEY_ONLY_FIELDS: ReadonlySet<string> = new Set(["siteKeyId", "siteKeyFingerprint", "storage"]);

/** A `.site-meta.json` that carries only the site-key fields (and optionally `storage`). */
export interface KeyOnlySiteMeta {
  siteKeyId: string;
  siteKeyFingerprint?: string;
  storage?: unknown;
}

/**
 * Whether `parsed` is the key-only shape. A non-empty string `siteKeyId` is required, a present
 * `siteKeyFingerprint` must be a string, and no other key may appear — so `{ siteKeyId, siteId: 5 }`
 * is NOT key-only and still meets `readSiteDir`'s refusal.
 *
 * @complexity O(k) in the object's own key count.
 */
export function parseKeyOnlySiteMeta(parsed: unknown): KeyOnlySiteMeta | undefined {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const candidate = parsed as Record<string, unknown>;
  if (!Object.keys(candidate).every((key) => KEY_ONLY_FIELDS.has(key))) return undefined;
  if (typeof candidate.siteKeyId !== "string" || candidate.siteKeyId.trim() === "") return undefined;
  if (candidate.siteKeyFingerprint !== undefined && typeof candidate.siteKeyFingerprint !== "string") return undefined;
  return candidate as unknown as KeyOnlySiteMeta;
}

/** `dir`'s `.site-meta.json` raw text, or `undefined` when it is absent or unreadable. */
function readMetaText(dir: string): string | undefined {
  try {
    return fs.readFileSync(path.join(dir, SITE_META_FILENAME), "utf8");
  } catch {
    return undefined;
  }
}

/** `text` parsed as a key-only meta, or `undefined` for any other content. */
function keyOnlyFromText(text: string | undefined): KeyOnlySiteMeta | undefined {
  if (text === undefined) return undefined;
  try {
    return parseKeyOnlySiteMeta(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/**
 * `dir`'s `.site-meta.json` when it is the key-only shape; `undefined` when it is absent,
 * unparseable, or anything else.
 *
 * @complexity O(1) — one small file read.
 */
export function readKeyOnlySiteMeta(dir: string): KeyOnlySiteMeta | undefined {
  return keyOnlyFromText(readMetaText(dir));
}

/** The identity part every completion of `keyOnly` carries: `siteId` = `siteKeyId`, and the key
 *  fields (plus `storage`) exactly as they were. See this file's header for why. */
export function carriedKeyFields(keyOnly: KeyOnlySiteMeta): Pick<SiteMetaJson, "siteId" | "siteKeyId" | "siteKeyFingerprint" | "storage"> {
  return {
    siteId: keyOnly.siteKeyId,
    siteKeyId: keyOnly.siteKeyId,
    ...(keyOnly.siteKeyFingerprint === undefined ? {} : { siteKeyFingerprint: keyOnly.siteKeyFingerprint }),
    ...(keyOnly.storage === undefined ? {} : { storage: keyOnly.storage as SiteStorage }),
  };
}

/** `dir`'s birth time (its modification time where the filesystem reports none), as ISO text —
 *  the same date the admin Sites screen showed for this folder before it carried a full meta
 *  (`site-registry.ts`'s `describeUnregisteredServingSite`). */
function dirCreatedAt(dir: string): string {
  const stat = fs.statSync(dir);
  return (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
}

/** Why a key-only meta could not be completed, as the `SiteDirInvalidError` `bootSiteDir` raises. */
function cannotComplete(dir: string, reason: string): SiteDirInvalidError {
  return new SiteDirInvalidError(`.site-meta.json at ${dir} holds only site-key fields and cannot be completed: ${reason}`);
}

/**
 * The schema stamp a key-only meta at `dir` completes with: `content.db`'s applied identity for
 * SQLite, this runtime's for Postgres/PGlite.
 *
 * @throws {SiteDirInvalidError} SQLite with no `content.db`, a never-migrated one, or one whose
 *   lineage this runtime does not recognise — nothing to stamp that would not be a guess.
 */
async function deriveSchemaStamp(dir: string, storage: SiteStorage): Promise<{ schemaVersion: number; schemaTag: string }> {
  if (storage.kind !== "sqlite") {
    const runtime = runtimeSchemaVersion();
    return { schemaVersion: runtime.index, schemaTag: runtime.tag };
  }
  const dbPath = path.join(dir, "content.db");
  if (!fs.existsSync(dbPath)) throw cannotComplete(dir, `no content.db at ${dbPath} to derive its schema stamp from`);
  const identity = await readAppliedSchemaIdentityOfFile(dbPath);
  if (identity === "none") throw cannotComplete(dir, `${dbPath} has never had a migration applied`);
  if (identity === "diverged") throw cannotComplete(dir, `${dbPath}'s latest applied migration matches no entry in this runtime's bundled journal`);
  return { schemaVersion: identity.idx, schemaTag: identity.tag };
}

/**
 * The full meta a key-only `.site-meta.json` at `dir` would be completed into, without writing —
 * `undefined` when the file is not the key-only shape (nothing to complete).
 *
 * @param required.dir - an already-resolved site directory.
 * @throws {SiteDirInvalidError} an invalid `storage`, or see {@link deriveSchemaStamp}.
 * @complexity O(m) in the bundled journal's entry count (one read-only db open), else O(1).
 */
export async function planKeyOnlySiteMetaCompletion(required: { dir: string }): Promise<SiteMetaJson | undefined> {
  const keyOnly = readKeyOnlySiteMeta(required.dir);
  return keyOnly === undefined ? undefined : buildCompletedMeta(required.dir, keyOnly);
}

async function buildCompletedMeta(dir: string, keyOnly: KeyOnlySiteMeta): Promise<SiteMetaJson> {
  return assembleMeta(dir, keyOnly, await deriveSchemaStamp(dir, parseSiteStorage(keyOnly.storage)));
}

/** The full meta for `keyOnly`'s key fields and `stamp` — the one shape every writer here produces. */
function assembleMeta(dir: string, keyOnly: KeyOnlySiteMeta, stamp: { schemaVersion: number; schemaTag: string }): SiteMetaJson {
  const { siteId, ...keyFields } = carriedKeyFields(keyOnly);
  return {
    siteId,
    templateId: UNKNOWN_TEMPLATE_ID,
    templateVersion: UNKNOWN_TEMPLATE_VERSION,
    ...stamp,
    createdAt: dirCreatedAt(dir),
    ...keyFields,
  };
}

/**
 * The complete `.site-meta.json` a site with NO meta yet should be born with, for a freshly minted
 * `siteKeyId` — what `site-key-ensure.ts`'s boot mint writes instead of the key-only shape whenever
 * it can. Only a SQLite `content.db` with migrations applied (and a lineage this runtime knows) has
 * a stamp to derive; anything else — no db yet (a brand-new dev site, whose db the composition
 * creates later), a never-migrated or unreadable one — is `undefined`, and the caller writes the
 * key-only shape, which the boot completes once the db is migrated.
 *
 * @complexity O(m) in the bundled journal's entry count — one read-only db open.
 */
export async function buildSiteMetaForNewKey(required: { dir: string; siteKeyId: string }): Promise<SiteMetaJson | undefined> {
  const dbPath = path.join(required.dir, "content.db");
  if (!fs.existsSync(dbPath)) return undefined;
  let identity: Awaited<ReturnType<typeof readAppliedSchemaIdentityOfFile>>;
  try {
    identity = await readAppliedSchemaIdentityOfFile(dbPath);
  } catch {
    return undefined;
  }
  if (typeof identity === "string") return undefined;
  return assembleMeta(required.dir, { siteKeyId: required.siteKeyId }, { schemaVersion: identity.idx, schemaTag: identity.tag });
}

/** How many times {@link completeKeyOnlySiteMeta} re-derives when the file changes under it. */
const COMPLETION_ATTEMPTS = 3;

/**
 * Completes a key-only `.site-meta.json` at `dir` in place (atomic temp-file + rename). A no-op
 * returning `undefined` for any other content, so it is safe to call before every folder boot.
 *
 * The file is re-read just before the write and the completion re-derived if it changed meanwhile
 * (e.g. another instance's `ensureSiteKey` stamped `siteKeyFingerprint`), so a concurrent key-field
 * write is never overwritten with the older key-only content.
 *
 * @param required.dir - an already-resolved site directory.
 * @returns the meta written, or `undefined` when nothing needed completing.
 * @throws {SiteDirInvalidError} see {@link planKeyOnlySiteMetaCompletion}; nothing is written.
 * @throws whatever the atomic write throws.
 * @complexity see {@link planKeyOnlySiteMetaCompletion}, at most {@link COMPLETION_ATTEMPTS} times.
 */
export async function completeKeyOnlySiteMeta(required: { dir: string }): Promise<SiteMetaJson | undefined> {
  const { dir } = required;
  for (let attempt = 0; attempt < COMPLETION_ATTEMPTS; attempt++) {
    const before = readMetaText(dir);
    const keyOnly = keyOnlyFromText(before);
    if (keyOnly === undefined) return undefined;
    const completed = await buildCompletedMeta(dir, keyOnly);
    if (readMetaText(dir) !== before) continue;
    writeJsonFileAtomic({ filePath: path.join(dir, SITE_META_FILENAME), data: completed }, {});
    return completed;
  }
  return undefined;
}
