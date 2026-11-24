import { invalidatePublishCredentialCompatibility } from "#src/features/deployments/publish-credentials/index";
import type { Express } from "express";

import {
  customCredentialCreateRoute, customCredentialDeleteRoute, type CustomCredentialView,
} from "@jini-ai/cms/admin-http/routes/system/custom-credentials";

import {
  sourceControlCreateRoute, sourceControlDeleteRoute, sourceControlListRoute, sourceControlProvidersRoute, sourceControlUpdateRoute,
} from "@jini-ai/cms/admin-http/routes/system/source-control-credentials";
import {
  createSourceControlCredential,
  deleteSourceControlCredential,
  listSourceControlCredentials,
  SourceControlCredentialDuplicateLabelError,
  SourceControlCredentialNotFoundError,
  SourceControlCredentialSecretStoreUnconfiguredError,
  SourceControlCredentialValidationError,
  updateSourceControlCredential,
} from "#src/features/source-control/index";
import {
  createCustomCredential,
  describeCredential as describeCustomCredentialForDelete,
  CustomCredentialDuplicateLabelError,
  CustomCredentialConcurrentModificationError,
  CustomCredentialNotFoundError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  deleteCustomCredential,
  type CustomCredentialSummary,
} from "#src/features/custom-credentials/index";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps, type AdminRouteAuthorization } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { registerAdminCustomCredentialsListRoute, registerAdminCustomCredentialsUpdateRoute } from "#src/server/inbound/admin-http/routes/system/custom-credentials";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file The saved-credential admin routes (K1, RT-K1-adm-system-1/-10/-11): source-control, custom
 * and publish credential CRUD are Jini route specs (`@jini-ai/cms/admin-http/routes/system/*`)
 * mounted behind the admin ports. `RouteDeps` is read only here, at registration: each mount builds
 * that route's own small deps object. The store functions, their error classes and the project-key
 * attach are Tovu features, injected as functions; deps are read per request (closures), so a
 * fixture that reassigns a field is honoured, and nothing is touched before authorization.
 *
 * See `CredentialsDeps` in `server/routes/route-deps/credentials-deps.ts` for why each route picks only its own repo.
 */

/** The two port fields every mount passes; `authorize` read per request (tests reassign it). */
function portDeps({ deps }: { deps: Pick<RouteDeps, "workspaceId" | "authorize"> }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Every credential verb kept `authorizeDirectOrRespond` (no publishing-credential override): each
 *  mount passes `"direct"`. No hand-written credential route refused a body before reading the
 *  session (each verb authorized first), so none opts into `deferMissingPrincipal`. Every
 *  hand-written credential verb was registered through `asyncRoute`, so each spec mount here keeps
 *  `forwardRejection` (the route-table pin holds those eleven registrations). */
function mountOptions(
  { operation, authorization }: { operation: string; authorization: AdminRouteAuthorization },
  optional: Pick<AdminJsonRouteMountOptions, "authorizationByPermission" | "deferMissingPrincipal"> = {},
): AdminJsonRouteMountOptions {
  return { authorization, failure: { operation, code: "INTERNAL_ERROR" }, forwardRejection: true, ...optional };
}

// ── source-control ──────────────────────────────────────────────────────────────────────────────

export type AdminSourceControlCredentialsDeps = Pick<
  RouteDeps,
  "projectKeys" | "workspaceId" | "authorize" | "clock" | "idGen" | "sourceControlCredentialSetRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring" | "loadSourceControlProviders" | "customCredentialsHttpClient"
>;

const SOURCE_CONTROL_ERRORS = {
  validation: SourceControlCredentialValidationError,
  duplicateLabel: SourceControlCredentialDuplicateLabelError,
  notFound: SourceControlCredentialNotFoundError,
  secretStoreUnconfigured: SourceControlCredentialSecretStoreUnconfiguredError,
};

function sourceControlReadDeps({ deps }: { deps: AdminSourceControlCredentialsDeps }, _optional: Record<string, never> = {}) {
  return { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer };
}

function sourceControlWriteDeps({ deps }: { deps: AdminSourceControlCredentialsDeps }, _optional: Record<string, never> = {}) {
  return {
    ...sourceControlReadDeps({ deps }),
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
    // why: the save-time account probe carries the token, so it goes through the guarded client (never native fetch).
    httpClient: deps.customCredentialsHttpClient,
    loadSourceControlProviders: deps.loadSourceControlProviders,
  };
}

type SourceControlProvidersLoader = AdminSourceControlCredentialsDeps["loadSourceControlProviders"];

/** The provider loader the providers spec calls, reporting each plugin load refusal through the
 *  required `reportRefusal` port first. Plugin load refusals go to the server log, never the
 *  response (the Jini spec copies only named provider fields). `load` is read per request.
 * @complexity O(r) per load for r refusals. */
function providerLoaderReportingRefusals(
  { load, reportRefusal }: { load: () => SourceControlProvidersLoader; reportRefusal: (refusal: string) => void },
  _optional: Record<string, never> = {},
): SourceControlProvidersLoader {
  return async (args) => {
    const registry = await load()(args);
    for (const refusal of registry.refusals) reportRefusal(refusal);
    return registry;
  };
}

/**
 * @file Admin Source Control page's credential CRUD backend.
 *
 * Registers `GET`/`POST` on the collection and `PUT`/`DELETE` on a single credential set, all under
 * `/api/admin/v1/workspaces/:workspaceId/system/source-control/credentials`, plus `GET
 * .../system/source-control/providers` (the plugin-declared hosts and their credential forms). Deliberately a THIN
 * HTTP adapter over `features/source-control/store.ts` — every validation, uniqueness, and
 * default-slot rule already lives there; this route's only job is: check auth, shape the request
 * into `store.ts`'s input types, map its thrown errors to HTTP status codes, and return
 * `SourceControlCredentialSummary` — never the sealed connection, never a token, never a username.
 *
 * `source-control.credentials.write`-gated on every verb, NOT `system.publish` — the permission
 * `publish-credentials.ts` uses for its own structurally-identical route. Reusing `system.publish`
 * here would be wrong semantics: this page connects a plugin-provided source-control IDENTITY,
 * which is separate from a publish target and never triggers a publish. The saved identity
 * carries authentication only, with no commit history, sync, or versioning. A saved connection's existence and label
 * are themselves operationally sensitive (which external accounts this workspace can reach with a
 * write-scoped credential) — the same "gate the read same as the write" reasoning
 * `publish-credentials.ts`'s own header gives for its single-permission-on-every-verb shape, which
 * this route mirrors with its own dedicated permission string instead. Matches the established
 * per-feature permission convention `deployments.read`/`deployments.credentials.write` and
 * `analytics.read`/`backup.read`/`comments.read` already set (the deployments permission
 * precedent): a NEW dot-namespaced permission, not a reused one, and the
 * seeded owner's wildcard grant authorizes it immediately with no seed edit required.
 *
 * See `CredentialsDeps` in `server/routes/route-deps/credentials-deps.ts` for why each route picks only its own repo.
 *
 * Same registration order as before: providers, list, create, update, delete.
 */
export function registerAdminSourceControlCredentialsRoutes({ app, deps }: { app: Express; deps: AdminSourceControlCredentialsDeps }, _optional: Record<string, never> = {}): void {
  const readDeps = sourceControlReadDeps({ deps });
  const writeDeps = sourceControlWriteDeps({ deps });
  const base = { ...portDeps({ deps }), storeErrors: SOURCE_CONTROL_ERRORS };
  const options = mountOptions({ operation: "routes/system/source-control-credentials", authorization: "direct" });
  const loadSourceControlProviders = providerLoaderReportingRefusals({
    load: () => deps.loadSourceControlProviders,
    reportRefusal: (refusal) => console.warn(`[source-control-providers] ${refusal}`),
  });
  mountAdminJsonRoute({ app, spec: sourceControlProvidersRoute, deps: { ...base, loadSourceControlProviders } }, options);
  mountAdminJsonRoute({ app, spec: sourceControlListRoute, deps: { ...base, listCredentials: ({ workspaceId }) => listSourceControlCredentials(readDeps, { workspaceId }) } }, options);
  mountAdminJsonRoute({ app, spec: sourceControlCreateRoute, deps: {
    ...base,
    createCredential: (input) => createSourceControlCredential({ deps: writeDeps, input: input as Parameters<typeof createSourceControlCredential>[0]["input"] }),
    hasProjectStore: () => Boolean(deps.sourceControlCredentialSetRepo.project),
    useProjectKey: async ({ keyId }) => { await deps.projectKeys?.use({ keyId, use: true }); },
  } }, options);
  mountAdminJsonRoute({ app, spec: sourceControlUpdateRoute, deps: {
    ...base,
    updateCredential: (input) => updateSourceControlCredential({ deps: writeDeps, input: input as Parameters<typeof updateSourceControlCredential>[0]["input"] }),
  } }, options);
  mountAdminJsonRoute({ app, spec: sourceControlDeleteRoute, deps: { ...base, deleteCredential: (args) => deleteSourceControlCredential(readDeps, args) } }, options);
}

// ── custom ──────────────────────────────────────────────────────────────────────────────────────

export type AdminCustomCredentialsDeps = Pick<
  RouteDeps,
  "workspaceId" | "authorize" | "clock" | "idGen" | "customCredentialSetRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring"
> & Partial<Pick<RouteDeps, "loadDeployTargets" | "publishCredentialVerificationCache" | "projectKeys" | "ownerPrincipalId">>;

const CUSTOM_ERRORS = {
  validation: CustomCredentialValidationError,
  concurrentModification: CustomCredentialConcurrentModificationError,
  duplicateLabel: CustomCredentialDuplicateLabelError,
  notFound: CustomCredentialNotFoundError,
  secretStoreUnconfigured: CustomCredentialSecretStoreUnconfiguredError,
};

function customReadDeps({ deps }: { deps: AdminCustomCredentialsDeps }, _optional: Record<string, never> = {}) {
  return { repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer };
}

function customWriteDeps({ deps }: { deps: AdminCustomCredentialsDeps }, _optional: Record<string, never> = {}) {
  return { ...customReadDeps({ deps }), keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };
}

/** Deploy targets are loaded only when there is a publish-verification cache to invalidate. */
async function prepareCustomInvalidation({ deps }: { deps: AdminCustomCredentialsDeps }, _optional: Record<string, never> = {}) {
  const cache = deps.publishCredentialVerificationCache;
  if (!deps.loadDeployTargets || !cache) return undefined;
  const registry = await deps.loadDeployTargets({ workspaceId: deps.workspaceId });
  if (!registry) return undefined;
  // The spec hands back the summaries the store returned, unchanged; the view type only names what it reads.
  return (change: { before?: CustomCredentialView; after?: CustomCredentialView }) =>
    invalidatePublishCredentialCompatibility({ workspaceId: deps.workspaceId, registry, cache, ...(change as { before?: CustomCredentialSummary; after?: CustomCredentialSummary }) });
}

/** The fields both custom spec mounts share; each is read per request. */
function customBase({ deps, readDeps }: { deps: AdminCustomCredentialsDeps; readDeps: ReturnType<typeof customReadDeps> }, _optional: Record<string, never> = {}) {
  return {
    ...portDeps({ deps }), storeErrors: CUSTOM_ERRORS,
    projectKeys: () => deps.projectKeys,
    describeCredential: (target: { workspaceId: string; id: string }) => describeCustomCredentialForDelete(readDeps, target),
    prepareInvalidation: () => prepareCustomInvalidation({ deps }),
  };
}

/** Same registration order as before: list, create, update, delete. */
export function registerAdminCustomCredentialsRoutes({ app, deps }: { app: Express; deps: AdminCustomCredentialsDeps }, _optional: Record<string, never> = {}): void {
  const options = mountOptions({ operation: "routes/system/custom-credentials", authorization: "direct" });
  // Store deps are bound once, at registration, as the hand-written routes bound them.
  const readDeps = customReadDeps({ deps });
  const writeDeps = customWriteDeps({ deps });
  const base = customBase({ deps, readDeps });
  // List and update STAY hand-written (K1 STOP): they read `res.locals.authCredentialKind`.
  registerAdminCustomCredentialsListRoute({ app, deps });
  mountAdminJsonRoute({ app, spec: customCredentialCreateRoute, deps: {
    ...base,
    createCredential: (input) => createCustomCredential(writeDeps, input as unknown as Parameters<typeof createCustomCredential>[1]),
  } }, options);
  registerAdminCustomCredentialsUpdateRoute({ app, deps });
  mountAdminJsonRoute({ app, spec: customCredentialDeleteRoute, deps: {
    ...base, deleteCredential: (target) => deleteCustomCredential(readDeps, target),
  } }, options);
}
