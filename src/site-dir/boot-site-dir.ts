import fs from "node:fs";
import path from "node:path";

import { openContentDb, type ContentDb } from "../infra/sqlite/content-db";
import { writeJsonFileAtomic } from "./atomic-write";
import { SiteCorruptError, SiteDirInvalidError } from "./errors";
import { readSiteDir } from "./read-site-dir";
import { resolveInstallDirTarget } from "./resolve-install-dir-target";
import { resolveWorkspace } from "./resolve-workspace";
import { compareSchemaVersion, runtimeSchemaVersion } from "./schema-guard";
import type { ConfigJson, SiteMetaJson } from "./types";

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

export interface BootSiteDirResult {
  db: ContentDb;
  workspaceId: string;
  config: ConfigJson;
}

/**
 * Validate, guard, migrate, stamp, and resolve the workspace for `serve` (BR-05).
 *
 * @param required.dir - the install dir path; resolved once (CIC U-004) into `target`.
 * @param options.workspaceId - when supplied, resolve exactly this workspace id instead of the
 *   default (oldest) — threaded from `tovu serve --workspace <id>`.
 * @returns `{ db, workspaceId, config }` — `db` is the one open, migrated content.db handle;
 *   `cli/commands/serve.ts` passes it straight to `createSqliteRouteDeps`'s `overrides` (no
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
export function bootSiteDir(required: BootSiteDirRequired, options: BootSiteDirOptions = {}): BootSiteDirResult {
  const { dir } = required;
  const target = resolveInstallDirTarget(dir);

  // BR-05 steps 1-2: dir/config/meta validation (SiteDirInvalidError).
  const { config, meta } = readSiteDir({ dir: target });

  const dbPath = path.join(target, "content.db");
  if (!fs.existsSync(dbPath)) {
    throw new SiteDirInvalidError(`bootSiteDir: content.db is missing at ${dbPath}`);
  }

  // BR-05 step 4: schema guard, BEFORE the db is ever opened — a newer-or-divergent site's
  // content.db must never be written (AC-06), so this must not be reordered after the open below.
  const decision = compareSchemaVersion({ schemaVersion: meta.schemaVersion, schemaTag: meta.schemaTag });

  // BR-05 step 3 (continued): open + migrate. A locked/corrupt db surfaces here (EC-05, RT-002).
  let db: ContentDb;
  try {
    db = openContentDb(dbPath);
  } catch (err) {
    throw new SiteCorruptError(`bootSiteDir: content.db at ${dbPath} could not be opened: ${(err as Error).message}`);
  }

  try {
    // BR-05 step 5 / BR-06 / CIC U-002-B2/ORD1: the stamp rewrite happens ONLY when a migration
    // was actually needed, both fields together, in one atomic operation, and only AFTER
    // `migrate()` (already run inside `openContentDb` above) has returned successfully.
    if (decision === "migrate") {
      const runtime = runtimeSchemaVersion();
      const updatedMeta: SiteMetaJson = { ...meta, schemaVersion: runtime.index, schemaTag: runtime.tag };
      writeJsonFileAtomic(path.join(target, ".site-meta.json"), updatedMeta);
    }

    // BR-05 step 6 / CIC U-002-ORD2: workspace resolution is the final gate before the caller
    // may bind a listener — this must run AFTER the stamp write above, not before.
    const workspace = resolveWorkspace({ db }, { workspaceId: options.workspaceId });

    // EC-07: an unrecognized templateId is provenance-only — warn, never block serving.
    if (meta.templateId !== "starter") {
      // eslint-disable-next-line no-console
      console.warn(`bootSiteDir: unrecognized .site-meta.json templateId "${meta.templateId}" at ${target} — proceeding (provenance only)`);
    }

    return { db, workspaceId: workspace.id, config };
  } catch (err) {
    db.$client.close();
    throw err;
  }
}
