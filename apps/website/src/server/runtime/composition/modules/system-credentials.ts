import type { Express } from "express";
import { publishCredentialCreateRoute } from "@jini-ai/cms/admin-http/routes/system/publish-credentials/create";
import { publishCredentialDeleteRoute } from "@jini-ai/cms/admin-http/routes/system/publish-credentials/delete";
import { publishCredentialUpdateRoute } from "@jini-ai/cms/admin-http/routes/system/publish-credentials/update";
import { publishCredentialVerifyRoute } from "@jini-ai/cms/admin-http/routes/system/publish-credentials/verify";

import {
  customCredentialCreateRoute, customCredentialDeleteRoute, type CustomCredentialView,
} from "@jini-ai/cms/admin-http/routes/system/custom-credentials";
import type { PublishCredentialView } from "@jini-ai/cms/admin-http/routes/system/publish-credentials/shared";

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
import {
  createAccountLabelHealScheduler,
  createPublishCredential,
  invalidatePublishCredentialCompatibility,
  deletePublishCredential,
  describeCredential as describePublishCredential,
  healAccountLabel,
  idsNeedingAccountLabelHeal,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
  updatePublishCredential,
  type PublishCredentialSummary,
  type UpdatePublishCredentialInput,
} from "#src/features/deployments/publish-credentials/index";
import {
  canYieldAccountLabel,
  verifyPublishCredentialById,
  type PublishCredentialVerificationResult,
} from "#src/features/deployments/static-publish/index";
import { mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { registerAdminCustomCredentialsListRoute, registerAdminCustomCredentialsUpdateRoute } from "#src/server/inbound/admin-http/routes/system/custom-credentials";
import type { RouteDeps } from "#src/server/routes/types";
import { registerAdminPublishCredentialsListRoute } from "#src/server/inbound/admin-http/routes/system/publish-credentials";

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

/** Every credential verb kept `authorizeDirectOrRespond` (no publishing-credential override): `"direct"`. */
function directFailure(operation: string, _optional: Record<string, never> = {}) {
  return { authorization: "direct" as const, failure: { operation, code: "INTERNAL_ERROR" } };
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

function sourceControlReadDeps(deps: AdminSourceControlCredentialsDeps) {
  return { repo: deps.sourceControlCredentialSetRepo, sealer: deps.siteAssistantSecretSealer };
}

function sourceControlWriteDeps(deps: AdminSourceControlCredentialsDeps) {
  return {
    ...sourceControlReadDeps(deps),
    keyring: deps.siteAssistantSecretKeyring,
    clock: deps.clock,
    idGen: deps.idGen,
    // why: the save-time account probe carries the token, so it goes through the guarded client (never native fetch).
    httpClient: deps.customCredentialsHttpClient,
    loadSourceControlProviders: deps.loadSourceControlProviders,
  };
}

/** Same registration order as before: providers, list, create, update, delete. */
export function registerAdminSourceControlCredentialsRoutes({ app, deps }: { app: Express; deps: AdminSourceControlCredentialsDeps }, _optional: Record<string, never> = {}): void {
  const readDeps = sourceControlReadDeps(deps);
  const writeDeps = sourceControlWriteDeps(deps);
  const base = { ...portDeps({ deps }), storeErrors: SOURCE_CONTROL_ERRORS };
  const options = directFailure("routes/system/source-control-credentials");
  mountAdminJsonRoute({ app, spec: sourceControlProvidersRoute, deps: { ...base, loadSourceControlProviders: (args) => deps.loadSourceControlProviders(args) } }, options);
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

function customReadDeps(deps: AdminCustomCredentialsDeps) {
  return { repo: deps.customCredentialSetRepo, sealer: deps.siteAssistantSecretSealer };
}

function customWriteDeps(deps: AdminCustomCredentialsDeps) {
  return { ...customReadDeps(deps), keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };
}

/** Deploy targets are loaded only when there is a publish-verification cache to invalidate. */
async function prepareCustomInvalidation(deps: AdminCustomCredentialsDeps) {
  const cache = deps.publishCredentialVerificationCache;
  if (!deps.loadDeployTargets || !cache) return undefined;
  const registry = await deps.loadDeployTargets({ workspaceId: deps.workspaceId });
  if (!registry) return undefined;
  // The spec hands back the summaries the store returned, unchanged; the view type only names what it reads.
  return (change: { before?: CustomCredentialView; after?: CustomCredentialView }) =>
    invalidatePublishCredentialCompatibility({ workspaceId: deps.workspaceId, registry, cache, ...(change as { before?: CustomCredentialSummary; after?: CustomCredentialSummary }) });
}

/** The fields both custom spec mounts share; each is read per request. */
function customBase(deps: AdminCustomCredentialsDeps, readDeps: ReturnType<typeof customReadDeps>) {
  return {
    ...portDeps({ deps }), storeErrors: CUSTOM_ERRORS,
    projectKeys: () => deps.projectKeys,
    describeCredential: (target: { workspaceId: string; id: string }) => describeCustomCredentialForDelete(readDeps, target),
    prepareInvalidation: () => prepareCustomInvalidation(deps),
  };
}

/** Same registration order as before: list, create, update, delete. */
export function registerAdminCustomCredentialsRoutes({ app, deps }: { app: Express; deps: AdminCustomCredentialsDeps }, _optional: Record<string, never> = {}): void {
  const options = directFailure("routes/system/custom-credentials");
  // Store deps are bound once, at registration, as the hand-written routes bound them.
  const readDeps = customReadDeps(deps);
  const writeDeps = customWriteDeps(deps);
  const base = customBase(deps, readDeps);
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

// ── publish ─────────────────────────────────────────────────────────────────────────────────────

export type AdminPublishCredentialsDeps = Pick<
  RouteDeps,
  | "projectKeys"
  | "workspaceId"
  | "authorize"
  | "clock"
  | "idGen"
  | "vendorCredentialSetRepo"
  | "contentKernel"
  | "siteAssistantSecretSealer"
  | "siteAssistantSecretKeyring"
  | "publishExecutionMode"
  | "publishCredentialVerificationCache"
  | "loadDeployTargets"
  | "observability"
>;

const PUBLISH_ERRORS = {
  validation: PublishCredentialValidationError,
  duplicateLabel: PublishCredentialDuplicateLabelError,
  notFound: PublishCredentialNotFoundError,
  secretStoreUnconfigured: PublishCredentialSecretStoreUnconfiguredError,
};

type VerifyAfterSave = (input: { id: string }) => Promise<PublishCredentialVerificationResult | undefined>;

function publishReadDeps(deps: AdminPublishCredentialsDeps) {
  return { sealer: deps.siteAssistantSecretSealer, repo: deps.vendorCredentialSetRepo, loadDeployTargets: deps.loadDeployTargets };
}

function publishWriteDeps(deps: AdminPublishCredentialsDeps): Parameters<typeof createPublishCredential>[0] {
  return { ...publishReadDeps(deps), keyring: deps.siteAssistantSecretKeyring, clock: deps.clock, idGen: deps.idGen };
}

/** Probe a just-saved credential; a probe that reads the provider's account label heals it in place.
 *  The decrypt step may throw (the provider-probe layer's "never throws" does not cover it). */
function buildVerifyAfterSave({ deps }: { deps: AdminPublishCredentialsDeps }, _optional: Record<string, never> = {}): VerifyAfterSave {
  return async function verifyAfterSave({ id }) {
    const result = await verifyPublishCredentialById(
      { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, cache: deps.publishCredentialVerificationCache, clock: deps.clock, loadDeployTargets: deps.loadDeployTargets, observability: deps.observability },
      { workspaceId: deps.workspaceId, id },
    );
    if (result?.accountLabel !== undefined) {
      await healAccountLabel({ repo: deps.vendorCredentialSetRepo }, { workspaceId: deps.workspaceId, id, accountLabel: result.accountLabel });
    }
    return result ?? undefined;
  };
}

/** One heal scheduler per registration (it keeps in-flight state), so it is built here, not per request.
 *  A deploy-target load failure only skips the heal; the list answer is already decided. */
function buildTriggerAccountLabelHeal({ deps, verifyAfterSave }: { deps: AdminPublishCredentialsDeps; verifyAfterSave: VerifyAfterSave }, _optional: Record<string, never> = {}) {
  const accountLabelHealScheduler = createAccountLabelHealScheduler({ heal: verifyAfterSave });
  return async function triggerAccountLabelHeal(credentials: readonly PublishCredentialSummary[]): Promise<void> {
    try {
      const registry = await deps.loadDeployTargets({ workspaceId: deps.workspaceId });
      accountLabelHealScheduler.triggerFor(idsNeedingAccountLabelHeal({ credentials, canYieldAccountLabel: (providerId) => canYieldAccountLabel({ registry, target: providerId }) }));
    } catch (err) {
      console.error("[publish-credentials] account-label heal skipped: deploy targets could not be loaded", err);
    }
  };
}

/** The deploy-target registry is loaded before every write, then each change re-checks its hosts. */
async function preparePublishInvalidation(deps: AdminPublishCredentialsDeps) {
  const registry = await deps.loadDeployTargets({ workspaceId: deps.workspaceId });
  // The spec hands back the summaries the store returned, unchanged; the view type only names what it reads.
  return (change: { before?: PublishCredentialView; after?: PublishCredentialView }) =>
    invalidatePublishCredentialCompatibility({ workspaceId: deps.workspaceId, registry, cache: deps.publishCredentialVerificationCache, ...(change as { before?: PublishCredentialSummary; after?: PublishCredentialSummary }) });
}

/** Same registration order as before: list, create, update, verify, delete. */
export function registerAdminPublishCredentialsRoutes({ app, deps }: { app: Express; deps: AdminPublishCredentialsDeps }, _optional: Record<string, never> = {}): void {
  const options = directFailure("routes/system/publish-credentials");
  // Store deps are bound once, at registration, as the hand-written routes bound them: a later
  // reassignment of `deps.loadDeployTargets` reaches only the per-request loads (heal, invalidation).
  const readDeps = publishReadDeps(deps);
  const writeDeps = publishWriteDeps(deps);
  const verifyAfterSave = buildVerifyAfterSave({ deps });
  const base = {
    ...portDeps({ deps }), storeErrors: PUBLISH_ERRORS, verifyAfterSave,
    prepareInvalidation: () => preparePublishInvalidation(deps),
    describeCredential: (target: { workspaceId: string; id: string }) => describePublishCredential(readDeps, target),
  };
  // STAYS hand-written (K1 STOP): a wire test pins that a principal-less direct call rejects.
  registerAdminPublishCredentialsListRoute({ app, deps, readDeps, triggerAccountLabelHeal: buildTriggerAccountLabelHeal({ deps, verifyAfterSave }) });
  mountAdminJsonRoute({ app, spec: publishCredentialCreateRoute, deps: {
    ...base,
    createCredential: (input) => createPublishCredential(writeDeps, input as Parameters<typeof createPublishCredential>[1]),
    hasProjectStore: () => Boolean(deps.vendorCredentialSetRepo.project),
    useProjectKey: async ({ keyId }) => { await deps.projectKeys?.use({ keyId, use: true }); },
  } }, options);
  mountAdminJsonRoute({ app, spec: publishCredentialUpdateRoute, deps: {
    ...base, updateCredential: (input) => updatePublishCredential(writeDeps, input as UpdatePublishCredentialInput),
  } }, options);
  mountAdminJsonRoute({ app, spec: publishCredentialVerifyRoute, deps: base }, options);
  mountAdminJsonRoute({ app, spec: publishCredentialDeleteRoute, deps: {
    ...base, deleteCredential: (target) => deletePublishCredential({ ...readDeps, transaction: deps.contentKernel }, target),
  } }, options);
}
