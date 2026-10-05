import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Express, Request, Response } from "express";

import type { UUID } from "@jini-ai/core/primitives";

import {
  fingerprintSiteKeyHex,
  generateFileSiteKey,
  inspectSiteKeyMaterial,
  parseSiteKeyHex,
  revealSiteKeyMaterial,
  SiteKeyFileAlreadyExistsError,
  type SiteKeyStatus,
} from "#src/features/webhooks/keyring.env";
import {
  readSiteMetaJson,
  resolveSiteKeyFingerprint,
  siteKeyFilePathFrom,
  siteKeySourcesForSiteDir,
  type SiteKeySource,
} from "#src/features/webhooks/site-key-sources";
import { hasKeyDependentData } from "#src/platform/db/key-dependent-data";
import { findSiteKeyDependentData } from "#src/platform/site-dir/index";
import { SITE_KEY_MANAGE_PERMISSION } from "#src/features/identity/site-key-permission";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import type { SiteKeyState } from "#src/contracts/core/site-key-state";
import { STORAGE_SECRET_FILENAME } from "#src/platform/site-dir/layout";
import { writeJsonFileAtomic } from "#src/platform/site-dir/atomic-write";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal, rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin Secrets panel → Site key tab's backend: `GET`, `POST .../generate`, and
 * `POST .../reveal`, under `/api/admin/v1/workspaces/:workspaceId/system/site-key`.
 *
 * ## What this manages
 *
 * The generated-file half of `EnvOrFileKeyring`'s site-key resolution (`features/webhooks/
 * keyring.env.ts`) — the file at `defaultSiteKeyFilePath()` a keyring constructed with
 * `allowFileFallback: true` falls back to when `TOVU_SITE_KEY` is unset.
 *
 * ## 2026-09-09 durability fix — this now genuinely works in production, with one disclosed gap
 *
 * Until this fix, a generated file could never help production: the boot gate checked only the
 * env var, the default path resolved under the container's ephemeral rootfs (wiped every
 * redeploy), and `siteAssistantSecretKeyring` refused to read a file at all. All three are fixed:
 * `defaultSiteKeyFilePath()` is mode-aware (the durable Fly-volume-backed `<cwd>/sites/.tovu/
 * integrations-site-key.hex` in production), `hasMissingSiteKey`
 * (`runtime/boot/boot-readiness-gate.ts`) now accepts a valid file too, and
 * `siteAssistantSecretKeyring` (`composition/deps.ts`) now reads (but never auto-generates) one.
 *
 * The one remaining, DISCLOSED gap: `newsletterKeyring` (webhook signing, newsletter unsubscribe
 * tokens) still requires the env var in production — its `allowFileFallback: runtimeMode !==
 * "production"` construction is deliberately UNCHANGED (a committed regression test pins it, and
 * this pass's dispatch scoped the production fix to the credential-sealing keyring specifically).
 * So: generating a key here in production DOES now protect every real stored credential (BYOK,
 * publish/source-control/custom creds, media-provider secrets), but does NOT cover webhook
 * signing / newsletter tokens unless the env var is also set. `SiteKeyTab.tsx`'s scope notice
 * states this split plainly rather than claiming uniform coverage.
 *
 * ## The accepted security tradeoff — read this before "fixing" the asymmetry away
 *
 * A generated key file now lives on the SAME Fly volume as `content.db`. Someone who obtains a
 * volume snapshot/backup gets both the ciphertext and the key that opens it — the "leaked backup
 * alone is not enough" defense ADR-058 §9 described no longer holds once a file exists. This is an
 * OWNER-APPROVED, DOCUMENTED cost of making the install self-contained (no `fly secrets set`
 * required), not an oversight. See `composition/deps.ts`'s `siteAssistantSecretKeyring`
 * construction comment and `ADS-memory/reports/2026-09-09-security-site-key.md` for the full
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
 * `admin.security.site-key.manage`-gated on every verb (`features/identity/
 * site-key-permission.ts`) — a narrower trust boundary than ordinary content admin, since this
 * is the one screen that can both mint AND reveal the key protecting every other credential.
 *
 * ## Last-resort recovery (2026-09-29, design 2026-09-14 §4.3/§4.6)
 *
 * For a locked site (`missing-with-data`, `mismatch`): `POST .../import` ("Paste your old token")
 * installs a pasted token only after it opens a real sealed value (or `.storage-secret.json`, or
 * matches the stamp), and first moves anything saved under the key in place meanwhile onto it, so
 * nothing is stranded. `GET .../start-fresh` previews "Start fresh" (what goes, which webhooks get a
 * new signing secret); `POST .../start-fresh` with `{confirm: "START FRESH"}` takes a restore point,
 * removes only what the kept (or new) key cannot open, and installs that key. Neither echoes the key.
 *
 * `POST .../generate` never overwrites or rotates, and never mints over sealed data (2026-09-29): it
 * runs the site-key writer boot runs (`site-key-ensure.ts`'s `ensureSiteKeyForSite`, injected by the
 * composition root so this file never imports it). A working key is reported as `already-active`; a
 * missing per-site key is adopted from whichever source still holds the key `.site-meta.json` names
 * (`recovered`); a key is minted only for a site with no sealed data (`created`); otherwise 409 with
 * a stable code and nothing written — see {@link generateSiteKey}. A real rotate/replace flow is
 * intentionally NOT built here.
 *
 * ## Site-key plan §A3b — site-aware sources
 *
 * Every verb now resolves this SITE's own ordered source list ({@link resolveSiteKeySources}:
 * `site-key-sources.ts`'s `siteKeySourcesForSiteDir`, keyed off `deps.siteBinding.dir`'s
 * `.site-meta.json` — the same composed helper `site-backup/tool-registrations.ts`'s
 * `unreadableCredentialMessage` reuses, so the two site-aware callers can never drift apart)
 * instead of the module-level env-then-legacy-default precedence `inspectSiteKeyMaterial`'s own
 * defaults still use. In local mode with a resolvable `siteKeyId` this prefers the per-site file
 * (`~/.tovu/site-keys/<id>.hex`, A.1) over the legacy shared file, and `generate` fills THAT
 * per-site file rather than the one legacy path. Production, which has no per-site file at all,
 * keeps the env-var/volume-file behavior (`siteKeySources` drops the per-site candidate there).
 *
 * `GET`'s response also carries a `state` field derived from the resolved status — the full
 * site-key-plan §A.6 5-state set ({@link SiteKeyState}: `"active" | "missing" |
 * "missing-with-data" | "mismatch" | "invalid"`), computed by {@link siteKeyState}.
 *
 * ## 2026-09-14 hardening — session-only, `no-store`
 *
 * Every verb, including `GET` status, now refuses an `api_key` credential
 * (`rejectUnlessSessionCredential` in `dev-auth.ts`, shared with `routes/api-keys/deps.ts`'s
 * `rejectApiKeyCredential`) before the workspace/permission checks run. `SITE_KEY_MANAGE_PERMISSION`
 * can be reached by any policy holding `admin.integrations.manage` (see that permission's own file
 * header) and by any API key whose issuance snapshot carries it; without this gate, a leaked API key
 * could reveal the value that decrypts every other stored credential. Reveal and generate responses
 * also now set `Cache-Control: no-store`, since both carry the raw key value.
 */
export type AdminSiteKeyDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "siteBinding" | "contentKernel" | "dbOps" | "restorePointsRepo" | "idGen" | "clock" | "webhookSubscriptionRepo"
>;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/site-key";

/**
 * This site's own ordered source list, plus the file `generate` should target — computed fresh
 * per request (never cached) so every verb agrees about which sources and which target file are
 * THIS site's own, not the legacy global default. Exported so it can be unit-tested directly
 * against a temp `siteBinding.dir` without standing up Express/HTTP.
 *
 * @param env - defaults to `process.env`; test-injected so a suite never depends on real env vars.
 * @complexity O(1) `.site-meta.json` read plus `siteKeySources`' fixed-size ordering.
 */
export function resolveSiteKeySources(
  deps: Pick<AdminSiteKeyDeps, "siteBinding">,
  env: NodeJS.ProcessEnv = process.env
): { sources: SiteKeySource[]; keyFilePath: string | undefined } {
  const mode = resolveRuntimeMode({ env });
  const sources = siteKeySourcesForSiteDir({ siteDir: deps.siteBinding.dir, mode, env, home: homedir(), cwd: process.cwd() });
  return { sources, keyFilePath: siteKeyFilePathFrom(sources) };
}

export interface SiteKeyStateInput {
  readonly active: boolean;
  readonly invalid?: boolean;
  readonly reason?: string;
  /** The currently-resolved key material's own fingerprint (only meaningful when `active`). */
  readonly fingerprint?: string;
  /** `.site-meta.json`'s stamped `siteKeyFingerprint` ({@link resolveSiteKeyFingerprint}) —
   *  `undefined` when nothing has been stamped yet (never treated as a mismatch). */
  readonly metaFingerprint?: string;
  /** Whether this site's store holds data only a site key could decrypt or verify
   *  ({@link siteHasKeyDependentData}) — only meaningful when neither `active` nor `invalid`. */
  readonly hasKeyDependentData: boolean;
}

/**
 * `GET`'s `state` banner field (site-key plan §A.6), derived from an already-computed
 * {@link SiteKeyStatus} plus the two site-key-plan-specific inputs {@link SiteKeyStateInput}
 * carries beyond it.
 *
 * `invalid` wins outright — a source was found but fails hex validation, regardless of what a
 * stale `.site-meta.json` stamp or a `content.db` scan would otherwise say. Otherwise: `active`
 * with a stamped fingerprint that disagrees with the resolved key's own fingerprint is `mismatch`
 * (the physical key file was substituted after the stamp was written); `active` with no stamp yet,
 * or a stamp that agrees, is plain `active`. Not active: `missing-with-data` when this site's
 * store holds key-dependent data (a materially more urgent banner — something the operator
 * saved is stuck behind a key that no longer resolves), otherwise plain `missing`.
 *
 * @complexity O(1) — a fixed sequence of comparisons over already-computed inputs; no I/O.
 */
export function siteKeyState(input: SiteKeyStateInput): SiteKeyState {
  if (input.invalid) return "invalid";
  if (input.active) {
    return input.metaFingerprint !== undefined && input.metaFingerprint !== input.fingerprint
      ? "mismatch"
      : "active";
  }
  return input.hasKeyDependentData ? "missing-with-data" : "missing";
}

/** {@link siteKeyState}'s `hasKeyDependentData` input for the GET handler, on every storage kind
 *  (ADR-067). A sealed `.storage-secret.json` counts. Otherwise the running site's own open store
 *  (`deps.contentKernel`) is scanned — a PGlite data dir this process owns cannot be opened a second
 *  time — and only without one does this fall back to `findSiteKeyDependentData`, the same scan
 *  `ensureSiteKey` runs at boot. A failed scan counts as "has data", as that function's does.
 *
 * @complexity O(1) `existsSync` plus one {@link hasKeyDependentData} scan.
 */
async function siteHasKeyDependentData(deps: AdminSiteKeyDeps): Promise<boolean> {
  const siteDir = deps.siteBinding.dir;
  if (existsSync(join(siteDir, STORAGE_SECRET_FILENAME))) return true;
  if (deps.contentKernel === undefined) return findSiteKeyDependentData(siteDir);
  try {
    return await hasKeyDependentData(deps.contentKernel);
  } catch {
    return true;
  }
}

/**
 * Re-stamps `.site-meta.json`'s `siteKeyFingerprint` to `fingerprint` after production `generate`
 * mints a new key (site-key plan §A.6; locally `ensureSiteKey` stamps its own) — mirrors `ensureSiteKey`'s own `withFingerprintReconciliation`
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
async function rejectUnlessAuthorized(req: Request, res: Response, deps: AdminSiteKeyDeps): Promise<boolean> {
  // Checked first, before the workspace/permission checks below, so an api_key caller — even one
  // whose snapshot holds SITE_KEY_MANAGE_PERMISSION — learns nothing beyond "this credential type
  // is not permitted here." Same rule and same shared guard `routes/api-keys/deps.ts`'s
  // `rejectApiKeyCredential` uses for api-key issuance/revocation: the value this route family
  // guards (the key that decrypts every other stored credential) must stay reachable only by a real
  // admin session, never by a machine credential a leaked key could replay.
  if (
    !rejectUnlessSessionCredential(res, {
      message: "api-key credentials may not read or manage the site key; use an admin session",
      permission: SITE_KEY_MANAGE_PERMISSION,
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
    permission: SITE_KEY_MANAGE_PERMISSION,
    workspaceId: deps.workspaceId,
  }));
}

export function registerAdminSiteKeyRoutes(app: Express, deps: AdminSiteKeyDeps, siteKey: SiteKeyKeyWriter): void {
  app.get(BASE_PATH, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    const { sources } = resolveSiteKeySources(deps);
    const status = inspectSiteKeyMaterial({ sources });
    const state = siteKeyState({
      active: status.active,
      invalid: status.invalid,
      reason: status.reason,
      fingerprint: status.fingerprint,
      metaFingerprint: status.active ? resolveSiteKeyFingerprint({ siteDir: deps.siteBinding.dir }) : undefined,
      hasKeyDependentData:
        !status.active && !status.invalid ? await siteHasKeyDependentData(deps) : false,
    });
    res.status(200).json({ ...status, state, runtimeMode: resolveRuntimeMode() });
  });

  app.post(`${BASE_PATH}/reveal`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    const { sources } = resolveSiteKeySources(deps);
    const reveal = revealSiteKeyMaterial({ sources });
    // The raw key value goes out in this body — never let a shared/browser cache retain it.
    res.set("Cache-Control", "no-store");
    res.status(200).json({ ...reveal, runtimeMode: resolveRuntimeMode() });
  });

  app.post(`${BASE_PATH}/generate`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    try {
      const result = await generateSiteKey(deps, siteKey);
      // The raw key is never in this body (sol finding 3-2, 2026-09-16): the admin controller
      // (`use-site-key.hooks.ts`'s `generate()`) reads only fingerprint/keyFilePath/runtimeMode.
      // Reveal (above) stays the one, explicit place this route family discloses the value.
      res.set("Cache-Control", "no-store");
      res.status(result.status).json({ ...result.body, runtimeMode: resolveRuntimeMode() });
    } catch (err) {
      if (err instanceof SiteKeyFileAlreadyExistsError) {
        res.status(409).json({ error: "ALREADY_EXISTS", detail: err.message });
        return;
      }
      console.error("[site-key] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });

  app.post(`${BASE_PATH}/import`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    await respondWithRecovery(res, () => importSiteKey(deps, siteKey, { siteKey: (req.body as { siteKey?: unknown } | undefined)?.siteKey, actorId: getAuthedPrincipal(res).id }));
  });

  app.get(`${BASE_PATH}/start-fresh`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    await respondWithRecovery(res, () => previewStartFresh(deps, siteKey));
  });

  app.post(`${BASE_PATH}/start-fresh`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    const confirm = (req.body as { confirm?: unknown } | undefined)?.confirm;
    await respondWithRecovery(res, () => startFresh(deps, siteKey, { confirm, actorId: getAuthedPrincipal(res).id }));
  });
}

/** Sends a recovery result `no-store` (the request carried a token; never let a cache keep either). */
async function respondWithRecovery(res: Response, run: () => Promise<RouteResult>): Promise<void> {
  res.set("Cache-Control", "no-store");
  try {
    const result = await run();
    res.status(result.status).json({ ...result.body, runtimeMode: resolveRuntimeMode() });
  } catch (err) {
    console.error("[site-key] recovery failed", err);
    res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
  }
}

/** The site-key writer's result, as far as `generate` reads it — `site-key-ensure.ts`'s
 *  `EnsureSiteKeyResult`, restated structurally because nothing under `server/inbound/**` may import
 *  that module (`no-site-key-ensure-import.boundary.test.ts`). */
export interface SiteKeyEnsureOutcome {
  readonly action: "noop" | "adopt" | "mint" | "refuse" | "invalid" | "mismatch" | "production-noop";
  readonly perSiteFilePath?: string;
  readonly fingerprint?: string;
}

/** How many of the site's sealed values open under a key held in memory, and whether its
 *  `.storage-secret.json` does — `composition/site-key-recovery.ts`'s `checkKey`, restated. */
export interface SiteKeyKeyCheck {
  readonly sealed: number;
  readonly opens: number;
  readonly storageSecret: "absent" | "opens" | "locked";
}

/** The site's store plus a candidate key, as the recovery helpers take it. */
export interface SiteKeyStoreInput {
  readonly siteDir: string;
  readonly contentKernel?: AdminSiteKeyDeps["contentKernel"];
  readonly hex: string;
}

/** `site-key-ensure.ts`'s `installSiteKey` result, restated structurally (see {@link SiteKeyEnsureOutcome}). */
export type SiteKeyInstallOutcome =
  | { readonly outcome: "installed"; readonly keyFilePath: string; readonly fingerprint: string }
  | { readonly outcome: "env-key-set" };

/** What the key verbs need from the composition root: `site-key-ensure.ts`'s writers (boot's
 *  `ensureSiteKeyForSite`, recovery's `installSiteKey`/`mintSiteKeyHex`) and the sealed-value checks
 *  in `composition/site-key-recovery.ts`. `undefined` from the writers means no `siteKeyId`
 *  resolves for the site. */
export interface SiteKeyKeyWriter {
  readonly ensureSiteKeyForSite: (input: {
    siteDir: string;
    findSiteKeyDependentData: (siteDir: string) => Promise<boolean>;
  }) => Promise<SiteKeyEnsureOutcome | undefined>;
  readonly checkKey: (input: SiteKeyStoreInput) => Promise<SiteKeyKeyCheck>;
  readonly discardNotOpening: (input: SiteKeyStoreInput) => Promise<{ discarded: number; kept: number }>;
  readonly resealFrom: (input: SiteKeyStoreInput & { previousHex: string }) => Promise<{ resealed: number; unreadable: number }>;
  readonly installSiteKey: (input: { siteDir: string; hex: string }) => SiteKeyInstallOutcome | undefined;
  readonly mintSiteKeyHex: () => string;
}

type GenerateOutcome = "already-active" | "recovered" | "created";

interface RouteResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

type GenerateResult = RouteResult;

/** Plain-words refusals — the key the site's data needs is not here, so nothing is written. */
const REFUSALS = {
  KEY_DEPENDENT_DATA:
    "This site has saved credentials locked with a site key that is not on this computer. A new site key could not open them, so none was created. Put the original site key back to unlock them.",
  KEY_MISMATCH:
    "The site key on this computer is not the one this site's saved credentials were locked with, so nothing was changed. Put the original site key back to unlock them.",
  KEY_INVALID: "A site key is set on this computer but is not a valid key, so nothing was changed. Fix or remove it, then try again.",
  SITE_META_UNREADABLE: "This site's .site-meta.json cannot be read. Repair this site first; no site key was written.",
  SITE_KEY_INVALID: "That is not a site key. A site key is 64 characters of 0-9 and a-f.",
  SITE_KEY_DOES_NOT_OPEN: "That site key does not open this site's saved credentials. Nothing was changed.",
  ENV_KEY_SET: "A different site key is set in this server's environment and overrides the key file, so nothing was changed. Change it there instead.",
  RESTORE_POINT_UNAVAILABLE: "A restore point can't be made for this site's database right now, so nothing was changed.",
  STORAGE_SECRET_LOCKED:
    "This site's database connection is locked with the old site key, and starting fresh can't replace it. Paste your old site key instead. Nothing was changed.",
  CONFIRMATION_REQUIRED: "Type START FRESH to confirm. Nothing was changed.",
} as const;

function refusal(code: keyof typeof REFUSALS, status = 409): RouteResult {
  return { status, body: { error: code, detail: REFUSALS[code] } };
}

function success(outcome: GenerateOutcome, fingerprint: string, keyFilePath: string): GenerateResult {
  return { status: outcome === "created" ? 201 : 200, body: { outcome, fingerprint, keyFilePath } };
}

/**
 * `POST .../generate`: makes sure this site has the RIGHT key, never a second one. Runs the same
 * rules boot runs (`ensureSiteKeyForSite`): a working per-site key that matches the stamp is left
 * alone (`already-active`); a missing per-site key is filled from whichever source holds the key the
 * site's data was sealed with (`recovered`); a new key is minted only when the site has no sealed
 * data (`created`). With sealed data and no matching key it refuses (409) and writes nothing — the
 * stamp in `.site-meta.json` is the only record of which key the data needs.
 *
 * Production has no per-site file (site-key plan §A.1), so there the route keeps its env/volume-file
 * behavior, with the same two guards: an active key is reported, not replaced, and no key is minted
 * over sealed data.
 *
 * @throws {SiteKeyFileAlreadyExistsError} production only, when the volume file appears mid-request.
 * @complexity O(1) file reads plus at most one key-dependent-data scan.
 */
async function generateSiteKey(deps: AdminSiteKeyDeps, siteKey: SiteKeyKeyWriter): Promise<GenerateResult> {
  const hasData = (): Promise<boolean> => siteHasKeyDependentData(deps);
  const mode = resolveRuntimeMode();
  const ensured = await siteKey.ensureSiteKeyForSite({ siteDir: deps.siteBinding.dir, findSiteKeyDependentData: hasData });
  if (mode === "production" || ensured?.action === "production-noop") return generateProductionSiteKey(deps, hasData);
  if (ensured === undefined) return refusal("SITE_META_UNREADABLE");
  const { action, fingerprint, perSiteFilePath } = ensured;
  switch (action) {
    case "noop":
    case "adopt":
    case "mint":
      if (fingerprint === undefined || perSiteFilePath === undefined) throw new Error(`site key '${action}' carried no fingerprint or path`);
      return success(action === "noop" ? "already-active" : action === "adopt" ? "recovered" : "created", fingerprint, perSiteFilePath);
    case "refuse":
      return refusal("KEY_DEPENDENT_DATA");
    case "mismatch":
      return refusal("KEY_MISMATCH");
    case "invalid":
      return refusal("KEY_INVALID");
  }
}

/** {@link generateSiteKey}'s production branch: the env var or the durable-volume file.
 *  @complexity O(1) file reads plus at most one key-dependent-data scan. */
async function generateProductionSiteKey(deps: AdminSiteKeyDeps, hasData: () => Promise<boolean>): Promise<GenerateResult> {
  const { sources, keyFilePath } = resolveSiteKeySources(deps);
  const status = inspectSiteKeyMaterial({ sources });
  if (status.active && status.fingerprint !== undefined) return success("already-active", status.fingerprint, status.keyFilePath);
  if (status.invalid) return refusal("KEY_INVALID");
  if (await hasData()) return refusal("KEY_DEPENDENT_DATA");
  if (keyFilePath === undefined) return refusal("SITE_META_UNREADABLE");
  const generated = generateFileSiteKey({ keyFilePath });
  stampSiteKeyFingerprint(deps.siteBinding.dir, generated.fingerprint);
  return success("created", generated.fingerprint, generated.keyFilePath);
}

/** Takes and records a restore point before recovery changes the database (pattern:
 *  `features/database/gated-hooks.ts`'s migrate-forward). `undefined` when this site's database
 *  cannot take one. @complexity O(1) plus one capture and one save. */
async function takeRestorePoint(deps: AdminSiteKeyDeps, actorId: string, trigger: string): Promise<string | undefined> {
  const capabilities = await deps.dbOps.getCapabilities();
  if (capabilities.restorePoint.costClass === "unavailable") return undefined;
  const captured = await deps.dbOps.captureRestorePoint({ scopeId: deps.workspaceId });
  const restorePointId = deps.idGen.newId();
  await deps.restorePointsRepo.save({
    restorePointId,
    idempotencyKey: restorePointId,
    trigger,
    createdAt: deps.clock.nowIso(),
    createdBy: actorId,
    costClass: capabilities.restorePoint.costClass,
    kind: capabilities.restorePoint.kind,
    watermarkAtCapture: captured.watermarkAtCapture,
    artifactRef: captured.artifactRef,
  });
  return restorePointId;
}

/**
 * `POST .../import` — "Paste your old token". The token is installed only once it is proven to be
 * this site's: it opens at least one sealed value or the sealed connection string, or it is the key
 * `.site-meta.json` is stamped with. Values saved meanwhile under the key currently in place are
 * moved onto the token first (after a restore point), so switching strands nothing. When no other
 * key is in place nothing in the database changes, so no restore point is needed.
 *
 * @complexity one sealed-value scan, plus one re-seal pass when another key is in place.
 */
async function importSiteKey(deps: AdminSiteKeyDeps, siteKey: SiteKeyKeyWriter, input: { siteKey: unknown; actorId: string }): Promise<RouteResult> {
  const parsed = parseSiteKeyHex(typeof input.siteKey === "string" ? input.siteKey : "");
  if (!parsed.ok) return refusal("SITE_KEY_INVALID", 400);
  const siteDir = deps.siteBinding.dir;
  const fingerprint = fingerprintSiteKeyHex(parsed.hex);
  const current = revealSiteKeyMaterial({ sources: resolveSiteKeySources(deps).sources });
  if (current.source === "env" && current.fingerprint !== fingerprint) return refusal("ENV_KEY_SET");
  const store = { siteDir, contentKernel: deps.contentKernel, hex: parsed.hex };
  const check = await siteKey.checkKey(store);
  const proven = check.opens > 0 || check.storageSecret === "opens" || resolveSiteKeyFingerprint({ siteDir }) === fingerprint;
  if (!proven) return refusal("SITE_KEY_DOES_NOT_OPEN");

  let restorePointId: string | undefined;
  let resealed = 0;
  if (current.hex !== undefined && current.fingerprint !== fingerprint) {
    restorePointId = await takeRestorePoint(deps, input.actorId, "site-key-import");
    if (restorePointId === undefined) return refusal("RESTORE_POINT_UNAVAILABLE");
    resealed = (await siteKey.resealFrom({ ...store, previousHex: current.hex })).resealed;
  }
  const installed = siteKey.installSiteKey({ siteDir, hex: parsed.hex });
  if (installed === undefined) return refusal("SITE_META_UNREADABLE");
  if (installed.outcome === "env-key-set") return refusal("ENV_KEY_SET");
  return { status: 200, body: { outcome: "unlocked", fingerprint, keyFilePath: installed.keyFilePath, resealed, restorePointId } };
}

interface AffectedWebhook {
  readonly label: string;
  readonly targetUrl: string;
}

interface StartFreshPlan {
  readonly hex: string;
  readonly check: SiteKeyKeyCheck;
  readonly affectedWebhooks: readonly AffectedWebhook[];
}

/** The key "Start fresh" ends with (the working key in place, else a new one), what it opens, and
 *  which webhooks' signing secrets change (all of them unless that key is the stamped one). A
 *  refusal when an env var holds an unusable key (it would outrank anything written).
 *  @complexity one sealed-value scan plus one webhook list. */
async function planStartFresh(deps: AdminSiteKeyDeps, siteKey: SiteKeyKeyWriter): Promise<StartFreshPlan | RouteResult> {
  const current = revealSiteKeyMaterial({ sources: resolveSiteKeySources(deps).sources });
  if (current.source === "env" && current.hex === undefined) return refusal("ENV_KEY_SET");
  const hex = current.hex ?? siteKey.mintSiteKeyHex();
  const check = await siteKey.checkKey({ siteDir: deps.siteBinding.dir, contentKernel: deps.contentKernel, hex });
  if (check.storageSecret === "locked") return refusal("STORAGE_SECRET_LOCKED");
  const keepsSecrets = resolveSiteKeyFingerprint({ siteDir: deps.siteBinding.dir }) === fingerprintSiteKeyHex(hex);
  const webhooks = keepsSecrets ? [] : await deps.webhookSubscriptionRepo.listByWorkspace({ workspaceId: deps.workspaceId as UUID });
  return { hex, check, affectedWebhooks: webhooks.map((webhook) => ({ label: webhook.label, targetUrl: webhook.targetUrl })) };
}

function isRouteResult(value: StartFreshPlan | RouteResult): value is RouteResult {
  return "status" in value;
}

/** The confirm step's plain sentence. @complexity O(W) in the affected webhooks. */
export function startFreshDetail(removes: number, affectedWebhooks: readonly AffectedWebhook[]): string {
  const removal =
    removes === 0
      ? "Every saved credential can be unlocked; nothing will be removed."
      : `${removes} saved ${removes === 1 ? "credential" : "credentials"} can't be unlocked and will be removed.`;
  if (affectedWebhooks.length === 0) return removal;
  const names = affectedWebhooks.map((webhook) => `${webhook.label} (${webhook.targetUrl})`).join(", ");
  return `${removal} These webhooks get a new signing secret, so update their receivers: ${names}.`;
}

/** `GET .../start-fresh` — what confirming would do. Changes nothing. */
async function previewStartFresh(deps: AdminSiteKeyDeps, siteKey: SiteKeyKeyWriter): Promise<RouteResult> {
  const plan = await planStartFresh(deps, siteKey);
  if (isRouteResult(plan)) return plan;
  const removes = plan.check.sealed - plan.check.opens;
  return { status: 200, body: { removes, affectedWebhooks: plan.affectedWebhooks, detail: startFreshDetail(removes, plan.affectedWebhooks) } };
}

/**
 * `POST .../start-fresh` with `{confirm: "START FRESH"}` — the last resort when the old token is
 * gone. Keeps the working key in place (or mints one), takes a restore point, removes only the
 * sealed values that key cannot open, and installs it as this site's key. The response names the
 * webhooks whose signing secrets changed.
 *
 * @complexity one sealed-value scan for the plan, one for the discard.
 */
async function startFresh(deps: AdminSiteKeyDeps, siteKey: SiteKeyKeyWriter, input: { confirm: unknown; actorId: string }): Promise<RouteResult> {
  if (input.confirm !== "START FRESH") return refusal("CONFIRMATION_REQUIRED", 400);
  const plan = await planStartFresh(deps, siteKey);
  if (isRouteResult(plan)) return plan;
  const restorePointId = await takeRestorePoint(deps, input.actorId, "site-key-start-fresh");
  if (restorePointId === undefined) return refusal("RESTORE_POINT_UNAVAILABLE");
  const { discarded, kept } = await siteKey.discardNotOpening({ siteDir: deps.siteBinding.dir, contentKernel: deps.contentKernel, hex: plan.hex });
  const installed = siteKey.installSiteKey({ siteDir: deps.siteBinding.dir, hex: plan.hex });
  if (installed === undefined) return refusal("SITE_META_UNREADABLE");
  if (installed.outcome === "env-key-set") return refusal("ENV_KEY_SET");
  return {
    status: 200,
    body: { outcome: "started-fresh", fingerprint: installed.fingerprint, keyFilePath: installed.keyFilePath, discarded, kept, restorePointId, affectedWebhooks: plan.affectedWebhooks },
  };
}
