import type { Express, Request, Response } from "express";

import {
  generateFileRootKey,
  inspectRootKeyMaterial,
  revealRootKeyMaterial,
  RootKeyFileAlreadyExistsError,
} from "#src/features/webhooks/keyring.env";
import { SITE_TOKEN_MANAGE_PERMISSION } from "#src/features/identity/site-token-permission";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
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
export type AdminSiteTokenDeps = Pick<RouteDeps, "workspaceId" | "authorize">;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/site-token";

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
    const status = inspectRootKeyMaterial();
    res.status(200).json({ ...status, runtimeMode: resolveRuntimeMode() });
  });

  app.post(`${BASE_PATH}/reveal`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;
    const reveal = revealRootKeyMaterial();
    // The raw key value goes out in this body — never let a shared/browser cache retain it.
    res.set("Cache-Control", "no-store");
    res.status(200).json({ ...reveal, runtimeMode: resolveRuntimeMode() });
  });

  app.post(`${BASE_PATH}/generate`, async (req, res) => {
    if (await rejectUnlessAuthorized(req, res, deps)) return;

    // The env var always wins over a key file (`inspectRootKeyMaterial`'s precedence), so writing
    // one while the env var is active would create a file that is never read — refuse rather than
    // let a caller who bypassed the UI believe it did something.
    const status = inspectRootKeyMaterial();
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
      const generated = generateFileRootKey();
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
