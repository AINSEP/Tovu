import type { Express, Request, Response } from "express";

import {
  CustomCredentialDuplicateLabelError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
} from "#src/features/custom-credentials/index";
import {
  activateMailProvider,
  MailProviderOperationError,
  planMailProviderCredential,
  readMailProviderConfigurations,
  saveMailProviderCredential,
  type MailProviderCredentialInput,
  type MailProviderOperationCode,
} from "#src/features/mail-status/provider-operations";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Admin mail provider actions beside `./mail-status.ts` (email phase 2, 2026-10-22). Thin
 * HTTP adapters over `features/mail-status/provider-operations.ts`, the same operations the
 * assistant's `mail_list_providers`, `mail_configure_provider` and `mail_set_provider` call:
 *
 * - `GET  …/system/mail-providers` — the safe configuration DTO (`admin.forms.manage`, like status).
 * - `GET  …/system/mail-providers/:providerId/credential` — what saving its key takes (label,
 *   category, default endpoint, create vs rotate). `custom-credentials.write`.
 * - `PUT  …/system/mail-providers/:providerId/credential` — body `{token?, username?, baseUrl?}`:
 *   creates or rotates the key in the custom-credentials store WITHOUT activating the provider; the
 *   next send already uses it. `custom-credentials.write`. Never echoes a secret.
 * - `POST …/system/mail-providers/:providerId/activate` — switches BOTH lanes after re-checking the
 *   provider; the click is the person's explicit confirmation. `settings.workspace.write`.
 */
export type AdminMailProviderDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock" | "idGen" | "customCredentialSetRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring">
  & Partial<Pick<RouteDeps, "mailProviderControl">>;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/mail-providers";

const OPERATION_STATUS: Readonly<Record<MailProviderOperationCode, number>> = {
  MAIL_PROVIDER_CONTROL_UNAVAILABLE: 503, MAIL_PROVIDER_NOT_FOUND: 404, MAIL_PROVIDER_KEYLESS: 409, MAIL_PROVIDER_REFUSED: 409, MAIL_PROVIDER_INPUT: 400,
};

/** Store errors keep the custom-credentials route's codes. */
const STORE_ERRORS: readonly [new (...args: never[]) => Error, number, string][] = [
  [CustomCredentialValidationError, 400, "VALIDATION"],
  [CustomCredentialDuplicateLabelError, 409, "DUPLICATE_LABEL"],
  [CustomCredentialNotFoundError, 404, "NOT_FOUND"],
  [CustomCredentialSecretStoreUnconfiguredError, 503, "SECRET_STORE_UNCONFIGURED"],
];

/** Maps a refusal to its status; anything else is a logged 500 without the error's text. */
function sendError(res: Response, err: unknown): void {
  if (err instanceof MailProviderOperationError) {
    res.status(OPERATION_STATUS[err.code]).json({ error: err.message, code: err.code });
    return;
  }
  const known = STORE_ERRORS.find(([type]) => err instanceof type);
  if (known) {
    res.status(known[1]).json({ error: known[2], detail: (err as Error).message });
    return;
  }
  console.error("[system/mail-providers] unexpected error");
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/** The body's credential parts; any non-string part is refused rather than coerced. */
function readCredentialInput(body: unknown): MailProviderCredentialInput {
  const record = (typeof body === "object" && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const input: Record<string, string> = {};
  for (const key of ["token", "username", "baseUrl"] as const) {
    if (record[key] === undefined) continue;
    if (typeof record[key] !== "string") throw new MailProviderOperationError({ code: "MAIL_PROVIDER_INPUT", message: `${key} must be a string.` });
    input[key] = record[key] as string;
  }
  return input;
}

export function registerAdminMailProviderRoutes(app: Express, deps: AdminMailProviderDeps): void {
  const credentials = { repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };

  /** Workspace match + per-action permission; writes the response and returns null when the caller must stop. */
  async function authorized(req: Request, res: Response, permission: string): Promise<string | null> {
    if (req.params.workspaceId !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return null;
    }
    const principal = getAuthedPrincipal(res);
    const result = await deps.authorize({ principalId: principal.id, permission, workspaceId: deps.workspaceId, entityType: "mail" });
    if (result.allowed) return principal.id;
    res.status(403).json({ error: `principal '${principal.id}' is not authorized for '${permission}' (${result.reason})`, code: "FORBIDDEN", details: { permission, reason: result.reason } });
    return null;
  }

  /** One route: authorize, run, answer 200 with the result or the mapped refusal. */
  const route = (permission: string, run: (required: { req: Request; principalId: string }) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      const principalId = await authorized(req, res, permission);
      if (principalId === null) return;
      res.status(200).json(await run({ req, principalId }));
    } catch (err) {
      sendError(res, err);
    }
  };
  const providerId = (req: Request): string => String(req.params.providerId);

  app.get(BASE_PATH, route("admin.forms.manage", () => readMailProviderConfigurations({ control: deps.mailProviderControl })));
  app.get(`${BASE_PATH}/:providerId/credential`, route("custom-credentials.write", ({ req }) =>
    planMailProviderCredential({ control: deps.mailProviderControl, providerId: providerId(req) })));
  app.put(`${BASE_PATH}/:providerId/credential`, route("custom-credentials.write", async ({ req }) => ({
    provider: await saveMailProviderCredential({ control: deps.mailProviderControl, credentials, workspaceId: deps.workspaceId, providerId: providerId(req), input: readCredentialInput(req.body) }),
  })));
  app.post(`${BASE_PATH}/:providerId/activate`, route("settings.workspace.write", ({ req, principalId }) =>
    activateMailProvider({ control: deps.mailProviderControl, providerId: providerId(req), principalId })));
}
