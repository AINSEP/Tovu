import { listProviderModels } from "@jini-ai/agent-runtime";
import { ADMIN_ASSISTANT_PERMISSION } from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/middleware/dev-auth";
import type { AssistantExecutionRouteRegistrar } from "./execution-deps.js";
import { readOptionalString, validateSupportedProtocol, type SupportedExecutionProtocol } from "./execution-request-fields.js";
import { resolveProbeCredential, type ProbeCredentialResolution } from "./stored-credential-probe.js";

/**
 * Calls `listProviderModels` and shapes its result into this route's response body — isolated so
 * the two `?? []`/spread-if-present shapes don't add to the handler's own branching.
 *
 * @complexity O(n) in the returned model count (one `.map()`).
 */
async function fetchListModelsResponse(
  protocol: SupportedExecutionProtocol,
  credential: Extract<ProbeCredentialResolution, { ok: true }>,
  apiVersion: string | undefined
) {
  const result = await listProviderModels({
    protocol,
    baseUrl: credential.baseUrl,
    apiKey: credential.apiKey,
    ...(apiVersion ? { apiVersion } : {}),
  });
  return {
    ok: result.ok,
    models: (result.models ?? []).map((model) => model.id),
    ...(result.detail ? { message: result.detail } : {}),
  };
}

interface ListModelsRequestBody {
  protocol?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  apiVersion?: unknown;
  /** Opt in to probing with the workspace's STORED site credential instead of a key in this body. */
  useStoredCredential?: unknown;
}

/**
 * POST live-discovers a BYOK provider's model catalog — the "Execution mode"
 * tab's optional `ExecutionPort.listModels`, wired by
 * `apps/admin/src/lib/execution-settings.ts`. Delegates to
 * `@jini-ai/agent-runtime`'s `listProviderModels` (dispatch trace Q5/Q6): the
 * same reasons `test-connection.ts` makes its outbound call server-side
 * apply here — the key stays out of the browser's cross-origin fetch and the
 * SSRF guard runs against a server-resolved base URL.
 *
 * Same never-persisted `apiKey` contract as `test-connection.ts` — see that
 * file's header.
 *
 * An earlier revision of this header answered the wrong threat here, and it is worth leaving the
 * correction visible: it argued the stored credential was safe because "the key still never reaches
 * the browser — decrypted, used for one outbound call, and only model IDs come back". Every clause
 * of that is true, and none of it was the exposure. The key did not need to reach the browser; the
 * SERVER sent it wherever the request body's `baseUrl` pointed, so a principal who may never read
 * that key could have it delivered to a host they controlled. `stored-credential-probe.ts` is what
 * actually holds the boundary now. A correct sentence about the wrong boundary reads like a safety
 * argument and audits like one too.
 */
export const registerAdminAssistantListModelsRoute: AssistantExecutionRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/assistant/execution/models", async (req, res) => {
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
        entityType: "assistant-execution",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for '${ADMIN_ASSISTANT_PERMISSION}' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: ADMIN_ASSISTANT_PERMISSION, reason: authResult.reason },
        });
        return;
      }

      const body = (req.body ?? {}) as ListModelsRequestBody;
      const protocol = readOptionalString(body.protocol, "");
      const baseUrl = readOptionalString(body.baseUrl, "");
      const apiVersion = readOptionalString(body.apiVersion, undefined);

      const protocolError = validateSupportedProtocol(protocol);
      if (protocolError) {
        res.status(400).json(protocolError);
        return;
      }
      if (!baseUrl.trim()) {
        res.status(400).json({ error: "baseUrl is required", code: "VALIDATION_ERROR" });
        return;
      }

      /**
       * Which key probes the provider, and WHERE that key is allowed to go — one chokepoint shared
       * with `test-connection.ts`. Runs AFTER the validation above, deliberately: a request that
       * cannot proceed must never cause the stored credential to be decrypted at all.
       *
       * A typed key always wins, and travels to the endpoint its owner named. Otherwise, and ONLY
       * when the caller explicitly opted in, the workspace's stored site credential is used — and
       * then it travels only to the endpoint the SERVER already recorded for it. A caller cannot
       * name a destination for a key ADR-058 forbids them to read; see
       * `stored-credential-probe.ts`'s header for the boundary and the residual path it leaves.
       *
       * The opt-in is the other load-bearing part and must not be softened into "empty key ⇒ use
       * the stored one". This route is shared: Settings → Execution mode calls it with the ADMIN's
       * own browser-local key, and the AI Assistant tab calls it for the SITE's key. An implicit
       * fallback would mean an operator on the Settings screen with an empty field silently probes
       * — and discovers models for — the visitor credential, quietly crossing the exact boundary
       * ADR-058 §5 exists to make structural. Two keys stay two keys, including here.
       */
      const credential = await resolveProbeCredential(deps, {
        requestedBaseUrl: baseUrl,
        typedKey: readOptionalString(body.apiKey, ""),
        useStoredCredential: body.useStoredCredential === true,
      });
      if (!credential.ok) {
        res.status(400).json(credential.failure);
        return;
      }

      res.json(await fetchListModelsResponse(protocol as SupportedExecutionProtocol, credential, apiVersion));
    } catch {
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
