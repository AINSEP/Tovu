import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_ROOT_KEY_ENV_VAR_NAME,
  RootKeyFileAlreadyExistsError,
  defaultRootKeyFilePath,
  generateFileRootKey,
  inspectRootKeyMaterial,
  type RootKeyStatus,
} from "../../features/webhooks/keyring.env.js";
import { findKeyDependentData, planRootKeyEnsure } from "../../features/webhooks/site-key-ensure.js";
import { resolveRuntimeMode } from "../../contracts/core/runtime-mode.js";
import { resolveSiteRoot } from "../../platform/site-dir/site-root.js";

/**
 * @file `tovu root-key ensure [--quiet]` — SPEC-003-adjacent CLI command backing decisions 2 and 3
 * of `ADS-memory/.local-artifacts/npm-start-just-works-plan-2026-09-24.md` (Slice 1). Also the
 * `run-from-zip-plan-2026-09-23.md` S1 command — that plan explicitly defers to this one rather
 * than shipping a second implementation.
 *
 * Purpose:
 * A dumb, idempotent "make sure a usable root key exists" step `development/scripts/start.mjs`
 * (Slice 2) spawns before boot, so `npm start` never needs a manually-set
 * `TOVU_INTEGRATIONS_ROOT_KEY` on a fresh checkout. Reuses {@link inspectRootKeyMaterial} and
 * {@link generateFileRootKey} from `keyring.env.ts` as-is — this file owns none of the
 * env-var/file precedence or hex validation, only the decision of WHETHER to mint a file and what
 * to print about it.
 *
 * `planRootKeyEnsure`/`findKeyDependentData` themselves now live in
 * `features/webhooks/site-key-ensure.ts` (site-key plan §A.2 — that module is `ensureSiteKey`'s
 * home too, and the shared place for both decision tables); re-exported here so this command's own
 * existing test suite (`cli/__tests__/unit/root-key-ensure.unit.test.ts`) keeps importing them by
 * name from this module unchanged. This command itself is deleted in Stage A3b once `ensureSiteKey`
 * is wired into every boot path.
 *
 * Architectural role:
 * `cli` layer. The decision itself ({@link planRootKeyEnsure}) is a pure function over an
 * already-computed {@link RootKeyStatus}, runtime mode, and one boolean — kept separate from
 * {@link runRootKeyEnsureCommand}'s I/O (env/file read, DB scan, generate, print) so the decision
 * table is testable without touching a filesystem or process env at all.
 */

export { findKeyDependentData, planRootKeyEnsure };

const KEY_DEPENDENT_DATA_REFUSAL =
  "tovu: this site has saved credentials but its security key is missing. Set TOVU_INTEGRATIONS_ROOT_KEY (in .env or your shell) to the key they were saved with.";

/** Every sibling site's `content.db` under this install's `sites/` root
 *  (`path.dirname(resolveSiteRoot())/*\/content.db`) — not just the currently-active site, since
 *  any site folder in this install could hold data sealed under the current key — plus
 *  `TOVU_CONTENT_DB` when set, since the server honors it (`deps.ts`'s `defaultContentDbPath`) and it
 *  can put the live DB outside `sites/` entirely. Missing entries (a site folder with no
 *  `content.db` yet) are skipped rather than fed to {@link findKeyDependentData}'s fail-closed
 *  path, which is reserved for a path that exists but cannot be read. */
function defaultSiteDbPaths(): string[] {
  const sitesRoot = path.dirname(resolveSiteRoot());
  const siteDbs = existsSync(sitesRoot)
    ? readdirSync(sitesRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(sitesRoot, entry.name, "content.db"))
    : [];
  const override = process.env.TOVU_CONTENT_DB;
  const candidates = override ? [...siteDbs, path.resolve(override)] : siteDbs;
  return [...new Set(candidates)].filter((dbPath) => existsSync(dbPath));
}

export interface RunRootKeyEnsureCommandInput {
  /** Suppresses the one-line announcement on `noop`(active)/`generate` success. `refuse`/`invalid`
   *  always print — the owner needs to see those regardless. Defaults to `false`. */
  readonly quiet?: boolean;
  /** Defaults to {@link defaultRootKeyFilePath}. Test-injected so a suite never touches the real
   *  `~/.tovu/integrations-root-key.hex`. */
  readonly keyFilePath?: string;
  /** Source for `TOVU_RUNTIME_MODE` (via {@link resolveRuntimeMode}) only. `inspectRootKeyMaterial`
   *  below has no env-injection seam of its own and always reads the real `process.env` for
   *  `TOVU_INTEGRATIONS_ROOT_KEY` — a caller that needs to exercise the env-active branch under
   *  test replaces `process.env` itself for the call (see `root-key-ensure.unit.test.ts`'s
   *  `withProcessEnv`, mirroring `serve-site-dir-pin.unit.test.ts`'s own helper). Defaults to
   *  `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /** Defaults to {@link defaultSiteDbPaths}. Test-injected so a suite never scans a real install's
   *  `sites/` tree. */
  readonly siteDbPaths?: readonly string[];
}

/**
 * Runs one `tovu root-key ensure` invocation: reads the current root-key status, decides via
 * {@link planRootKeyEnsure}, and performs the one action that decision calls for. Never overwrites
 * an existing key file or key-dependent database, and never prints key material.
 *
 * @throws whatever {@link generateFileRootKey} throws other than
 *   {@link RootKeyFileAlreadyExistsError} (a lost generate race — caught and treated as a no-op,
 *   since another process already won it).
 * @complexity O(1) plus {@link findKeyDependentData}'s cost, and only on the branch that needs it.
 */
export async function runRootKeyEnsureCommand(input: RunRootKeyEnsureCommandInput = {}): Promise<void> {
  const keyFilePath = input.keyFilePath ?? defaultRootKeyFilePath();
  const mode = resolveRuntimeMode({ env: input.env ?? process.env });
  const status = inspectRootKeyMaterial({ keyFilePath });

  // Only the `generate` branch needs this, and it is the one DB-scanning cost this command has —
  // skip it whenever the decision can't possibly reach `generate` anyway.
  const siteDbsWithKeyData =
    status.active || status.invalid === true || mode !== "local"
      ? false
      : findKeyDependentData(input.siteDbPaths ?? defaultSiteDbPaths());

  const plan = planRootKeyEnsure({ status, mode, siteDbsWithKeyData });

  switch (plan.action) {
    case "invalid": {
      const subject = status.source === "env" ? `in ${DEFAULT_ROOT_KEY_ENV_VAR_NAME}` : `at ${status.keyFilePath}`;
      process.stderr.write(`tovu: security key ${subject} is unreadable (${status.reason}). Nothing was changed.\n`);
      return;
    }
    case "refuse": {
      process.stderr.write(`${KEY_DEPENDENT_DATA_REFUSAL}\n`);
      return;
    }
    case "noop": {
      // The silent (production, nothing configured) case: no source to announce.
      if (!status.active) return;
      if (!input.quiet) {
        process.stdout.write(`tovu root-key: source=${status.source} fingerprint=${status.fingerprint} path=${status.keyFilePath}\n`);
      }
      return;
    }
    case "generate": {
      let generated;
      try {
        generated = generateFileRootKey({ keyFilePath });
      } catch (err) {
        if (err instanceof RootKeyFileAlreadyExistsError) return; // lost race — another process just won it
        throw err;
      }
      if (!input.quiet) {
        process.stdout.write(`tovu root-key: source=generated fingerprint=${generated.fingerprint} path=${generated.keyFilePath}\n`);
      }
      return;
    }
  }
}
