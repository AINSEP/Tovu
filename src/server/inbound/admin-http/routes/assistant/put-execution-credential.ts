import {
  ExecutionCredentialSecretStoreUnconfiguredError,
  ExecutionCredentialValidationError,
  setExecutionCredential,
} from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { AssistantSettingsRouteRegistrar } from "./deps.js";

/** `maxTokens` and `providerId` each accept their own shape; every other field defaults to
 *  string-or-omitted (looked up via the `undefined` key below). */
const EXECUTION_CREDENTIAL_FIELD_VALIDATORS: Readonly<
  Record<string, { readonly ok: (value: unknown) => boolean; readonly message: string }>
> = {
  maxTokens: { ok: (value) => value === undefined || typeof value === "number", message: "maxTokens must be a number" },
  providerId: {
    ok: (value) => value === undefined || value === null || typeof value === "string",
    message: "providerId must be a string or null",
  },
};

/**
 * Validates one `PUT` body field's shape. Present-but-wrong-type is a REJECTION, same posture as
 * `put-site-credential.ts`'s identical check — an `undefined` field is "leave alone," but a present
 * malformed field must not be silently reinterpreted as "the caller sent nothing."
 *
 * @throws {ExecutionCredentialValidationError} if `value` doesn't match `field`'s accepted shape.
 * @complexity O(1).
 */
function validateExecutionCredentialField(field: string, value: unknown): void {
  const specific = EXECUTION_CREDENTIAL_FIELD_VALIDATORS[field];
  const ok = specific ? specific.ok(value) : value === undefined || typeof value === "string";
  if (ok) {
    return;
  }
  throw new ExecutionCredentialValidationError(specific ? specific.message : `${field} must be a string`);
}

/**
 * PUT (partial) the calling admin's OWN BYOK execution credential. Body:
 * `{ apiKey?, protocol?, providerId?, baseUrl?, model?, maxTokens? }` — omitted `apiKey` leaves the
 * stored key untouched; an empty string is rejected (DELETE clears the key). The response NEVER
 * echoes the key, only the same `{isSet, masked, protocol, providerId, baseUrl, model, maxTokens,
 * updatedAt}` shape GET returns.
 *
 * Scoped to `(deps.workspaceId, getAuthedPrincipal(res).id)` — an admin can only ever write their
 * own row. Same 3-outcome split as `put-site-credential.ts`: 400 validation, 503
 * `SECRET_STORE_UNCONFIGURED` (missing `TOVU_INTEGRATIONS_ROOT_KEY`, checked before any write), 500
 * everything else.
 */
export const registerAdminAssistantPutExecutionCredentialRoute: AssistantSettingsRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/assistant/execution-credential", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const principal = getAuthedPrincipal(res);
      const body = (req.body ?? {}) as {
        apiKey?: unknown;
        protocol?: unknown;
        providerId?: unknown;
        baseUrl?: unknown;
        model?: unknown;
        maxTokens?: unknown;
      };
      for (const [field, value] of Object.entries(body)) {
        validateExecutionCredentialField(field, value);
      }

      const view = await setExecutionCredential(
        {
          repo: deps.adminExecutionCredentialRepo,
          sealer: deps.siteAssistantSecretSealer,
          keyring: deps.siteAssistantSecretKeyring,
          clock: deps.clock,
        },
        {
          workspaceId: deps.workspaceId,
          principalId: principal.id,
          apiKey: body.apiKey as string | undefined,
          protocol: body.protocol as string | undefined,
          providerId: body.providerId as string | null | undefined,
          baseUrl: body.baseUrl as string | undefined,
          model: body.model as string | undefined,
          maxTokens: body.maxTokens as number | undefined,
        }
      );
      res.json({ data: view });
    } catch (err) {
      if (err instanceof ExecutionCredentialValidationError) {
        res.status(400).json({ error: err.message, code: "EXECUTION_CREDENTIAL_VALIDATION_ERROR" });
        return;
      }
      if (err instanceof ExecutionCredentialSecretStoreUnconfiguredError) {
        res.status(503).json({
          error:
            "the execution credential secret store is not configured — set TOVU_INTEGRATIONS_ROOT_KEY (a hex-encoded root key) in the server environment",
          code: "SECRET_STORE_UNCONFIGURED",
        });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
