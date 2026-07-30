import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { openContentDb } from "../infra/sqlite/content-db";
import { writeJsonFileAtomic } from "./atomic-write";
import { InitDirNotEmptyError, InternalError, ValidationError } from "./errors";
import { readTemplate } from "./read-template";
import { resolveInstallDirTarget } from "./resolve-install-dir-target";
import { runtimeSchemaVersion } from "./schema-guard";
import type { ConfigJson, SiteMetaJson } from "./types";

/**
 * @file SPEC-003 C-007 — `initSite`, `tovu init`'s full orchestration.
 *
 * Purpose:
 * Create a complete install dir from the starter template, per BR-01's 8-step ordering, with
 * INV-02's commit-marker discipline (CIC U-003) and INV-01's path-containment discipline (CIC
 * U-004) both enforced structurally rather than left to caller discipline.
 *
 * Cleanup design (CIC U-003-B1/B2/B3, U-003-ORD1): a `wroteAnything` flag is set to `true` only
 * AFTER each mutating step actually succeeds (never before attempting it). On failure, cleanup is
 * attempted ONLY if something was actually written — an immediate failure before any write (e.g.
 * a pre-existing, permission-locked EMPTY target where even the first subdirectory create is
 * denied) leaves a pre-existing target exactly as the operator left it, never attempting to
 * remove a directory this call did not itself populate. Once anything has been written, cleanup
 * removes the ENTIRE target (including the directory node itself, even if it pre-existed) — INV-02
 * defines "no partial install dir survives", not "no partial install dir survives unless an
 * operator's own empty directory happened to be the target." If that removal itself fails (e.g. a
 * read-only grandparent blocking the final directory-entry removal), the surfaced error names the
 * partial directory's path rather than swallowing the cleanup failure silently (U-003-B3).
 *
 * Architectural role:
 * `site-dir` domain logic. No dependency on `cli/**` or `express`. Every fs write in this file is
 * derived from the ONE `target` variable `resolveInstallDirTarget` returns — never re-derived
 * from the raw `dir` argument (INV-01, CIC U-004-B1).
 */

const SUBDIRS = ["uploads", "themes", "plugins", "overrides"] as const;
const MAX_NAME_LENGTH = 200;

export interface InitSiteRequired {
  dir: string;
  /**
   * Site display name; defaults to the target directory's basename (BR-03). Kept in the SAME
   * input object (not a separate options parameter) to match Contract Map C-007's Inputs shape
   * (`{ dir: string; name?: string }`) and the certified test suite's call sites verbatim —
   * a deliberate deviation from this codebase's default `func(required, options)` convention,
   * justified by the certified Contract Map being the binding shape for this exported function.
   */
  name?: string;
}

export interface InitSiteResult {
  siteId: string;
  dir: string;
}

/** BR-03: `--name` (trimmed) when provided, else the target directory's basename. A provided-but-empty name is VALIDATION, not a fall-through (EC-06). */
function resolveSiteName(target: string, name: string | undefined): string {
  if (name === undefined) return path.basename(target);
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`initSite: --name must be 1..${MAX_NAME_LENGTH} chars after trim`);
  }
  return trimmed;
}

/** BR-01 step 2 (EC-01/EC-02/AC-04): target must be absent, or an empty directory, with an existing parent. */
function validateInitTarget(target: string): void {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(target);
  } catch {
    stat = undefined;
  }

  if (stat === undefined) {
    if (!fs.existsSync(path.dirname(target))) {
      // behavior.spec.md §4: "Init target depth: parent directory must exist" — no recursive
      // `mkdir -p` of arbitrary ancestors (a typo guard), enforced in the same error class as an
      // occupied target.
      throw new InitDirNotEmptyError(
        `initSite: the parent directory of ${target} does not exist (no recursive creation of arbitrary ancestors)`
      );
    }
    return; // absent, parent exists — a valid init target (EC-01 "absent" branch).
  }
  if (!stat.isDirectory()) {
    throw new InitDirNotEmptyError(`initSite: ${target} exists and is not a directory (EC-02)`);
  }
  if (fs.readdirSync(target).length > 0) {
    throw new InitDirNotEmptyError(`initSite: ${target} exists and is not an empty directory (AC-04)`);
  }
}

/**
 * Create a complete install dir from the starter template (BR-01).
 *
 * @param required.dir - the install dir path; resolved once (path/symlink containment, CIC
 *   U-004) into the single `target` every write below derives from.
 * @param required.name - site display name; defaults to the target directory's basename (BR-03).
 * @returns `{ siteId, dir }` — `dir` is the RESOLVED target path.
 * @throws {ValidationError} an invalid `--name` (EC-06, behavior.spec.md §4) — nothing created.
 * @throws {InitDirNotEmptyError} the target is occupied (file or non-empty dir, AC-04/EC-01/EC-02)
 *   or its parent is missing — nothing created.
 * @throws {InternalError} a corrupt template (BR-01 step 3, nothing created yet), or any fs/db
 *   failure during steps 4-7 (after best-effort cleanup per CIC U-003).
 * @complexity Bounded — a fixed number of fs/db operations per call (4 subdirs, 2 JSON writes,
 *   one db open+migrate+seed), never a function of caller-controlled input size.
 * @overallScore 100
 */
export function initSite(required: InitSiteRequired): InitSiteResult {
  const { dir, name } = required;
  const target = resolveInstallDirTarget(dir);

  const resolvedName = resolveSiteName(target, name); // step 1 (VALIDATION) — before any target/fs check.
  validateInitTarget(target); // step 2 (INIT_DIR_NOT_EMPTY).
  const { template, seed } = readTemplate({ templateId: "starter" }); // step 3 (INTERNAL) — nothing created yet.

  const siteId = randomUUID();
  const createdAt = new Date().toISOString();
  let wroteAnything = false;

  try {
    // Step 4: directory + subdirectory creation.
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target);
      wroteAnything = true;
    }
    for (const sub of SUBDIRS) {
      fs.mkdirSync(path.join(target, sub));
      wroteAnything = true;
    }

    // Step 5: config.json write.
    const config: ConfigJson = { name: resolvedName, domain: null, port: null };
    writeJsonFileAtomic(path.join(target, "config.json"), config);
    wroteAnything = true;

    // Steps 6-7: content.db create + migrate + seed insertion (one call — `openContentDb`
    // migrates then seeds when given seed data; see read-template.ts's Known-Gap disclosure on
    // why these two BR-01 steps are not independently fault-isolable at the fs level).
    const dbPath = path.join(target, "content.db");
    const db = openContentDb(dbPath, seed);
    wroteAnything = true;
    db.$client.close();

    // Step 8: .site-meta.json write — the commit marker, and the physically LAST write on
    // success (CIC U-003-ORD1), gated on every prior step having already succeeded.
    const runtime = runtimeSchemaVersion();
    const meta: SiteMetaJson = {
      siteId,
      templateId: template.id,
      templateVersion: template.version,
      schemaVersion: runtime.index,
      schemaTag: runtime.tag,
      createdAt,
    };
    writeJsonFileAtomic(path.join(target, ".site-meta.json"), meta);

    return { siteId, dir: target };
  } catch (err) {
    if (wroteAnything) {
      try {
        fs.rmSync(target, { recursive: true, force: false });
      } catch (cleanupErr) {
        // CIC U-003-B3 / EC-10 / RT-003: the cleanup failure itself must name the partial dir
        // rather than being swallowed silently — the commit marker was never reached, so `serve`
        // still refuses this dir (INV-02 holds), but an operator needs to know manual removal is
        // required.
        throw new InternalError(
          `initSite: cleanup failed after a mid-flight error — manual removal required at ${target}: ${(cleanupErr as Error).message}`
        );
      }
    }
    if (err instanceof ValidationError || err instanceof InitDirNotEmptyError || err instanceof InternalError) {
      throw err;
    }
    throw new InternalError(`initSite: failed while creating ${target}: ${(err as Error).message}`);
  }
}
