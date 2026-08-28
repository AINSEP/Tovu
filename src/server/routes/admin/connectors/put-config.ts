import type { Express, Response } from "express";

import {
  clearComposioApiKey,
  ComposioConfigSecretStoreUnconfiguredError,
  ComposioConfigValidationError,
  saveComposioApiKey,
  type ComposioConfigWriteDeps,
} from "#src/platform/connectors/composio-config-store";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import type { ConnectorsConfigRouteDeps } from "./deps.js";

/** Result of validating the `{ apiKey }` request body against the "store or clear, never guess" rule. */
type ParsedApiKeyBody =
  | { readonly ok: false }
  | { readonly ok: true; readonly clearing: true }
  | { readonly ok: true; readonly clearing: false; readonly apiKey: string };

/**
 * Requires an explicit `apiKey` property: `null` clears, anything else is a candidate to store. A
 * missing property is rejected rather than defaulted, matching the module doc above the route.
 *
 * @complexity O(1).
 */
function parseApiKeyBody(body: unknown): ParsedApiKeyBody {
  if (body === null || typeof body !== "object" || !Object.hasOwn(body, "apiKey")) {
    return { ok: false };
  }
  const raw = (body as { apiKey?: unknown }).apiKey;
  if (raw === null) {
    return { ok: true, clearing: true };
  }
  return { ok: true, clearing: false, apiKey: String(raw) };
}

/** Outcome of verifying a candidate key against Composio before it is ever persisted. */
type VerifyOutcome =
  | { readonly kind: "ok" }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number }
  | { readonly kind: "rejected" }
  | { readonly kind: "unreachable" };

/**
 * Verifies a non-blank candidate key against Composio, rate-limited the same way
 * `connect`/`disconnect`/list-refresh/preview-hydration are (see the module doc). A blank candidate
 * short-circuits to `"ok"` untouched — `saveComposioApiKey` is what rejects it, at persist time.
 *
 * @complexity O(1) plus one outbound call to Composio.
 */
async function verifyApiKeyCandidate(
  deps: ConnectorsConfigRouteDeps,
  outboundLimiter: RateLimiter,
  clientIp: string,
  candidate: string
): Promise<VerifyOutcome> {
  if (!candidate) {
    return { kind: "ok" };
  }
  const rateLimitResult = outboundLimiter.check(clientIp);
  if (!rateLimitResult.allowed) {
    return { kind: "rate_limited", retryAfterSeconds: rateLimitResult.retryAfterSeconds };
  }
  const probe = await deps.composioConnectors.probeApiKey(candidate);
  if (!probe.ok) {
    return { kind: probe.reason === "rejected" ? "rejected" : "unreachable" };
  }
  return { kind: "ok" };
}

/**
 * Writes the 429/400/502 response for a non-`"ok"` verify outcome. Returns whether it did, so the
 * caller can `return` without re-branching on `outcome.kind` itself.
 *
 * @complexity O(1).
 */
function respondToVerifyFailure(res: Response, outcome: VerifyOutcome): boolean {
  if (outcome.kind === "ok") {
    return false;
  }
  if (outcome.kind === "rate_limited") {
    res.setHeader("Retry-After", String(outcome.retryAfterSeconds));
    res.status(429).json({
      error: "too many key-verification attempts",
      code: "RATE_LIMIT_EXCEEDED",
      details: { retryAfterSeconds: outcome.retryAfterSeconds },
    });
    return true;
  }
  const rejected = outcome.kind === "rejected";
  res.status(rejected ? 400 : 502).json({
    error: rejected
      ? "Composio rejected that API key. Check it and try again."
      : "Couldn't reach Composio to verify that API key. It was not saved.",
    code: rejected ? "COMPOSIO_KEY_REJECTED" : "COMPOSIO_UNREACHABLE",
  });
  return true;
}

/**
 * Persists the parsed body (store or clear) and runs the side effects that keep the long-lived
 * Composio provider in sync — see the module doc for why `refresh()` and, on clear, dropping
 * credentials by provider are both required rather than incidental cleanup.
 *
 * @complexity O(1) plus the repo write and the provider refresh.
 */
async function writeComposioConfig(
  writeDeps: ComposioConfigWriteDeps,
  deps: ConnectorsConfigRouteDeps,
  parsed: Extract<ParsedApiKeyBody, { ok: true }>
) {
  const view = parsed.clearing
    ? await clearComposioApiKey(writeDeps, { workspaceId: deps.workspaceId })
    : await saveComposioApiKey(writeDeps, { workspaceId: deps.workspaceId, apiKey: parsed.apiKey });

  if (parsed.clearing) {
    // See the module doc: connected accounts belong to the Composio PROJECT the removed key
    // addressed, so they must not survive it.
    deps.composioConnectors.service.deleteCredentialsByProvider("composio");
    await deps.composioConnectors.flushCredentials();
  }

  await deps.composioConnectors.refresh();
  return view;
}

/** Maps this route's own thrown error types onto the admin error envelope. */
function sendPutConfigError(res: Response, error: unknown): void {
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

      const parsed = parseApiKeyBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: "apiKey is required (send null to clear)", code: "VALIDATION_ERROR" });
        return;
      }

      // Verify BEFORE persisting. Without this the workspace reports `configured: true` for a key
      // Composio would refuse, the grid unlocks, and the operator only finds out when a detail
      // drawer 401s — because the provider swallows a failed catalog refresh and falls back to its
      // static catalog. See `connectors/composio-key-probe.ts` for why this is a persist-time gate
      // here while the BYOK equivalent is a standalone route.
      if (!parsed.clearing) {
        const outcome = await verifyApiKeyCandidate(deps, outboundLimiter, resolveClientIp(req), parsed.apiKey.trim());
        if (respondToVerifyFailure(res, outcome)) {
          return;
        }
      }

      const writeDeps: ComposioConfigWriteDeps = {
        repo: deps.composioConfigRepo,
        sealer: deps.siteAssistantSecretSealer,
        keyring: deps.siteAssistantSecretKeyring,
        clock: deps.clock,
      };
      res.json(await writeComposioConfig(writeDeps, deps, parsed));
    } catch (error) {
      sendPutConfigError(res, error);
    }
  });
}
