import { join } from "node:path";

import { DEFAULT_ROOT_KEY_ENV_VAR_NAME } from "./keyring.env.js";
import type { RuntimeMode } from "#src/contracts/core/runtime-mode";

/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md` §A.1/A.2) —
 * candidate source ORDER only. Pure: describes WHERE the site key could be found, never reads a
 * file or an env var itself, and never validates or mints anything (that is
 * `site-key-ensure.ts`'s job).
 *
 * Local mode checks, in order: this site's own key file, the env var, then the one legacy shared
 * file every install used before per-site keys existed. Production checks only the env var and the
 * legacy durable-volume file — it never has (or wants) a per-site file; see A.1's "why per-site
 * rather than one key per OS user" and A.3's "production never mints".
 *
 * The env var name itself is `TOVU_SITE_KEY` when already set, otherwise the current (pre-rename)
 * `TOVU_INTEGRATIONS_ROOT_KEY` — Stage D1 (not built yet) is what turns this into a real dual-name
 * alias with conflict detection; today this module only prefers the new name when it happens to
 * already be present.
 *
 * Architectural role:
 * `features/webhooks` domain helper, alongside `keyring.env.ts` (whose readers this feeds) and
 * `site-key-ensure.ts` (whose one writer consumes the same ordering).
 */

/** The site key's forward-looking env var name (site-key plan §B.1: the eventual rename target).
 *  Preferred over {@link DEFAULT_ROOT_KEY_ENV_VAR_NAME} whenever it is already set. */
export const SITE_KEY_ENV_VAR_NAME = "TOVU_SITE_KEY";

/** The legacy shared-file name every pre-per-site-key install still carries — reused verbatim (not
 *  duplicated) via {@link legacySharedFilePath}/{@link legacyVolumeFilePath}, so this module and
 *  `keyring.env.ts`'s `defaultRootKeyFilePath` can never drift on the same literal. */
const LEGACY_KEY_FILENAME = "integrations-root-key.hex";

export type SiteKeySourceKind = "per-site-file" | "env" | "legacy-shared-file" | "legacy-volume-file";

/** One candidate place to look for the site key, in the order a caller should try them. Exactly
 *  one of `path`/`envVarName` is set, matching `kind` (`"env"` → `envVarName`, everything else →
 *  `path`) — never both, never neither. */
export interface SiteKeySource {
  readonly kind: SiteKeySourceKind;
  readonly path?: string;
  readonly envVarName?: string;
}

export interface SiteKeySourcesInput {
  readonly mode: RuntimeMode;
  /** A snapshot of the process env to consult — never read directly, so this stays pure and
   *  testable without mutating `process.env`. */
  readonly env: Record<string, string | undefined>;
  readonly home: string;
  readonly cwd: string;
  /** This site's `siteKeyId` (`.site-meta.json`, A.4). Omitted (or empty) drops the per-site
   *  candidate entirely — there is nowhere to look yet for a site with no id stamped. */
  readonly siteKeyId?: string;
}

/**
 * The ordered list of places to look for this site's key. Order is significant — the FIRST source
 * whose material resolves wins (site-key plan §A.2's "the per-site file wins over the env var").
 *
 * @complexity O(1) — a fixed-size list, no I/O.
 */
export function siteKeySources(input: SiteKeySourcesInput): SiteKeySource[] {
  const envSource: SiteKeySource = { kind: "env", envVarName: resolveEnvVarName(input.env) };

  if (input.mode === "production") {
    return [envSource, { kind: "legacy-volume-file", path: legacyVolumeFilePath(input.cwd) }];
  }

  const sources: SiteKeySource[] = [];
  if (input.siteKeyId) {
    sources.push({ kind: "per-site-file", path: perSiteFilePath(input.home, input.siteKeyId) });
  }
  sources.push(envSource);
  sources.push({ kind: "legacy-shared-file", path: legacySharedFilePath(input.home) });
  return sources;
}

/** Prefers the new `TOVU_SITE_KEY` name when it is already set; otherwise names the current real
 *  var so an unmodified install (nothing D1-renamed yet) still resolves. */
function resolveEnvVarName(env: Record<string, string | undefined>): string {
  return env[SITE_KEY_ENV_VAR_NAME] !== undefined ? SITE_KEY_ENV_VAR_NAME : DEFAULT_ROOT_KEY_ENV_VAR_NAME;
}

/** `~/.tovu/site-keys/<siteKeyId>.hex` — A.1's per-site local path. */
function perSiteFilePath(home: string, siteKeyId: string): string {
  return join(home, ".tovu", "site-keys", `${siteKeyId}.hex`);
}

/** `~/.tovu/integrations-root-key.hex` — the one shared file every install had before per-site
 *  keys, still read (never written by a reader) as an adoption source. */
function legacySharedFilePath(home: string): string {
  return join(home, ".tovu", LEGACY_KEY_FILENAME);
}

/** `<cwd>/sites/.tovu/integrations-root-key.hex` — the production durable-volume path
 *  (`keyring.env.ts`'s `defaultRootKeyFilePath` production branch), reused here unchanged. */
function legacyVolumeFilePath(cwd: string): string {
  return join(cwd, "sites", ".tovu", LEGACY_KEY_FILENAME);
}
