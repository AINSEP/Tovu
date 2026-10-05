import fs from "node:fs";
import path from "node:path";

import { SiteDirInvalidError } from "./errors.js";
import type { SiteStorage } from "./types.js";

/**
 * @file Which database engine a site runs on — `.site-meta.json`'s optional `storage` field
 * (R1 plan §0, ADR-067).
 *
 * Lenient on purpose: a site folder may carry a partial meta file (the dev site's holds only its
 * site-key fields until `key-only-site-meta.ts` completes it, and the same-directory dev boot never
 * runs `readSiteDir`), or none at all, and
 * both mean SQLite, exactly as before this field existed. Only a `storage` value that is present
 * and wrong is refused, because guessing SQLite for a site that asked for Postgres would boot an
 * empty store in its place.
 */

export const SITE_META_FILENAME = ".site-meta.json";

/** The storage every site has unless its meta file says otherwise. */
export const DEFAULT_SITE_STORAGE: SiteStorage = Object.freeze({ kind: "sqlite" }) as SiteStorage;

/** Keys that would put a connection secret in the meta file; O3 keeps it sealed or in the environment. */
const SECRET_BEARING_KEYS = ["connectionString", "url", "password"] as const;

/** An environment variable name: letters, digits and `_`, not starting with a digit. */
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function invalid(reason: string): never {
  throw new SiteDirInvalidError(`${SITE_META_FILENAME} storage ${reason}`);
}

function parseSecretRef(value: unknown): "site" | { env: string } {
  if (value === "site") return "site";
  const env = (value as { env?: unknown } | null)?.env;
  if (typeof value === "object" && value !== null && typeof env === "string" && ENV_NAME.test(env)) return { env };
  return invalid(`secretRef must be "site" or { "env": "<VARIABLE_NAME>" }`);
}

/**
 * Validates a meta file's `storage` value. `undefined` (the field is absent) is SQLite.
 *
 * @throws {SiteDirInvalidError} for an unknown `kind`, a malformed `secretRef`, or a connection
 *   secret written into the meta file.
 */
export function parseSiteStorage(value: unknown): SiteStorage {
  if (value === undefined) return DEFAULT_SITE_STORAGE;
  if (typeof value !== "object" || value === null) return invalid("must be an object with a kind");
  const candidate = value as Record<string, unknown>;
  for (const key of SECRET_BEARING_KEYS) {
    if (key in candidate) invalid(`must not hold "${key}": the connection string is sealed with the site key or read from the environment`);
  }
  switch (candidate.kind) {
    case "sqlite":
      return { kind: "sqlite" };
    case "pglite":
      return { kind: "pglite" };
    case "postgres":
      return { kind: "postgres", secretRef: parseSecretRef(candidate.secretRef) };
    default:
      return invalid(`kind ${JSON.stringify(candidate.kind)} is not one of "sqlite", "pglite", "postgres"`);
  }
}

/**
 * The storage for the site in `siteDir`, read from its `.site-meta.json`.
 *
 * @param siteDir - the site folder, or `":memory:"` (always SQLite).
 * @returns SQLite when the meta file or its `storage` field is absent.
 * @throws {SiteDirInvalidError} when the meta file is not JSON or its `storage` is invalid.
 * @complexity O(1) — one small file read.
 */
export function resolveSiteStorage(siteDir: string): SiteStorage {
  if (siteDir === ":memory:") return DEFAULT_SITE_STORAGE;
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(siteDir, SITE_META_FILENAME), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_SITE_STORAGE;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SiteDirInvalidError(`${SITE_META_FILENAME} is not valid JSON: ${(err as Error).message}`);
  }
  return parseSiteStorage((parsed as { storage?: unknown } | null)?.storage);
}
