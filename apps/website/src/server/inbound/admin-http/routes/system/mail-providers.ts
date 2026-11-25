import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import type { Express } from "express";

import { mailProviderCredentialSaveRoute, type MailProviderFailure } from "@jini-ai/cms/admin-http/routes/system/mail-providers";
import {
  CustomCredentialDuplicateLabelError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
} from "#src/features/custom-credentials/index";
import {
  MailProviderOperationError,
  saveMailProviderCredential,
} from "#src/features/mail-status/provider-operations";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The host binding of the admin mail provider credential save: `PUT
 * …/system/mail-providers/:providerId/credential`, body `{token?, username?, baseUrl?}` — creates or
 * rotates the key in the custom-credentials store WITHOUT activating the provider; the next send
 * already uses it. `custom-credentials.write`. Never echoes a secret. Its binding stays here because only
 * the owner's human SESSION may replace a shared key, and that reads `res.locals.authCredentialKind`,
 * which the Jini spec (`mailProviderCredentialSaveRoute`) behind the shared admin ports gets per request
 * through `requestDeps`.
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

/** Placeholder for a request-bound dep at mount time; `requestDeps` replaces it on every request. */
const boundPerRequest = (): never => { throw new Error("bound per request by requestDeps"); };

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

/** `PUT …/:providerId/credential` (Jini spec): `direct` authorization and the one `routes/system/mail-providers`
 * failure copy, as its siblings; the request's credential kind and the owner id are bound per request.
 * @complexity O(1) setup; per request one authorization, at most one owner read and one save. */
export function registerAdminMailProviderCredentialSaveRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: AdminMailProviderDeps }, _optional: Record<string, never> = {}): void {
  const credentials = { repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };
  mountAdminJsonRoute({ errors, app, spec: mailProviderCredentialSaveRoute, deps: {
    workspaceId: deps.workspaceId,
    authorize: (params: Parameters<AdminMailProviderDeps["authorize"]>[0]) => deps.authorize(params),
    classifyMailProviderError,
    requestCredentialKind: boundPerRequest,
    ownerPrincipalId: async () => deps.ownerPrincipalId,
    saveMailProviderCredential: ({ providerId, input, allowSharedKeyReplacement }) => saveMailProviderCredential({ control: deps.mailProviderControl,
      credentials: { ...credentials, allowSharedKeyReplacement }, workspaceId: deps.workspaceId, providerId, input }, { projectKeys: deps.projectKeys }),
  } }, {
    // Workspace match + the permission (`direct`: `deps.authorize`, no publishing-credential override)
    // are the admin mount's ports; a refusal writes the response before the spec runs.
    authorization: "direct",
    // Maps a refusal to its status; anything else is a logged 500 without the error's text.
    failure: { operation: "routes/system/mail-providers", code: "INTERNAL_ERROR" },
    requestDeps: ({ res, deps: base }) => ({ ...base, requestCredentialKind: () => res.locals.authCredentialKind }),
  });
}
