/**
 * @file Server-only build constants: the running Tovu version and the Jini core version this host
 * actually loaded, stamped on every incident record (`ErrorReporterPorts.versions`).
 *
 * Why server-only and resolved once: both describe the running artifact, not the request, so the
 * caller resolves them at host startup and passes the values into composition. Nothing here is
 * bundled for the browser, and nothing re-reads them per request (a redeployed manifest on disk must
 * not relabel incidents from the process still running the old build).
 *
 * Pure functions take the environment and a file reader; only `processBuildConstants` touches
 * `process.env`, the filesystem and module resolution.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { readProductVersion } from "./build-release.js";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";

/** Same shape as `readFileSync(file, 'utf8')`; throws for a missing file. */
export type ReadText = (file: string, encoding: "utf8") => string;
export interface BuildVersions { readonly app: string; readonly jini: string }

/** Unknown stays a fixed label, so a record still says "we could not tell" rather than inventing a version. */
const UNKNOWN_VERSION = "unknown";
const CORE_PACKAGE = "@jini-ai/core";

/**
 * The running version: `TOVU_VERSION`, else the image tag without a leading `v`. Deploy
 * tooling sets these; they win over the manifest because a container image may carry a build whose
 * `package.json` was never bumped. Shared with the site-update binding so both agree on "running".
 * @complexity O(1).
 */
export function runningVersionFrom(env: Readonly<Record<string, string | undefined>>): string | null {
  const explicit = env["TOVU_VERSION"]?.trim();
  if (explicit) return explicit;
  const tag = env["TOVU_IMAGE_TAG"]?.trim();
  return tag ? tag.replace(/^v(?=\d)/, "") : null;
}

/**
 * `versions.app`: env precedence, then the running build's manifest (`runtime-manifest.json`, else
 * the product `package.json` for a source checkout), else `unknown`.
 * @complexity O(manifest size).
 */
export function resolveAppVersion(
  { env, productRoot }: { env: Readonly<Record<string, string | undefined>>; productRoot: string },
  { read }: { read: ReadText },
): string {
  return runningVersionFrom(env) ?? readProductVersion({ productRoot }, { read }) ?? UNKNOWN_VERSION;
}

function manifestAt({ file, read }: { file: string; read: ReadText }): { name?: unknown; version?: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(read(file, "utf8"));
    return value !== null && typeof value === "object" ? value as { name?: unknown; version?: unknown } : undefined;
  } catch {
    // A missing or unreadable package.json at one level is normal (dist/ folders); keep walking up.
    return undefined;
  }
}

/**
 * `versions.jini`: walks up from a resolved core entry file to the first `package.json` named
 * `@jini-ai/core`. Why not the root dependency range: a range (or a workspace link) says what was
 * asked for, not what loaded; incidents must name the code that actually ran. Why walk: core's
 * export map does not publish `./package.json`, and `dist/` may hold a nameless `{ type }` stub.
 * @complexity O(depth of the entry path).
 */
export function resolveJiniVersion({ coreEntry }: { coreEntry: string }, { read }: { read: ReadText }): string {
  let dir = path.dirname(coreEntry);
  for (;;) {
    const manifest = manifestAt({ file: path.join(dir, "package.json"), read });
    if (manifest?.name === CORE_PACKAGE) return typeof manifest.version === "string" && manifest.version.length <= 64 ? manifest.version : UNKNOWN_VERSION;
    const parent = path.dirname(dir);
    if (parent === dir) return UNKNOWN_VERSION;
    dir = parent;
  }
}

/**
 * The thin process binding: reads this process's env, product root and the core package Node
 * resolves from this module. Call once at host startup and pass the result into composition.
 * @complexity O(manifest sizes + path depth).
 */
export function processBuildConstants(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): BuildVersions {
  const coreEntry = createRequire(import.meta.url).resolve(`${CORE_PACKAGE}/errors/reporter`);
  return {
    app: resolveAppVersion({ env: process.env, productRoot: resolveProductRoot({}) }, { read: readFileSync }),
    jini: resolveJiniVersion({ coreEntry }, { read: readFileSync }),
  };
}
