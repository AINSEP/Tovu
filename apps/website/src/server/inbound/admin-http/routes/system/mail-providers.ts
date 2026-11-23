import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, Request, Response } from "express";

import { mailProviderRefusal, type MailProviderFailure } from "@jini-ai/cms/admin-http/routes/system/mail-providers";
import {
  CustomCredentialDuplicateLabelError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
} from "#src/features/custom-credentials/index";
import {
  MailProviderOperationError,
  saveMailProviderCredential,
  type MailProviderCredentialInput,
} from "#src/features/mail-status/provider-operations";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The one admin mail provider route still hand-written (K1 STOP): `PUT
 * …/system/mail-providers/:providerId/credential`, body `{token?, username?, baseUrl?}` — creates or
 * rotates the key in the custom-credentials store WITHOUT activating the provider; the next send
 * already uses it. `custom-credentials.write`. Never echoes a secret. It stays here because only the
 * owner's human SESSION may replace a shared key, and that reads `res.locals.authCredentialKind`,
 * which a Jini spec behind the shared admin ports never sees.
 *
 * Its siblings (configuration read, credential plan, activate) are Jini specs
 * (`@jini-ai/cms/admin-http/routes/system/mail-providers`) over the same
 * `features/mail-status/provider-operations.ts` operations the assistant's `mail_list_providers`,
 * `mail_configure_provider` and `mail_set_provider` call. `registerAdminMailProviderRoutes`
 * (`runtime/composition/modules/system-mail.ts`) mounts them and calls this registrar in its original
 * position. Both halves answer refusals through one table: {@link classifyMailProviderError} maps the
 * host's error classes, the spec's `mailProviderRefusal` picks the status and body.
 */
export type AdminMailProviderDeps = Pick<RouteDeps, "workspaceId" | "authorize" | "clock" | "idGen" | "customCredentialSetRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring" | "ownerPrincipalId">
  & Partial<Pick<RouteDeps, "mailProviderControl" | "projectKeys">>;

const BASE_PATH = "/api/admin/v1/workspaces/:workspaceId/system/mail-providers";

/** Store errors keep the custom-credentials route's codes. */
const STORE_ERRORS: readonly [new (...args: never[]) => Error, MailProviderFailure & { kind: "store" }][] = [
  [CustomCredentialValidationError, { kind: "store", code: "VALIDATION" }],
  [CustomCredentialDuplicateLabelError, { kind: "store", code: "DUPLICATE_LABEL" }],
  [CustomCredentialNotFoundError, { kind: "store", code: "NOT_FOUND" }],
  [CustomCredentialSecretStoreUnconfiguredError, { kind: "store", code: "SECRET_STORE_UNCONFIGURED" }],
];

/** The host's own error classes, as the mail-provider specs' failures; anything else is unexpected (`undefined`).
 * @complexity O(1).
 */
export function classifyMailProviderError({ error }: { error: unknown }, _optional: Record<string, never> = {}): MailProviderFailure | undefined {
  if (error instanceof MailProviderOperationError) return { kind: "operation", code: error.code, message: error.message };
  return STORE_ERRORS.find(([type]) => error instanceof type)?.[1];
}

/** Maps a refusal to its status; anything else is a logged 500 without the error's text. */
function sendError({ res, err }: { res: Response; err: unknown }, _optional = {}): void {
  const failure = classifyMailProviderError({ error: err });
  if (failure) {
    const { status, body } = mailProviderRefusal({ failure });
    res.status(status).json(body);
    return;
  }

  sendAdminFailure({ res, error: err }, { operation: "routes/system/mail-providers", code: "INTERNAL_ERROR" });
}

/** The body's credential parts; any non-string part is refused rather than coerced. */
function readCredentialInput({ body }: { body: unknown }, _optional = {}): MailProviderCredentialInput {
  const record = (typeof body === "object" && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const input: Record<string, string> = {};
  for (const key of ["token", "username", "baseUrl"] as const) {
    if (record[key] === undefined) continue;
    if (typeof record[key] !== "string") throw new MailProviderOperationError({ code: "MAIL_PROVIDER_INPUT", message: `${key} must be a string.` });
    input[key] = record[key] as string;
  }
  return input;
}

/** Workspace match + the permission (`direct`: `deps.authorize`, no publishing-credential override); writes the response and returns null when the caller must stop. */
async function authorized({ req, res, deps, permission }: { req: Request; res: Response; deps: AdminMailProviderDeps; permission: string }, _optional = {}): Promise<string | null> {
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

/** `PUT …/:providerId/credential`: authorize, save (never activates), answer `{ provider }` or the mapped refusal. */
export function registerAdminMailProviderCredentialSaveRoute({ app, deps }: { app: Express; deps: AdminMailProviderDeps }, _optional: Record<string, never> = {}): void {
  const credentials = { repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };
  app.put(`${BASE_PATH}/:providerId/credential`, async (req: Request, res: Response) => {
    try {
      const principalId = await authorized({ req, res, deps, permission: "custom-credentials.write" });
      if (principalId === null) return;
      // Match the custom-credentials route: only the owner's human session can replace a shared key.
      const ownerSession = res.locals.authCredentialKind === "session" && principalId === await deps.ownerPrincipalId;
      res.status(200).json({ provider: await saveMailProviderCredential({ control: deps.mailProviderControl,
        credentials: { ...credentials, allowSharedKeyReplacement: ownerSession }, workspaceId: deps.workspaceId,
        providerId: String(req.params.providerId), input: readCredentialInput({ body: req.body }) }, { projectKeys: deps.projectKeys }) });
    } catch (err) {
      sendError({ res, err });
    }
  });
}
