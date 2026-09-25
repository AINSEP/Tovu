import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Express, Request, Response } from "express";

import {
  defaultRootKeyFilePath,
  generateFileRootKey,
  inspectRootKeyMaterial,
  revealRootKeyMaterial,
  RootKeyFileAlreadyExistsError,
  type RootKeyStatus,
} from "#src/features/webhooks/keyring.env";
import {
  findKeyDependentData,
  readSiteMetaJson,
  resolveSiteKeyFingerprint,
  siteKeyFilePathFrom,
  siteKeySourcesForSiteDir,
  type SiteKeySource,
} from "#src/features/webhooks/site-key-sources";
import { SITE_TOKEN_MANAGE_PERMISSION } from "#src/features/identity/site-token-permission";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import type { SiteTokenState } from "#src/contracts/core/site-token-state";
import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";
import { writeJsonFileAtomic } from "#src/platform/site-dir/atomic-write";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Secrets panel → Site Token tab's backend: `GET`, `POST .../generate`, and
 * `POST .../reveal`, under `/api/admin/v1/workspaces/:workspaceId/system/site-token`.
 *
 * ## What this manages
 *
 * The generated-file half of `EnvOrFileKeyring`'s root-key resolution (`features/webhooks/
 * keyring.env.ts`) — the file at `defaultRootKeyFilePath()` a keyring constructed with
 * `allowFileFallback: true` falls back to when `TOVU_INTEGRATIONS_ROOT_KEY` is unset.
 *
 * ## 2026-09-09 durability fix — this now genuinely works in production, with one disclosed gap
 *
 * Until this fix, a generated file could never help production: the boot gate checked only the
 * env var, the default path resolved under the container's ephemeral rootfs (wiped every
 * redeploy), and `siteAssistantSecretKeyring` refused to read a file at all. All three are fixed:
 * `defaultRootKeyFilePath()` is mode-aware (the durable Fly-volume-backed `<cwd>/sites/.tovu/
 * integrations-root-key.hex` in production), `hasMissingIntegrationsRootKey`
 * (`runtime/boot/boot-readiness-gate.ts`) now accepts a valid file too, and
 * `siteAssistantSecretKeyring` (`composition/deps.ts`) now reads (but never auto-generates) one.
 *
 * The one remaining, DISCLOSED gap: `newsletterKeyring` (webhook signing, newsletter unsubscribe
 * tokens) still requires the env var in production — its `allowFileFallback: runtimeMode !==
 * "production"` construction is deliberately UNCHANGED (a committed regression test pins it, and
 * this pass's dispatch scoped the production fix to the credential-sealing keyring specifically).
 * So: generating a key here in production DOES now protect every real stored credential (BYOK,
 * publish/source-control/custom creds, media-provider secrets), but does NOT cover webhook
 * signing / newsletter tokens unless the env var is also set. `SiteTokenTab.tsx`'s scope notice
 * states this split plainly rather than claiming uniform coverage.
 *
 * ## The accepted security tradeoff — read this before "fixing" the asymmetry away
 *
 * A generated key file now lives on the SAME Fly volume as `content.db`. Someone who obtains a
 * volume snapshot/backup gets both the ciphertext and the key that opens it — the "leaked backup
 * alone is not enough" defense ADR-058 §9 described no longer holds once a file exists. This is an
 * OWNER-APPROVED, DOCUMENTED cost of making the install self-contained (no `fly secrets set`
 * required), not an oversight. See `composition/deps.ts`'s `siteAssistantSecretKeyring`
 * construction comment and `ADS-memory/reports/2026-09-09-security-site-token.md` for the full
 * writeup.
 *
 * ## Visibility — reveal, not just fingerprint
 *
 * `POST .../reveal` returns the raw key value (whichever source is currently active). This is a
 * deliberate supersession of an earlier, narrower "fingerprint-only, shown once at creation" brief
 * — the owner's own words: "i want that token to be visible to admins or else when it breaks they
 * have no idea whats going on." `GET` (status) NEVER includes the value; reveal is its own
 * explicit, separately-permission-gated action a caller must invoke on purpose. No audit-log
 * write on reveal — no general-purpose sensitive-read audit mechanism exists anywhere in this
 * codebase to hook into (checked; not built here per the dispatch's own "if none exists, do not
 * build one" instruction).
 *
 * `admin.security.tokens.manage`-gated on every verb (`features/identity/
 * site-token-permission.ts`) — a narrower trust boundary than ordinary content admin, since this
 * is the one screen that can both mint AND reveal the key protecting every other credential.
 *
 * `POST .../generate` is create-only, never overwrite/rotate: it 409s if a key file already
 * exists. Replacing an existing key would orphan every secret already sealed under the old one
 * with no confirmation dialog at all — a real rotate/replace flow is intentionally NOT built here
 * (reported as out of scope, not silently half-built).
 *
 * ## Site-key plan §A3b — site-aware sources
 *
 * Every verb now resolves this SITE's own ordered source list ({@link resolveSiteTokenSources}:
 * `site-key-sources.ts`'s `siteKeySourcesForSiteDir`, keyed off `deps.siteBinding.dir`'s
 * `.site-meta.json` — the same composed helper `site-backup/tool-registrations.ts`'s
 * `unreadableCredentialMessage` reuses, so the two site-aware callers can never drift apart)
 * instead of the module-level env-then-legacy-default precedence `inspectRootKeyMaterial`'s own
 * defaults still use. In local mode with a resolvable `siteKeyId` this prefers the per-site file
 * (`~/.tovu/site-keys/<id>.hex`, A.1) over the legacy shared file, and `generate` now (re)writes
 * THAT per-site file rather than the one legacy path — still refusing (409) when the env var is
 * active, and still never overwriting an existing file (`RootKeyFileAlreadyExistsError`). A site
 * with no readable `.site-meta.json` (or production, which has no per-site file at all) falls back
 * to exactly today's behavior: `siteKeySources` drops the per-site candidate in that case.
 *
 * `GET`'s response also carries a `state` field derived from the resolved status — the full
 * site-key-plan §A.6 5-state set ({@link SiteTokenState}: `"active" | "missing" |
 * "missing-with-data" | "mismatch" | "invalid"`), computed by {@link siteTokenState}.
 *
 * ## 2026-09-14 hardening — session-only, `no-store`
 *
 * Every verb, including `GET` status, now refuses an `api_key` credential
 * (`rejectUnlessSessionCredential` in `dev-auth.ts`, shared with `routes/api-keys/deps.ts`'s
 * `rejectApiKeyCredential`) before the workspace/permission checks run. `SITE_TOKEN_MANAGE_PERMISSION`
 * can be reached by any policy holding `admin.integrations.manage` (see that permission's own file
 * header) and by any API key whose issuance snapshot carries it; without this gate, a leaked API key
 * could reveal the value that decrypts every other stored credential. Reveal and generate responses
 * also now set `Cache-Control: no-store`, since both carry the raw key value.
 */
export type AdminSiteTokenDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "siteBinding">;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/site-token";

/**
 * This site's own ordered source list, plus the file `generate` should target — computed fresh
 * per request (never cached) so every verb agrees about which sources and which target file are
 * THIS site's own, not the legacy global default. Exported so it can be unit-tested directly
 * against a temp `siteBinding.dir` without standing up Express/HTTP.
 *
 * @param env - defaults to `process.env`; test-injected so a suite never depends on real env vars.
 * @complexity O(1) `.site-meta.json` read plus `siteKeySources`' fixed-size ordering.
 */
export function resolveSiteTokenSources(
  deps: AdminSiteTokenDeps,
  env: NodeJS.ProcessEnv = process.env
): { sources: SiteKeySource[]; keyFilePath: string } {
  const mode = resolveRuntimeMode({ env });
  const sources = siteKeySourcesForSiteDir({ siteDir: deps.siteBinding.dir, mode, env, home: homedir(), cwd: process.cwd() });
  return { sources, keyFilePath: siteKeyFilePathFrom(sources, defaultRootKeyFilePath()) };
}

export interface SiteTokenStateInput {
  readonly active: boolean;
  readonly invalid?: boolean;
  /** The currently-resolved key material's own fingerprint (only meaningful when `active`). */
  readonly fingerprint?: string;
  /** `.site-meta.json`'s stamped `siteKeyFingerprint` ({@link resolveSiteKeyFingerprint}) —
   *  `undefined` when nothing has been stamped yet (never treated as a mismatch). */
  readonly metaFingerprint?: string;
  /** Whether this site's `content.db` holds data only a site key could decrypt or verify
   *  ({@link findKeyDependentData}) — only meaningful when neither `active` nor `invalid`. */
  readonly hasKeyDependentData: boolean;
}

/**
 * `GET`'s `state` banner field (site-key plan §A.6), derived from an already-computed
 * {@link RootKeyStatus} plus the two site-key-plan-specific inputs {@link SiteTokenStateInput}
 * carries beyond it.
 *
 * `invalid` wins outright — a source was found but fails hex validation, regardless of what a
 * stale `.site-meta.json` stamp or a `content.db` scan would otherwise say. Otherwise: `active`
 * with a stamped fingerprint that disagrees with the resolved key's own fingerprint is `mismatch`
 * (the physical key file was substituted after the stamp was written); `active` with no stamp yet,
 * or a stamp that agrees, is plain `active`. Not active: `missing-with-data` when this site's
 * `content.db` holds key-dependent data (a materially more urgent banner — something the operator
 * saved is stuck behind a key that no longer resolves), otherwise plain `missing`.
 *
 * @complexity O(1) — a fixed sequence of comparisons over already-computed inputs; no I/O.
 */
export function siteTokenState(input: SiteTokenStateInput): SiteTokenState {
  if (input.invalid) return "invalid";
  if (input.active) {
    return input.metaFingerprint !== undefined && input.metaFingerprint !== input.fingerprint
      ? "mismatch"
      : "active";
  }
  return input.hasKeyDependentData ? "missing-with-data" : "missing";
}

/** {@link siteTokenState}'s `hasKeyDependentData` input for the GET handler: whether THIS site's
 *  `content.db` exists at all, and if so whether it holds key-dependent data
 *  ({@link findKeyDependentData}). A site directory with no `content.db` yet is "nothing to scan
 *  yet" (`false`), not "unreadable" — mirrors `ensureSiteKey`'s own `existsSync` guard
 *  (`site-key-ensure.ts`) so the two callers of `findKeyDependentData` agree about when a missing
 *  database counts as "no data" versus the function's own fail-closed "could not open" case.
 *
 * @complexity O(1) `existsSync` plus {@link findKeyDependentData}'s own cost when the file exists.
 */
function siteHasKeyDependentData(siteDir: string): boolean {
  const contentDbPath = join(siteDir, CONTENT_DB_FILENAME);
  return existsSync(contentDbPath) ? findKeyDependentData([contentDbPath]) : false;
}

/**
 * Re-stamps `.site-meta.json`'s `siteKeyFingerprint` to `fingerprint` after `generate` mints a new
 * key (site-key plan §A.6) — mirrors `ensureSiteKey`'s own `withFingerprintReconciliation`
 * "present and equal → nothing written" case (`site-key-ensure.ts`): a missing `.site-meta.json`
 * (no commit marker at all — a legacy or unrepaired site) is left alone rather than fabricated, and
 * an already-matching stamp is left untouched rather than rewritten for no reason. Every other
 * field in the object survives unchanged (the atomic write spreads the parsed object first).
 *
 * @complexity O(1) — one read, at most one atomic write.
 */
function stampSiteKeyFingerprint(siteDir: string, fingerprint: string): void {
  const meta = readSiteMetaJson(siteDir);
  if (meta === undefined || meta.siteKeyFingerprint === fingerprint) return;
  writeJsonFileAtomic(join(siteDir, ".site-meta.json"), { ...meta, siteKeyFingerprint: fingerprint });
}

/** Shared workspace-path-param + permission check every verb below performs first — same
 *  two-step shape `publish-credentials.ts`'s `rejectUnlessAuthorized` uses. Returns `true` (and
 *  has already written the response) iff the caller should stop. */
async function rejectUnlessAuthorized(req: Request, res: Response, deps: AdminSiteTokenDeps): Promise<boolean> {
  // Checked first, before the workspace/permission checks below, so an api_key caller — even one
  // whose snapshot holds SITE_TOKEN_MANAGE_PERMISSION — learns nothing beyond "this credential type
  // is not permitted here." Same rule and same shared guard `routes/api-keys/deps.ts`'s
  // `rejectApiKeyCredential` uses for api-key issuance/revocation: the value this route family
  // guards (the key that decrypts every other stored credential) must stay reachable only by a real
  // admin session, never by a machine credential a leaked key could replay.
  if (
    !rejectUnlessSessionCredential(res, {
      message: "api-key credentials may not read or manage the site token; use an admin session",
      permission: SITE_TOKEN_MANAGE_PERMISSION,
    })
  ) {
    return true;
  }
  if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
    res.status(404).json({ error: "workspace was not found" });
    return true;
  }
  const principal = getAuthedPrincipal(res);
  return !(await authorizeOrRespond(res, deps.authorize, {
    principalId: principal.id,
    permission: SITE_TOKEN_MANAGE_PERMISSION,
    workspaceId: deps.workspaceId,
  }));
}

export function registerAdminSiteTokenRoutes(app: Express, deps: AdminSiteTokenDeps): void {
  app.get(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    const { sources } = resolveSiteTokenSources(deps);
    const status = inspectRootKeyMaterial({ sources });
    const state = siteTokenState({
      active: status.active,
      invalid: status.invalid,
      fingerprint: status.fingerprint,
      metaFingerprint: status.active ? resolveSiteKeyFingerprint({ siteDir: deps.siteBinding.dir }) : undefined,
      hasKeyDependentData:
        !status.active && !status.invalid ? siteHasKeyDependentData(deps.siteBinding.dir) : false,
    });
    res.status(200).json({ ...status, state, runtimeMode: resolveRuntimeMode() });
  });

  app.post(`${BASE_PATH}/reveal`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    const { sources } = resolveSiteTokenSources(deps);
    const reveal = revealRootKeyMaterial({ sources });
    // The raw key value goes out in this body — never let a shared/browser cache retain it.
    res.set("Cache-Control", "no-store");
    res.status(200).json({ ...reveal, runtimeMode: resolveRuntimeMode() });
  });

  app.post(`${BASE_PATH}/generate`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;

    const { sources, keyFilePath } = resolveSiteTokenSources(deps);
    // The env var always wins over a key file (`inspectRootKeyMaterial`'s precedence), so writing
    // one while the env var is active would create a file that is never read — refuse rather than
    // let a caller who bypassed the UI believe it did something.
    const status = inspectRootKeyMaterial({ sources });
    if (status.source === "env") {
      res.status(409).json({
        error: "ENV_VAR_ACTIVE",
        detail:
          "TOVU_INTEGRATIONS_ROOT_KEY is already set as an environment variable, which always " +
          "takes precedence over a key file. Generating a file here would not become the active key.",
      });
      return;
    }

    try {
      const generated = generateFileRootKey({ keyFilePath });
      // Site-key plan §A.6: keep `.site-meta.json`'s stamped fingerprint in step with the key
      // `generate` just minted, so a subsequent GET reports `"active"` rather than a spurious
      // `"mismatch"` against a now-stale stamp. Never touches the create-only/never-overwrite
      // semantics above — this only stamps metadata after a successful create.
      stampSiteKeyFingerprint(deps.siteBinding.dir, generated.fingerprint);
      // `generated.hex` is deliberately NOT forwarded here (sol finding 3-2, 2026-09-16): the
      // admin controller (`use-site-token.hooks.ts`'s `generate()`) only ever reads
      // fingerprint/keyFilePath/runtimeMode from this response, so echoing the raw key gave it no
      // product behavior — only extra exposure across the HTTP response, browser memory, and any
      // network-log tooling. Reveal (above) stays the one, explicit, on-purpose place this route
      // family discloses the value.
      res.set("Cache-Control", "no-store");
      res.status(201).json({
        fingerprint: generated.fingerprint,
        keyFilePath: generated.keyFilePath,
        runtimeMode: resolveRuntimeMode(),
      });
    } catch (err) {
      if (err instanceof RootKeyFileAlreadyExistsError) {
        res.status(409).json({ error: "ALREADY_EXISTS", detail: err.message });
        return;
      }
      console.error("[site-token] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
