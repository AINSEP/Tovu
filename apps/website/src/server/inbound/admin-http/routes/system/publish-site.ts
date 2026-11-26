import { staticPublishPorts } from '#src/features/deployments/static-publish/adapter';
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { deploymentRefusal } from '#src/contracts/core/consent-refusal';
import { listPublishContentPeers } from "@jini-ai/cms/publish/content/peer-registry";
import { getPublishTrustContext, publishTrustAuthorizeFor } from "#src/server/inbound/admin-http/publish-trust-auth";
import type { Express } from "express";
import { ToolInputError } from "@jini-ai/core";

import { inspectStaticPublish } from "@jini-ai/devops/deploy/site/static-publish/inspection";
import { composePublishCredentialSource } from "#src/features/deployments/static-publish/credentials";
import { getPublishRunSnapshot, startPublishRun } from "#src/features/deployments/static-publish/publish-run";
import { listPublishDestinations } from "@jini-ai/devops/deploy/site/static-publish/publish-history";
import { missingRequiredFieldMessage, planStaticPublish, readStaticPublishConfig, unknownTargetMessage } from "@jini-ai/devops/deploy/site/static-publish/adapter";
import { type StaticPublishConfig, type PublishCredentialSource } from "@jini-ai/devops/deploy/site/static-publish/types";
import type {
  DeployTargetCredentialSpec,
  DeployTargetRegistry,
  LoadedDeployTarget,
} from "@jini-ai/devops/deploy/site/deploy-targets/types";
import { createPublishTriggerRoute, type PublishTriggerDeps } from "@jini-ai/cms/admin-http/routes/system/publish-site/trigger";
import { createPublishDestinationsRoute, type PublishDestinationsDeps } from "@jini-ai/cms/admin-http/routes/system/publish-site/destinations";
import { mountAdminJsonRoute } from "../../admin-json-route-ports.js";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";


/**
 * @file Admin Deployment panel → publish-to-a-static-host backend.
 *
 * Registers TWO routes, deliberately mirroring `./export-site.ts`'s own trigger+status shape
 * almost exactly (see that file's header for the full reasoning this route inherits): a publish
 * runs a fresh in-process export (see `static-publish/adapter.ts`'s `publishStaticSite`) and then
 * blocks on an external provider's own build/deploy pipeline — a host's build or deployment poll,
 * up to roughly a minute — so `POST .../system/publish` starts the run and
 * returns `202` immediately with a snapshot; `GET .../system/publish` polls the same snapshot. The
 * single process-local mutable slot backing both lives in `static-publish/publish-run.ts` (2026-08-16,
 * Terra audit finding #1 — see that file's header for the full "who shares this slot and why" story),
 * NOT in this file — a plain export's own slot (`export-site.ts`'s `currentRun`, in `export-run.ts`)
 * stays independent (a plain export and a publish are different operations that may legitimately need
 * independent status), but THIS route's own slot is now shared with `deployment_execute_static_publish`
 * (`publish-agent-tools.ts`), which used to call `publishStaticSite` directly with nothing to check at
 * all — the actual gap the finding was about.
 *
 * `system.publish`-gated for BOTH the trigger and the status poll — deliberately NOT split into a
 * `system.publish`/`system.read` pair the way `export-site.ts` splits trigger/status. Reasoning: a
 * completed publish's status snapshot names the exact external `url` this workspace's content is
 * now live at (`StaticPublishOutcome`'s `url` field) and, on a validation failure, can echo back the
 * caller-supplied `owner`/`repo`/`teamId`. Export's status is comparatively inert (counts and local
 * file paths); publish's status is itself operationally sensitive information about a live external
 * resource, so it gets the stricter, single-permission gate.
 *
 * Request body for the trigger: `{ target, projectName: string, credentialId?, ...configFields }` —
 * `target` is any id this workspace's deploy registry knows (`RouteDeps.loadDeployTargets`), and the
 * other fields read are exactly the ones that target's descriptor declares.
 *
 * `credentialId` (2026-09-20, terra review finding 1 — Critical) BINDS the publish to the saved
 * connection the operator chose, instead of letting the server pick whichever row is `is_default`
 * when the POST lands: selecting connection B and clicking Publish while B's promotion was still in
 * flight published the site to A's account. It is OPTIONAL, and deliberately so — the
 * `deployment_execute_static_publish` agent tool has no chosen connection, and a self-hosted install
 * whose credentials come from `GITHUB_TOKEN`/`VERCEL_TOKEN`/... has no connection ids at all. Those
 * callers keep the DEFAULT lookup, explicitly (`static-publish/credentials.ts`'s
 * `createDbPublishCredentialSource`); an id that is supplied is validated against this workspace and
 * this target by that same module, and refuses rather than falling back. Every other field is judged
 * by `static-publish/adapter.ts`'s `planStaticPublish` — the same call `publishStaticSite` makes —
 * so there is exactly one place a config is judged valid or not.
 *
 * A THIRD route, `GET .../system/publish/preview`, was added 2026-08-15 alongside the admin UI's
 * Static Site tab publish card. `deployment_preview_static_publish` (`publish-agent-tools.ts`)
 * already gives the ASSISTANT this exact read — target validity, the computed base path, and
 * whether a credential is configured (a boolean only, never the token) — but that tool is reached
 * over the agent-tool transport, not an HTTP route a browser session can call, and the admin UI has
 * no other way to answer "would this publish work?" before spending a real trigger+run on the
 * question. This route reuses the SAME `planStaticPublish` the tool calls, plus this file's own
 * `credentialSource`, so a preview here and a preview from the assistant can never disagree.
 * `system.read`-gated, matching every other GET in this directory (`export-site.ts`,
 * `deployment-overview.ts`) — it performs zero remote mutations; provider inspections may issue authenticated reads.
 *
 * A FOURTH, `GET .../system/publish-targets` (`system.read`), lists the registry's targets (id,
 * label, config field specs) so the admin UI can render the publish card from descriptors.
 * `GET .../system/publish/destinations` (`system.read`) derives saved destinations from successful
 * history for this site's workspace. It never resolves credentials; only POST executes a publish.
 */
export type AdminPublishSiteDeps = RouteDeps;

// `PublishRunStatus`/`PublishRunSnapshot` used to be declared here, backing a PRIVATE module-scope
// `currentRun` this file alone could see or update. Both now live in `static-publish/publish-run.ts`,
// and this route reads/writes the run through that module's `getPublishRunSnapshot`/`startPublishRun`
// instead of a local variable — see this file's header for why (Terra audit finding #1:
// `deployment_execute_static_publish` had no equivalent slot to check at all).

/** No longer a module-scope constant (2026-08-15): `createEnvPublishCredentialSource` is now bound
 *  to one workspace at construction time (Terra's finding — it used to accept and ignore
 *  `workspaceId`), and `composePublishCredentialSource` layers the encrypted DB-backed source on top
 *  per the install's `PublishExecutionMode`. Both need `deps`, which is only available inside
 *  {@link registerAdminPublishSiteRoutes} — see that function's own first lines for where this is now
 *  built. */

/**
 * Resolves `targetId` in this workspace's registry and reads its descriptor-declared config fields
 * from `raw`. Registry refusals (a module that did not load) are logged, never returned.
 * @returns The target and config, or a refusal naming the unknown target / the non-string field.
 * @complexity One registry load plus O(f) declared fields.
 */
async function readTargetConfig({ deps, targetId, raw, blankAsAbsent }: { deps: AdminPublishSiteDeps; targetId: string; raw: Record<string, unknown>; blankAsAbsent: boolean }, _optional = {}): Promise<{ ok: true; registry: DeployTargetRegistry; target: LoadedDeployTarget; config: StaticPublishConfig } | { ok: false; error: string }> {
  const registry = await deps.loadDeployTargets({ workspaceId: deps.workspaceId });
  for (const refusal of registry.refusals) console.warn(`[publish-site] ${refusal}`);
  const target = registry.get(targetId);
  if (target === undefined) return { ok: false, error: unknownTargetMessage({ registry, targetId }) };
  const read = readStaticPublishConfig({ target, raw, options: { blankAsAbsent } });
  if (!read.ok) return { ok: false, error: read.message };
  return { ok: true, registry, target, config: read.config };
}

/** A target's saved-credential form, as the admin renders it: the vendor's display name, the field
 *  specs (secret fields flagged, never a value), the form's help and token page, and which field is
 *  the token. Never the vendor id. @complexity O(1). */
function publicCredentialSpec(spec: DeployTargetCredentialSpec): {
  vendorLabel?: string;
  help?: string;
  userHelp?: string;
  tokenPageUrl?: string;
  tokenField: string;
  fields: DeployTargetCredentialSpec["fields"];
} {
  return {
    ...(spec.vendorLabel !== undefined ? { vendorLabel: spec.vendorLabel } : {}),
    ...(spec.help !== undefined ? { help: spec.help } : {}),
    ...(spec.userHelp !== undefined ? { userHelp: spec.userHelp } : {}),
    ...(spec.tokenPageUrl !== undefined ? { tokenPageUrl: spec.tokenPageUrl } : {}),
    tokenField: spec.tokenField,
    fields: spec.fields,
  };
}

function credentialChoice({ value }: { value: unknown }, _options = {}): { credentialId?: string } {
  if (value === undefined) return {};
  if (typeof value !== "string" || !value.trim()) throw new ToolInputError({ message: "credentialId must be a non-empty string naming the selected connection. Reload and choose it again." });
  return { credentialId: value };
}

/** The HTTP projection calls the same authenticated inspection used by the chat preview. */
async function httpPublishPreview(required: {
  deps: AdminPublishSiteDeps; credentialSource: PublishCredentialSource; registry: DeployTargetRegistry;
  config: StaticPublishConfig; query: Record<string, unknown>;
}, _options = {}) {
  const { deps, credentialSource, registry, config, query } = required;
  const plan = planStaticPublish({ registry, config });
  const credential = await credentialSource.isConfigured({ workspaceId: deps.workspaceId, target: config.target });
  const inspected = plan.ok && credential.configured ? await inspectStaticPublish({
    deps: { ...{ credentialSource, loadDeployTargets: deps.loadDeployTargets, tracker: deps.tracker, observability: deps.observability, formDestination: deps.formDestination }, ...staticPublishPorts },
    input: { workspaceId: deps.workspaceId, config, projectName: typeof query.projectName === "string" ? query.projectName : "", ...credentialChoice({ value: query.credentialId }) },
  }) : {};
  return { target: config.target, valid: plan.ok, validationError: plan.ok ? null : plan.message,
    basePath: plan.ok ? (plan.basePath ?? null) : null, credentialsConfigured: credential.configured,
    credentialGuidance: credential.configured ? null : credential.reason,
    providerInspection: inspected.inspection };
}

export type PublishSiteContext = { deps: AdminPublishSiteDeps; credentialSource: PublishCredentialSource };
type PublishPrincipal = ReturnType<typeof getAuthedPrincipal>;

function captureBlockedPublish({ deps, principal, reasonClass }: { deps: AdminPublishSiteDeps; principal: Pick<PublishPrincipal, "id">; reasonClass: string }): void {
  void deps.tracker.capture({ name: "site_publish_blocked", userId: principal.id }, { properties: { reasonClass, source: "admin" } });
}

function startAdminPublish({ context, principal, parsed, config }: { context: PublishSiteContext; principal: Pick<PublishPrincipal, "id">; parsed: { projectName: string; credentialId?: unknown }; config: StaticPublishConfig }) {
  const { deps, credentialSource } = context;
  // Deliberately not awaited — see this file's header for why the response returns before the
  // publish finishes. `startPublishRun` itself keeps the shared slot in sync as the publish
  // settles, so a poller can never observe a stale "running" snapshot after the promise has
  // actually settled.
  return startPublishRun({
    deps: { credentialSource, loadDeployTargets: deps.loadDeployTargets, tracker: deps.tracker, observability: deps.observability, formDestination: deps.formDestination, publicPageSecurityHeaders: deps.publicPageSecurityHeaders, pluginExportHosts: deps.pluginExportHosts },
    input: {
      productEvent: { userId: principal.id, source: "admin" },
      workspaceId: deps.workspaceId,
      publishOutputRootDir: deps.publishOutputRootDir,
      idGen: deps.idGen,
      exportSiteBound: deps.exportSiteBound,
      config,
      projectName: parsed.projectName,
      // The connection the operator actually chose in the Static Site tab. Never defaulted here:
      // an absent id means "this caller has no chosen connection", which the credential source
      // answers with its own default lookup — see `parsePublishRequestBody` above.
      ...credentialChoice({ value: parsed.credentialId }),
    },
    clock: deps.clock,
    historyStore: deps.publishHistoryStore,
  });
}

/** The preview query's target + config, or the 400 message for whichever part is missing/invalid. */
async function readPreviewTarget({ deps, query }: { deps: AdminPublishSiteDeps; query: Record<string, unknown> }): Promise<{ ok: true; read: Extract<Awaited<ReturnType<typeof readTargetConfig>>, { ok: true }> } | { ok: false; error: string }> {
  if (typeof query.target !== "string" || query.target.trim() === "") return { ok: false, error: "'target' query param (non-empty string) is required" };
  const read = await readTargetConfig({ deps, targetId: query.target, raw: query, blankAsAbsent: true });
  if (!read.ok) return { ok: false, error: read.error };
  // A required field that is absent is a malformed request (400); a present-but-invalid value is
  // an answer (200, `valid:false`) — the distinction the admin card renders.
  const missing = missingRequiredFieldMessage({ target: read.target, config: read.config });
  return missing !== null ? { ok: false, error: missing } : { ok: true, read };
}

/**
 * The preview read the `publish/preview` spec (`@jini-ai/cms/admin-http/routes/system/publish-site/preview`)
 * is bound to: the same reads `deployment_preview_static_publish`'s handler performs (this file's
 * header) — the registry's plan (config check + base path) and local credential readiness. No export
 * runs. Authenticated provider inspection is separate from `isConfigured()` (2026-08-15 split, see
 * `static-publish/types.ts`'s `PublishCredentialSource` header) — a preview must never resolve a real
 * credential just to read a boolean off it. A `ToolInputError` from the inspection propagates: the spec
 * answers it `400 PROVIDER_INSPECTION_FAILED`.
 * @complexity One registry load plus the credential/inspection reads.
 */
export function publishPreviewFor({ context }: { context: PublishSiteContext }, _optional: Record<string, never> = {}) {
  const { deps, credentialSource } = context;
  return async ({ query }: { query: Readonly<Record<string, unknown>> }): Promise<{ ok: true; value: Awaited<ReturnType<typeof httpPublishPreview>> } | { ok: false; error: string }> => {
    const target = await readPreviewTarget({ deps, query: { ...query } });
    if (!target.ok) return { ok: false, error: target.error };
    return { ok: true, value: await httpPublishPreview({ deps, credentialSource, registry: target.read.registry, config: target.read.config, query: { ...query } }) };
  };
}

/** The registry's targets as the admin card's descriptors: ids, labels and field specs, never module paths. */
function describePublishTargets({ registry }: { registry: DeployTargetRegistry }) {
  return registry.list().map(({ descriptor }) => ({
    id: descriptor.id,
    label: descriptor.label,
    defaultForNewDestination: registry.get(descriptor.id)?.module.defaultForNewDestination === true,
    authenticatedPreview: registry.get(descriptor.id)?.module.preview !== undefined,
    configFields: descriptor.configFields,
    ...(descriptor.projectName !== undefined ? { projectName: descriptor.projectName } : {}),
    ...(descriptor.credential !== undefined ? { credential: publicCredentialSpec(descriptor.credential) } : {}),
    ...(descriptor.i18n !== undefined ? { i18n: descriptor.i18n } : {}),
  }));
}

/** The registry's public target descriptors for this workspace, bound into the `publish-targets` spec;
 *  registry refusals (a module that did not load) are logged, never returned. @complexity O(t). */
export function publishTargetsFor({ deps }: { deps: AdminPublishSiteDeps }, _optional: Record<string, never> = {}) {
  return async () => {
    const registry = await deps.loadDeployTargets({ workspaceId: deps.workspaceId });
    for (const refusal of registry.refusals) console.warn(`[publish-site] ${refusal}`);
    return describePublishTargets({ registry });
  };
}

/** The per-registration publish context: built once per registrar call (a once-per-process composition
 *  step), bound to `deps.workspaceId` — see `static-publish/credentials.ts`'s
 *  `composePublishCredentialSource` header for the DB-first, env-fallback-only-when-self-hosted
 *  composition this performs. @complexity O(1). */
export function createPublishSiteContext({ deps }: { deps: AdminPublishSiteDeps }, _optional: Record<string, never> = {}): PublishSiteContext {
  const credentialSource = composePublishCredentialSource({
    workspaceId: deps.workspaceId,
    executionMode: deps.publishExecutionMode,
    dbDeps: { repo: deps.vendorCredentialSetRepo, sealer: deps.siteAssistantSecretSealer, loadDeployTargets: deps.loadDeployTargets },
  });
  return { deps, credentialSource };
}

export function registerAdminPublishTriggerRoute({ app, context }: { app: Express; context: PublishSiteContext }, _optional: Record<string, never> = {}): void {
  const { deps } = context;
  const triggerDeps: PublishTriggerDeps<{ config: StaticPublishConfig; registry: DeployTargetRegistry }, ReturnType<typeof getPublishRunSnapshot>> = {
    readConfig: async ({ targetId, raw }) => {
      const read = await readTargetConfig({ deps, targetId, raw, blankAsAbsent: false });
      return read.ok ? { ok: true, config: { config: read.config, registry: read.registry } } : read;
    },
    plan: ({ config: read }) => planStaticPublish({ registry: read.registry, config: read.config }),
    hasCustomDomain: ({ config: read }) => Boolean(read.config.customDomain),
    domainConfirmationText: "Review and confirm the exact domain changes through deployment_execute_static_publish in chat. This HTTP request cannot stand in for that human confirmation.",
    deploymentCheck: async ({ principalId }) => (deps.siteConsent
      ? await deps.siteConsent.deploymentCheck({ principalId, permission: 'system.publish' })
      : deploymentRefusal({ problems: [{ code: 'CONSENT_UNAVAILABLE', message: 'Cookie consent readiness is unavailable. No publish was started.' }] })) ?? undefined,
    snapshot: () => getPublishRunSnapshot(),
    start: ({ config: read, projectName, principalId, credentialId }) => startAdminPublish({ context, principal: { id: principalId }, config: read.config,
      parsed: { projectName, ...(credentialId === undefined ? {} : { credentialId }) } }),
    onBlocked: ({ principalId, reasonClass }) => captureBlockedPublish({ deps, principal: { id: principalId }, reasonClass }),
  };
  mountAdminJsonRoute({ app, spec: createPublishTriggerRoute({ deps: triggerDeps }), deps: { ...triggerDeps, workspaceId: deps.workspaceId, authorize: deps.authorize } }, {
    refusalWriter: ({ res, error }) => {
      res.status(error.response.status).json(error.response.body);
      if (error.response.status === 403) captureBlockedPublish({ deps, principal: getAuthedPrincipal(res), reasonClass: "auth" });
    },
    failureWriter: ({ res, error }) => sendAdminFailure({ res, error }, { operation: "routes/system/publish-site", code: "INTERNAL_ERROR" }),
  });
}

export function registerAdminPublishDestinationsRoute({ app, context }: { app: Express; context: PublishSiteContext }, _optional: Record<string, never> = {}): void {
  const { deps } = context;
  const destinationsDeps: PublishDestinationsDeps<DeployTargetRegistry, Awaited<ReturnType<typeof listPublishContentPeers>>[number], Awaited<ReturnType<typeof listPublishDestinations>>> = {
    loadRegistry: () => deps.loadDeployTargets({ workspaceId: deps.workspaceId }),
    mayReadPeers: async (): Promise<boolean> => { throw new Error("bound per request"); },
    listPeers: () => listPublishContentPeers({ deps: { repo: deps.publishContentPeerRepo }, input: { workspaceId: deps.workspaceId } }),
    listDestinations: ({ registry, peers }) => listPublishDestinations({ workspaceId: deps.workspaceId, historyStore: deps.publishHistoryStore, registry, peers }),
  };
  mountAdminJsonRoute({ app, spec: createPublishDestinationsRoute({ deps: destinationsDeps }), deps: { ...destinationsDeps, workspaceId: deps.workspaceId, authorize: deps.authorize } }, {
    requestDeps: ({ res, deps: base }) => ({ ...base, mayReadPeers: async ({ principalId }) => {
      const trust = getPublishTrustContext(res);
      const peerAuthorization = await (trust ? publishTrustAuthorizeFor(trust) : deps.authorize)({ principalId, permission: "publish_content.read", workspaceId: deps.workspaceId });
      return peerAuthorization.allowed;
    } }),
    failureWriter: ({ res, error }) => sendAdminFailure({ res, error }, { operation: "routes/system/publish-site", code: "INTERNAL_ERROR" }),
  });
}
