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

/**
 * Verifies ONE specific row (the one this route just touched) against its real provider. The
 * PROVIDER-PROBE layer never throws — `verify.ts`'s per-provider checkers fold every network
 * failure into `"unreachable"` rather than throwing (see that file's own header), so a transient
 * network blip can never turn a successful save into a 500. That guarantee does NOT extend to the
 * DECRYPT step underneath it: `verifyPublishCredentialById` calls `resolveForPublish`
 * (`publish-credentials/store.ts`), which throws `PublishCredentialSecretStoreUnconfiguredError`
 * when the stored secret cannot be decrypted (a missing site key, or a tampered/corrupt row)
 * — the SAME "surface, don't swallow" contract that module documents for itself. Every caller of
 * this function below MUST run through a `try`/`catch` that maps the result via `sendStoreError`.
 *
 * Found live (2026-08-16): this was NOT true for `POST .../:id/verify` below until this fix — it
 * had no try/catch at all, so a missing site key took down the WHOLE server process (Express 4
 * does not catch an async handler's own rejection, and nothing else in `src/` was catching it at
 * the process level either), not just that one request. An earlier version of THIS comment
 * claimed `verifyAfterSave` "never throws" without qualifying which layer that applied to — do
 * not repeat that mistake; the provider-probe layer's guarantee and the decrypt layer's contract
 * are two different things.
 *
 * Returns `null` only if the row vanished between the write this handler just performed and this
 * call — treated the same as "nothing to report" by every caller below, never surfaced as an
 * error for what was otherwise a successful save.
 *
 * Also heals `account_label` (`store.ts`'s `healAccountLabel`) whenever the result carries one —
 * see this file's own header. Deliberately checked via `result.accountLabel !== undefined` rather
 * than truthiness: an empty string is not a real account login/username (`verify.ts`'s own
 * extractors never produce one — see their doc comments), but the distinction is cheap to keep
 * exact rather than relying on that invariant holding forever. The heal is fire-and-forget from
 * this function's own caller's point of view (awaited here, but its failure must not turn a
 * successful verify into a failed response) — a targeted single-column write against a row this
 * same request just confirmed exists has no realistic failure mode short of the DB itself being
 * down, at which point the save/verify response the caller already has is still honest.
 *
 * Probe a just-saved credential; a probe that reads the provider's account label heals it in place.
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

/**
 * Hands the scheduler every listed row still missing an account label whose host can produce one
 * (the host's declared `yieldsAccountLabel`). Runs after the response is sent, so a registry load
 * failure is logged and swallowed: it must never reach the request that triggered it.
 *
 * One heal scheduler per registration (it keeps in-flight state), so it is built here, not per request.
 *  A deploy-target load failure only skips the heal; the list answer is already decided. */
function buildTriggerAccountLabelHeal({ deps, verifyAfterSave }: { deps: AdminPublishCredentialsDeps; verifyAfterSave: VerifyAfterSave }, _optional: Record<string, never> = {}) {
  // Built ONCE per route registration, like `verifyAfterSave` itself — its in-flight dedupe only
  // works if it survives between requests. `heal` is `verifyAfterSave` verbatim: a background self-
  // heal does exactly what a human clicking "Verify" already does, through the same function, never a
  // parallel code path that could drift from it. See this file's own header ("second pass") and
  // `account-label-heal-scheduler.ts`'s header for the full reasoning.
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

/**
 * @file Admin Deployment panel → Static Site tab's credential CRUD backend.
 *
 * Registers `GET`/`POST` on the collection and `PUT`/`DELETE` on a single credential set, all under
 * `/api/admin/v1/workspaces/:workspaceId/system/publish/credentials`. This is deliberately a THIN
 * HTTP adapter over `publish-credentials/store.ts` — every validation, uniqueness, and default-slot
 * rule already lives there (see that file's own header); this route's only job is: check auth, shape
 * the request into `store.ts`'s input types, map its thrown errors to HTTP status codes, and return
 * `PublishCredentialSummary` — never the sealed connection, never a token, never `accountId`. That
 * "read model never carries a secret field" guarantee is enforced by `PublishCredentialSummary`'s own
 * shape (`types.ts`), not by anything this route does — there is no field here that COULD leak one.
 *
 * `system.publish`-gated on every verb, matching `publish-site.ts`'s reasoning for its own trigger/
 * status routes: a saved connection's `label`/`providerId`/`isDefault` is itself operationally
 * sensitive (which external accounts this workspace can publish to), so this gets the same
 * single-permission gate as the fact of a live publish, not the softer `system.read` the state-less
 * `/publish/preview` route uses.
 *
 * 2026-08-16 — this is now the ONE place `verifyPublishCredential` (`static-publish/verify.ts`) is
 * ever called from a human action, per that module's own "never agent-facing" contract: `POST`/`PUT`
 * verify the just-saved connection best-effort (awaited, included in the response — the "did what I
 * just typed work" moment) without gating the save itself on the outcome (a rejected credential can
 * still be saved and fixed later — this route only reports what it found, it does not decide the
 * save is invalid because the provider disagrees), and a new `POST .../:id/verify` lets a human
 * re-check a stale or never-verified result without re-saving. Both write ONLY the cached,
 * non-secret `{ok, message, checkedAt}` result — never anything that could leak a credential value.
 *
 * Also 2026-08-16 (migration `0044`): `verifyAfterSave` additionally heals `publish_credential_sets
 * .account_label` (`publish-credentials/store.ts`'s `healAccountLabel`) whenever a verify comes back
 * `"valid"` with an `accountLabel` — this is the ONE write path allowed to populate that column (see
 * `store.ts`'s own header for why `createPublishCredential`/`updatePublishCredential` deliberately do
 * not: this route is human-gated, `create`/`update` are not, sharing a write path with an agent-facing
 * s3-compatible credential save). This is what makes the fix for "verification lived in
 * `InMemoryPublishCredentialVerificationCache` only, so a routine server restart silently reverted a
 * working, previously-verified credential to no known account" durable: `deployment_get_static_publish
 * _capabilities` can now read a real DB column that survives a restart, instead of only ever reading a
 * process-memory cache that does not.
 *
 * Also 2026-08-16 (same night, second pass): `POST`/`PUT` above already heal a row's account label the
 * moment it is saved — but only if THAT verify attempt succeeds. A row whose first auto-verify failed
 * (provider unreachable at save time), or one saved before this wiring existed at all, stayed
 * `account_label: null` forever unless a human found and clicked the per-row `POST .../:id/verify`
 * action — the reported bug: the assistant's `deployment_get_static_publish_capabilities` tool had no
 * account to default a repository-backed publish's `owner` to, and correctly refused to guess one, but a
 * non-technical owner had no reason to know a "Verify" button existed to fix it. `GET` below now also
 * calls {@link accountLabelHealScheduler}`.triggerFor` after every list read, for any row this list
 * call itself found still `null` on a provider that can ever yield a label
 * (`idsNeedingAccountLabelHeal`, `static-publish/verify.ts`'s `canYieldAccountLabel`) — fire-and-forget,
 * never awaited, never able to affect this (or any) response. This is deliberately the ONLY new trigger
 * point: `static-publish/verify.ts`'s own header is categorical that only a human-gated caller may ever
 * invoke a provider probe, and `publish-agent-tools.ts`'s capabilities handler reads this same table
 * via `listPublishCredentials` directly — putting a probe inside that shared, decrypt-free read
 * function (or anywhere reachable from it) would put a live outbound request on the agent's own path,
 * which is exactly what that boundary exists to prevent. This GET handler is human-gated (the admin
 * Deployment → Static Site tab loading its own list) and reuses `verifyAfterSave` verbatim as the
 * scheduler's `heal` callback, so a self-heal shares the exact same probe/cache/DB-write behavior a
 * human clicking "Verify" already gets — nothing new is added to WHAT a heal does, only WHEN it can
 * additionally fire. See `account-label-heal-scheduler.ts`'s own header for the fire-and-forget/
 * in-flight-dedupe contract that keeps this off the hot path and safe under `62ca21c7`'s guard.
 *
 * See `CredentialsDeps` in `server/routes/route-deps/credentials-deps.ts` for why each route picks only its own repo.
 *
 * Same registration order as before: list, create, update, verify, delete.
 */
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
