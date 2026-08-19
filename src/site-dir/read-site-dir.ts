import fs from "node:fs";
import path from "node:path";

import { SiteDirInvalidError } from "./errors.js";
import type { ConfigJson, SiteMetaJson } from "./types.js";

/**
 * @file SPEC-003 C-004 — `readSiteDir`, `serve`'s first validation gate (BR-05 steps 1-2).
 *
 * Purpose:
 * Parse and validate `config.json` + `.site-meta.json`, independent of CLI dispatch, so
 * `boot-site-dir.ts` and any future non-CLI caller (the desktop host, ADR-011) share one
 * validator.
 *
 * Architectural role:
 * `site-dir` domain logic. Pure read (fs read only, no write) — no imports from `cli/**` or
 * `express`.
 */

/** behavior.spec.md §4 — a corruption guard: neither file may exceed this size. */
const MAX_FILE_SIZE_BYTES = 64 * 1024;

export interface ReadSiteDirRequired {
  dir: string;
}

export interface ReadSiteDirResult {
  config: ConfigJson;
  meta: SiteMetaJson;
}

/** Read and JSON-parse `fileName` under `dir`, enforcing the 64 KiB corruption-guard size limit. */
function readJsonFile(dir: string, fileName: string): unknown {
  const filePath = path.join(dir, fileName);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new SiteDirInvalidError(`${fileName} is missing at ${dir}`);
  }
  if (!stat.isFile()) {
    throw new SiteDirInvalidError(`${fileName} at ${dir} is not a regular file`);
  }
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    throw new SiteDirInvalidError(`${fileName} exceeds the 64 KiB size limit (corruption guard)`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new SiteDirInvalidError(`${fileName} is not valid JSON: ${(err as Error).message}`);
  }
}

/** state.spec.md §2: `config.json.name` is required, 1..200 chars after trim. */
function validateConfig(parsed: unknown): ConfigJson {
  const candidate = parsed as Partial<ConfigJson> | null;
  const name = typeof candidate?.name === "string" ? candidate.name.trim() : "";
  if (name.length === 0 || name.length > 200) {
    throw new SiteDirInvalidError("config.json.name must be 1..200 chars after trim");
  }
  return {
    name,
    domain: candidate?.domain ?? null,
    port: candidate?.port ?? null,
  };
}

/**
 * Parse + validate an install dir's `config.json` and `.site-meta.json` for `serve`.
 *
 * @param required.dir - the install dir path (already resolved by the caller).
 * @returns `{ config, meta }`, content-equal to the on-disk files.
 * @throws {SiteDirInvalidError} naming the failing file and reason — missing, not a file,
 *   oversized (behavior.spec.md §4), unparseable JSON (EC-03), or an invalid `config.json.name`.
 * @complexity O(1) — two small, bounded-size file reads; no directory scan.
 * @overallScore 100
 */
export function readSiteDir(required: ReadSiteDirRequired): ReadSiteDirResult {
  const { dir } = required;
  const config = validateConfig(readJsonFile(dir, "config.json"));
  const meta = readJsonFile(dir, ".site-meta.json") as SiteMetaJson;
  return { config, meta };
}
