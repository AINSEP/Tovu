import type { Express } from "express";

import {
  clearComposioApiKey,
  ComposioConfigSecretStoreUnconfiguredError,
  ComposioConfigValidationError,
  saveComposioApiKey,
} from "#src/connectors/composio-config-store";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { RateLimiter } from "#src/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/core/rate-limit/rate-limit";
import type { ConnectorsConfigRouteDeps } from "./deps.js";

/**
 * PUT the workspace's Composio API key.
 *
 * `{ apiKey: "..." }` stores a key; `{ apiKey: null }` clears it. A missing `apiKey` property is
 * rejected rather than treated as either one — "leave it alone" is not a meaningful request against
 * a single-field resource, and guessing between store and clear on an absent field is exactly how a
 * malformed client silently wipes a credential.
 *
 * A stored key is VERIFIED against Composio first, so `configured: true` means "Composio accepts
 * this", not merely "something was typed". Four outcomes rather than two:
 * `400 COMPOSIO_KEY_REJECTED` (Composio refused it), `502 COMPOSIO_UNREACHABLE` (could not verify,
 * so nothing was written), `503 SECRET_STORE_UNCONFIGURED` (no master secret), and success.
 * Refusing to store an unverifiable key is deliberate: the whole point is to eliminate the
 * "saved but never actually usable" state, and an unverified write recreates it.
 *
 * After a successful write the long-lived provider is refreshed, because its config store is a
 * synchronous in-memory snapshot that cannot observe the database on its own
 * (`connectors/composio-config-store.ts`). Skipping this would leave the running process serving
 * the previous key until restart.
 *
 * Responds with markers only — the stored key is never echoed back.
 *
 * The verify-against-Composio step (`probeApiKey`, below) is rate-limited (`CONNECTOR_OUTBOUND_PER_IP`)
 * the same way `connect`/`disconnect`/list-refresh/preview-hydration are: it is a real outbound call
 * to Composio that `requireAdminSession` alone does not bound the frequency of. Clearing a key
 * (`apiKey: null`) makes no outbound call and stays unlimited.
 */
export function registerAdminConnectorsPutConfigRoute(
  app: Express,
  deps: ConnectorsConfigRouteDeps,
  outboundLimiter: RateLimiter
): void {
  app.put("/api/admin/v1/workspaces/:workspaceId/connectors/config", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "admin.integrations.manage",
        workspaceId: deps.workspaceId,
        entityType: "integration",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'admin.integrations.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "admin.integrations.manage", reason: authResult.reason },
        });
        return;
      }

      const body = req.body as { apiKey?: unknown } | null;
      if (body === null || typeof body !== "object" || !Object.hasOwn(body, "apiKey")) {
        res.status(400).json({ error: "apiKey is required (send null to clear)", code: "VALIDATION_ERROR" });
        return;
      }

      const writeDeps = {
        repo: deps.composioConfigRepo,
        sealer: deps.siteAssistantSecretSealer,
        keyring: deps.siteAssistantSecretKeyring,
        clock: deps.clock,
      };

      const clearing = body.apiKey === null;

      // Verify BEFORE persisting. Without this the workspace reports `configured: true` for a key
      // Composio would refuse, the grid unlocks, and the operator only finds out when a detail
      // drawer 401s — because the provider swallows a failed catalog refresh and falls back to its
      // static catalog. See `connectors/composio-key-probe.ts` for why this is a persist-time gate
      // here while the BYOK equivalent is a standalone route.
      if (!clearing) {
        const candidate = String(body.apiKey).trim();
        if (candidate) {
          const rateLimitResult = outboundLimiter.check(resolveClientIp(req));
          if (!rateLimitResult.allowed) {
            res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
            res.status(429).json({
              error: "too many key-verification attempts",
              code: "RATE_LIMIT_EXCEEDED",
              details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
            });
            return;
          }

          const probe = await deps.composioConnectors.probeApiKey(candidate);
          if (!probe.ok) {
            const rejected = probe.reason === "rejected";
            res.status(rejected ? 400 : 502).json({
              error: rejected
                ? "Composio rejected that API key. Check it and try again."
                : "Couldn't reach Composio to verify that API key. It was not saved.",
              code: rejected ? "COMPOSIO_KEY_REJECTED" : "COMPOSIO_UNREACHABLE",
            });
            return;
          }
        }
      }

      const view = clearing
        ? await clearComposioApiKey(writeDeps, { workspaceId: deps.workspaceId })
        : await saveComposioApiKey(writeDeps, {
            workspaceId: deps.workspaceId,
            apiKey: String(body.apiKey),
          });

      if (clearing) {
        // Connected accounts belong to the Composio PROJECT the removed key addressed, so leaving
        // them behind would keep sealed credentials for a project this install can no longer reach
        // — and the connectors would keep rendering as connected while every call failed. Dropping
        // them is the same reasoning that makes `saveComposioApiKey` discard `authConfigIds` on a
        // key change, applied to the credentials those ids provisioned.
        deps.composioConnectors.service.deleteCredentialsByProvider("composio");
        await deps.composioConnectors.flushCredentials();
      }

      await deps.composioConnectors.refresh();
      res.json(view);
    } catch (error) {
      if (error instanceof ComposioConfigValidationError) {
        res.status(400).json({ error: error.message, code: "VALIDATION_ERROR" });
        return;
      }
      if (error instanceof ComposioConfigSecretStoreUnconfiguredError) {
        res.status(503).json({ error: error.message, code: "SECRET_STORE_UNCONFIGURED" });
        return;
      }
      console.error(`connectors config write failed: ${error instanceof Error ? error.message : String(error)}`);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
