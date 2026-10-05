import fs from "node:fs";
import path from "node:path";

import { contentKernel } from "../db/content-kernel.js";
import { closeSqliteConnection } from "../db/kernel/index.js";
import { prepareContentStore } from "../db/prepare-content-store.js";
import { type ContentDb, migrateSqliteContentFile, openSqliteContentConnection } from "../db/sqlite/content-db.js";
import { runBootDataRepairs } from "#src/server/runtime/composition/boot-data-repairs";
import { openSiteStore, type SiteStore } from "#src/server/runtime/composition/open-site-store";
import { writeJsonFileAtomic } from "./atomic-write.js";
import { SiteCorruptError, SiteDirInvalidError } from "./errors.js";
import { readSiteDir } from "./read-site-dir.js";
import { resolveInstallDirTarget } from "./resolve-install-dir-target.js";
import { resolveWorkspace } from "./resolve-workspace.js";
import { compareSchemaVersion, runtimeSchemaVersion } from "./schema-guard.js";
import { parseSiteStorage } from "./site-storage.js";
import type { ConfigJson, SiteMetaJson, SiteStorage } from "./types.js";

/**
 * @file SPEC-003 C-008 — `bootSiteDir`, `tovu serve`'s validate -> guard -> migrate+stamp ->
 * resolve orchestration (BR-05/BR-06).
 *
 * Purpose:
 * Owns BR-06's stamp-write-after-migrate ordering in one place (CIC U-002): the schema guard
 * (step 4) runs BEFORE the db is ever opened, so a newer-or-divergent site's `content.db` is
 * never touched (AC-06); the `.site-meta.json` stamp rewrite (step 5) happens only AFTER
 * `migrate()` has already returned successfully, both fields written together in one atomic
 * operation (U-002-B2/ORD1); workspace resolution (step 6) is the final gate before the caller
 * (`cli/commands/serve.ts`) binds a listener (U-002-ORD2).
 *
 * Architectural role:
 * `site-dir` domain logic. No dependency on `cli/**` or `express` — this function never binds a
 * port; that is `cli`'s job (BR-05 step 7 lives one layer up). Every fs/db path here is derived
 * from the ONE resolved `target` (INV-01, CIC U-004).
 */

export interface BootSiteDirRequired {
  dir: string;
}

export interface BootSiteDirOptions {
  /** Resolve this exact workspace id instead of the default (oldest) — `tovu serve --workspace <id>`. */
  workspaceId?: string;
}

interface BootSiteDirResultBase {
  workspaceId: string;
  config: ConfigJson;
}

/** A SQLite site: the one open, migrated `content.db` handle. */
export interface SqliteSiteDirBoot extends BootSiteDirResultBase {
  storage: Extract<SiteStorage, { kind: "sqlite" }>;
  db: ContentDb;
  store?: undefined;
}

/** A Postgres/PGlite site (`.site-meta.json` `storage`): the store `openSiteStore` opened, at head. */
export interface StoreSiteDirBoot extends BootSiteDirResultBase {
  storage: Exclude<SiteStorage, { kind: "sqlite" }>;
  store: SiteStore;
  db?: undefined;
}

export type BootSiteDirResult = SqliteSiteDirBoot | StoreSiteDirBoot;

/**
 * Closes what {@link bootSiteDir} opened. `composed` is the store `createSiteRouteDeps` handed to
 * `onStoreOpened` when the composition got that far: closing it stops the composition's sweeps
 * (guest-chat, submission-IP retention; waiting for a pass in flight) and then closes `boot.store`
 * (Postgres/PGlite) or the `chat.db` the composition opened beside `content.db` (SQLite). Without
 * it, `boot.store` is closed directly. SQLite's borrowed `content.db` closes LAST, and even when
 * that close rejects: closing it first left a sweep batch still in flight on a closed connection.
 */
export async function closeSiteDirBoot(boot: BootSiteDirResult, composed?: Pick<SiteStore, "close">): Promise<void> {
  try {
    if (composed !== undefined) await composed.close();
    else if (boot.store !== undefined) await boot.store.close();
  } finally {
    if (boot.db !== undefined) closeSqliteConnection(boot.db);
  }
}

/**
 * Validate, guard, migrate, stamp, and resolve the workspace for `serve` (BR-05).
 *
 * @param required.dir - the install dir path; resolved once (CIC U-004) into `target`.
 * @param options.workspaceId - when supplied, resolve exactly this workspace id instead of the
 *   default (oldest) — threaded from `tovu serve --workspace <id>`.
 * @returns (as a promise; every failure below is a rejection) `{ storage, db | store, workspaceId,
 *   config }` — on SQLite `db` is the one open, migrated content.db handle; on Postgres/PGlite
 *   (`.site-meta.json` `storage`) `store` is the one opened store (see {@link bootStoreSiteDir}).
 *   `cli/commands/serve.ts` passes either straight to `createSiteRouteDeps`'s `overrides` (no
 *   second db is ever opened for the same boot).
 * @throws {SiteDirInvalidError} `config.json`/`.site-meta.json` invalid (via `readSiteDir`), or
 *   `content.db` missing entirely.
 * @throws {SiteNewerThanRuntimeError} the site's schema is newer than, or diverges from, this
 *   runtime's (BR-05 step 4) — thrown BEFORE the db is opened, so it is never written (AC-06).
 * @throws {SiteCorruptError} `content.db` is unreadable/locked/corrupt (EC-05, RT-002), or the
 *   workspace table has zero rows (BR-05 step 6, via `resolveWorkspace`).
 * @throws {ValidationError} `options.workspaceId` was supplied but matches no workspace row.
 * @complexity Bounded — one db open+migrate, at most one atomic stamp rewrite, one workspace
 *   SELECT per call; not a function of any caller-controlled collection.
 * @overallScore 100
 */
export async function bootSiteDir(required: BootSiteDirRequired, options: BootSiteDirOptions = {}): Promise<BootSiteDirResult> {
  const { dir } = required;
  const target = resolveInstallDirTarget(dir);

  // BR-05 steps 1-2: dir/config/meta validation (SiteDirInvalidError).
  const { config, meta } = readSiteDir({ dir: target });
  const storage = parseSiteStorage(meta.storage);
  if (storage.kind !== "sqlite") return bootStoreSiteDir({ target, storage, config, meta }, options);

  const dbPath = path.join(target, "content.db");
  if (!fs.existsSync(dbPath)) {
    throw new SiteDirInvalidError(`bootSiteDir: content.db is missing at ${dbPath}`);
  }

  // BR-05 step 4: schema guard, BEFORE the db is ever opened — a newer-or-divergent site's
  // content.db must never be written (AC-06), so this must not be reordered after the open below.
  const decision = compareSchemaVersion({ schemaVersion: meta.schemaVersion, schemaTag: meta.schemaTag });

  // BR-05 step 3 (continued): open + migrate (the runner; a copy in `ops/` first when a step is
  // pending). A locked/corrupt db surfaces here (EC-05, RT-002).
  let db: ContentDb;
  try {
    db = openSqliteContentConnection(dbPath);
  } catch (err) {
    throw new SiteCorruptError(`bootSiteDir: content.db at ${dbPath} could not be opened: ${(err as Error).message}`);
  }

  try {
    await migrateSqliteContentFile(db, dbPath);

    // The watermark singleton row every content store carries.
    await prepareContentStore(contentKernel(db));
    // The stored-data repairs every other store opener runs. The CLI hands this handle to the
    // composition as `overrides.db`, which skips `openSiteContentDb` (where SQLite runs them), so
    // without this `tovu serve <dir>`/`tovu export <dir>` never repaired a SQLite install.
    await runBootDataRepairs({ kernel: contentKernel(db) });

    // BR-05 step 5 / BR-06 / CIC U-002-B2/ORD1: the stamp rewrite happens ONLY when a migration
    // was actually needed, both fields together, in one atomic operation, and only AFTER
    // `migrateSqliteContentFile` above has returned successfully.
    if (decision === "migrate") {
      const runtime = runtimeSchemaVersion();
      const updatedMeta: SiteMetaJson = { ...meta, schemaVersion: runtime.index, schemaTag: runtime.tag };
      writeJsonFileAtomic(path.join(target, ".site-meta.json"), updatedMeta);
    }

    // BR-05 step 6 / CIC U-002-ORD2: workspace resolution is the final gate before the caller
    // may bind a listener — this must run AFTER the stamp write above, not before.
    const workspace = await resolveWorkspace({ kernel: contentKernel(db) }, { workspaceId: options.workspaceId });

    // EC-07: an unrecognized templateId is provenance-only — warn, never block serving.
    if (meta.templateId !== "starter") {
      // eslint-disable-next-line no-console
      console.warn(`bootSiteDir: unrecognized .site-meta.json templateId "${meta.templateId}" at ${target} — proceeding (provenance only)`);
    }

    return { storage, db, workspaceId: workspace.id, config };
  } catch (err) {
    closeSqliteConnection(db);
    throw err;
  }
}

/**
 * The Postgres/PGlite arm of {@link bootSiteDir}: `openSiteStore` (connection secret → migrations
 * to head → prepared store), then the same workspace gate. The SQLite schema guard and its
 * `.site-meta.json` stamp are skipped: they describe `content.db`'s legacy chain, and a Postgres
 * store's own history is its migration ledger, which the runner checks while it opens.
 *
 * @throws whatever `openSiteStore` throws (`StorageSecretError`, `PgliteOwnerLockedError` when the
 *   PGlite data dir is already served, a migration failure); `resolveWorkspace`'s errors. The store is
 *   closed before any rejection.
 */
async function bootStoreSiteDir(
  required: { target: string; storage: StoreSiteDirBoot["storage"]; config: ConfigJson; meta: SiteMetaJson },
  options: BootSiteDirOptions
): Promise<StoreSiteDirBoot> {
  const { target, storage, config, meta } = required;
  const store = await openSiteStore({
    storage,
    dbPath: path.join(target, "content.db"),
    chatDbPath: path.join(target, "chat.db"),
    role: "owner",
  });
  try {
    const workspace = await resolveWorkspace({ kernel: store.content }, { workspaceId: options.workspaceId });
    if (meta.templateId !== "starter") {
      // eslint-disable-next-line no-console
      console.warn(`bootSiteDir: unrecognized .site-meta.json templateId "${meta.templateId}" at ${target} — proceeding (provenance only)`);
    }
    return { storage, store, workspaceId: workspace.id, config };
  } catch (err) {
    await store.close();
    throw err;
  }
}
