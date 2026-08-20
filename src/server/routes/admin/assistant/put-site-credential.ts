import type { Response } from "express";

import {
  ADMIN_ASSISTANT_PERMISSION,
  SiteAssistantCredentialValidationError,
  SiteAssistantSecretStoreUnconfiguredError,
  setSiteAssistantCredential,
} from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/** This route's PUT body shape — every field optional, `undefined` means "leave alone". */
type SiteCredentialBody = { apiKey?: unknown; provider?: unknown; baseUrl?: unknown; model?: unknown };

/**
 * Rejects a present-but-non-string field (a stray `{apiKey: 12345}`) rather than silently treating
 * it as "the caller sent nothing" — see the route doc above for why that distinction matters.
 *
 * @complexity O(fields in body), a small fixed set.
 */
function rejectNonStringFields(body: SiteCredentialBody): void {
  for (const [field, value] of Object.entries(body)) {
    if (value !== undefined && typeof value !== "string") {
      throw new SiteAssistantCredentialValidationError(`${field} must be a string`);
    }
  }
}

/** Maps this route's thrown error types onto the admin error envelope. @complexity O(1). */
function sendPutSiteCredentialError(res: Response, err: unknown): void {
  if (err instanceof SiteAssistantCredentialValidationError) {
    res.status(400).json({ error: err.message, code: "SITE_CREDENTIAL_VALIDATION_ERROR" });
    return;
  }
  if (err instanceof SiteAssistantSecretStoreUnconfiguredError) {
    res.status(503).json({
      error:
        "site assistant secret store is not configured — set TOVU_INTEGRATIONS_ROOT_KEY (a hex-encoded root key) in the server environment",
      code: "SECRET_STORE_UNCONFIGURED",
    });
    return;
  }
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/**
 * PUT (partial) the workspace's SITE assistant credential (ADR-058). Body:
 * `{ apiKey?, provider?, baseUrl?, model? }` — omitted `apiKey` leaves the stored key untouched;
 * an empty string is rejected (DELETE clears the key). The response NEVER echoes the key, only the
 * same `{isSet, masked, provider, baseUrl, model, updatedAt}` shape GET returns.
 *
 * Three outcomes, not two: this route adds a `503 SECRET_STORE_UNCONFIGURED` branch on top of
 * `put-settings.ts`'s usual 400-validation/500-other split (ADR-058 §4) — a missing
 * `TOVU_INTEGRATIONS_ROOT_KEY` is a distinct, actionable operator error, not a generic 500, and not a
 * validation problem with the request body.
 */
export const registerAdminAssistantPutSiteCredentialRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/assistant/site-credential", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: ADMIN_ASSISTANT_PERMISSION,
        workspaceId: deps.workspaceId,
        entityType: "assistant-settings",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${ADMIN_ASSISTANT_PERMISSION}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: ADMIN_ASSISTANT_PERMISSION, reason: authResult.reason },
        });
        return;
      }

      const body = (req.body ?? {}) as SiteCredentialBody;
      // Present-but-not-a-string is a REJECTION here, same as `setSiteAssistantCredential`'s own
      // check for `provider`/`baseUrl`/`model` — an `undefined` field is "leave alone", but a
      // present non-string field (a stray `{apiKey: 12345}`) must not be silently reinterpreted as
      // "the caller sent nothing", which would leave a bad request looking like a no-op success.
      rejectNonStringFields(body);

      const view = await setSiteAssistantCredential(
        {
          repo: deps.siteAssistantCredentialRepo,
          sealer: deps.siteAssistantSecretSealer,
          keyring: deps.siteAssistantSecretKeyring,
          clock: deps.clock,
        },
        {
          workspaceId: deps.workspaceId,
          apiKey: body.apiKey as string | undefined,
          provider: body.provider as string | undefined,
          baseUrl: body.baseUrl as string | undefined,
          model: body.model as string | undefined,
        }
      );
      res.json({ data: view });
    } catch (err) {
      sendPutSiteCredentialError(res, err);
    }
  });
};
