import { InMemoryAdminExecutionCredentialRepo, InMemoryExternalMcpToolApprovalRepo } from "../../../../../assistant/index.js";
import { InMemoryMediaProviderCredentialRepo } from "#src/features/media/provider-credential-store.memory";
import { bundledAgentPluginsDir, builtInThemesDir, resolveSiteStoragePaths, defaultContentDbPath, mediaUploadsDir } from "../../site-paths.js";
import { composeAgentPluginPreferences, composePluginProviderFaces } from "../../agent-plugin-service-ports.js";
import { getEffective, set } from "#src/features/settings/index";
import { seededWorkspace } from "../../../configuration/seed.js";
import { notifyExternalMcpRosterChanged } from "../../../../../assistant/external-mcp-roster-change.js";
import { readBuiltInExternalMcpServerIds } from "@jini-ai/mcp/external/built-in-connections";
import { createExternalMcpOAuthService } from "../../../../../features/external-mcp/external-mcp-oauth.js";
import { createApplyConnectDefaults } from "#src/features/agent-plugins/apply-connect-defaults";
import { composeAgentPluginConnections } from "../../agent-plugin-connections.js";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { createLazyProxy } from "../lazy-proxy.js";
import { createSiteConsentStore } from '#src/features/consent/revisions.repo';
import { contentKernel } from '#src/platform/db/content-kernel';
import { registerMenuReverters } from "#src/features/navigation/index";
import { createPostRevertRegistry } from "#src/features/post/index";
import { bindForgetRemovedEntity } from "@jini-ai/cms/trash";
import { POST_ENTITY_TYPE } from "#src/features/trash/index";
import { createSite } from "../../site-dir.js";
import { describeSiteBinding } from "#src/platform/site-dir/index";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import { createNoopObservabilityPort } from "@jini-ai/core/contracts/observability";
import { createLocalAnalyticsSink } from "@jini-ai/analytics/site/jini-adapters";
import { createSettingsAnalyticsConfig } from "#src/features/analytics/config.settings";
import type { MemoryRootContext, MemoryRouteDeps } from "./context.js";

/** Site-assistant credentials and the external MCP repos, preferences and provider faces. */
export function memoryAssistantCredentialDeps(required: MemoryRootContext, _optional = {}) {
  const {
    agentPluginLayout,
    agentPluginMcp,
    clock,
    externalMcpServerRepo,
    idGen,
    identity,
    routeDeps,
    settingsPrincipals,
    settingsRepo,
    siteAssistantCredentialRepo,
    siteAssistantSecretKeyring,
    siteAssistantSecretSealer,
  } = required;
  return {
    siteAssistantCredentialRepo,
    siteAssistantSecretSealer,
    siteAssistantSecretKeyring,
    adminExecutionCredentialRepo: new InMemoryAdminExecutionCredentialRepo(),
    mediaProviderCredentialRepo: new InMemoryMediaProviderCredentialRepo(),
    externalMcpServerRepo,
    bundledSourceRoot: bundledAgentPluginsDir(),
    mcp: agentPluginMcp,
    preferences: composeAgentPluginPreferences({ settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, read: getEffective, write: (required, optional) => routeDeps().set(required, optional) }),
    providerFaces: composePluginProviderFaces({ workspaceRoot: () => agentPluginLayout.forWorkspace({ workspaceId: seededWorkspace.id }).root }),
    notifyRosterChanged: notifyExternalMcpRosterChanged,
    builtInExternalMcpServerIds: readBuiltInExternalMcpServerIds({ env: process.env }),
    externalMcpToolApprovalRepo: new InMemoryExternalMcpToolApprovalRepo(),
  } satisfies Partial<MemoryRouteDeps>;
}

/** The external MCP OAuth service, derived origins and the agent-plugin connection seams. */
export function memoryMcpOAuthDeps(required: MemoryRootContext, _optional = {}) {
  const {
    agentPluginLayout,
    agentPluginLifecycle,
    agentPluginMcp,
    clock,
    customCredentialSetRepo,
    derivedPublicOrigin,
    externalMcpOAuthDevices,
    externalMcpOAuthHttpPorts,
    externalMcpServerRepo,
    formDefinitionRepo,
    guardedOutboundHttpClient,
    idGen,
    identity,
    routeDeps,
    settingsPrincipals,
    settingsRepo,
    siteAssistantSecretKeyring,
    siteAssistantSecretSealer,
  } = required;
  return {
    /**
     * ADR-058 sealing again, one more consumer: the OAuth subsystem for `authMode: "oauth"`
     * external MCP connections. Built HERE rather than inside `modules/external-mcp.ts` because its
     * device-authorization store must be shared by connect and poll. Redirect state is sealed with
     * this root's site key, also used by the public callback. A composition root owns both lifetimes.
     * See
     * `routes/types.ts`'s `externalMcpOAuth` doc for why the field is optional at all.
     */
    externalMcpOAuth: createExternalMcpOAuthService({
      httpPorts: externalMcpOAuthHttpPorts,
      workspaceId: seededWorkspace.id,
      repo: externalMcpServerRepo,
      sealer: siteAssistantSecretSealer,
      keyring: siteAssistantSecretKeyring,
      clock,
      devices: externalMcpOAuthDevices,
      onConnected: createApplyConnectDefaults({ agentPluginLayout, workspaceId: seededWorkspace.id, repo: externalMcpServerRepo, applyAccess: input => routeDeps().mcp.applyAccess(input), clock, notifyRosterChanged: notifyExternalMcpRosterChanged, projections: agentPluginMcp.projections, classifyError: agentPluginMcp.classifyError }),
    }),
    externalMcpOAuthDevices,
    derivedPublicOrigin,
    passkeyOrigin: process.env.TOVU_PUBLIC_URL,
    // Same three plugin seams as `deps.ts`, over an in-memory vault. Handler modules load on the
    // first surface bootstrap rather than at this hermetic root's construction (no boot disk read).
    ...composeAgentPluginConnections({
      workspaceId: seededWorkspace.id, loadContributions: agentPluginLifecycle.loadPluginContributions, vaultRepo: new InMemoryVaultRepo({}),
      keyring: siteAssistantSecretKeyring, sealer: siteAssistantSecretSealer, customCredentialRepo: customCredentialSetRepo, clock, http: guardedOutboundHttpClient,
      env: process.env, derivedPublicOrigin,
    }, {
      deliveryBindings: { settings: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals }, forms: formDefinitionRepo, newBindingId: () => idGen.newId() },
    }),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Readiness promises, consent store, change sets and the revert registry. */
export function memoryReadinessRevertDeps(required: MemoryRootContext, _optional = {}) {
  const {
    analyticsSettingsReady,
    changeSets,
    clock,
    executionSettingsReady,
    idGen,
    menuRepo,
    outbox,
    postRepo,
    settingsUiTabsReady,
    siteConsentReady,
    siteTimeZone,
    siteTitlePreservationStore,
    siteTitleReady,
    taxonomyDb,
    trashRepo,
    workspaceId,
  } = required;
  return {
    executionSettingsReady,
    settingsUiTabsReady,
    analyticsSettingsReady,
    siteTitleReady,
    siteConsentReady,
    consentStore: createLazyProxy({ factory: () => createSiteConsentStore({ kernel: contentKernel({ store: taxonomyDb }), workspaceId }) }),
    siteTitlePreservationStore,
    // No site directory: the site title's no-owner-title value falls back to `workspaces.name` (SPEC-050 EC-03).
    siteDisplayName: { read: () => undefined },
    siteTimeZone,
    // BR-04 (2026-07-16): the repo forwards insert()'s optional event to this SAME outbox
    // instance, matching what the old separate executeCommand()-level enqueue() call did.
    // Hoisted above (not constructed inline) — see the comment there for why.
    changeSets,
    // Pre-loaded with the post-domain reverters, closed over the SAME postRepo/clock/outbox
    // instances this root threads through everything else (ADR-018 C-005/C-006; 2026-08-13
    // features-post-deep-import-trace.md Job 2 — see `features/post/reverters.ts`'s header).
    // R4 (`plan-publish-repoint-menus-2026-09-24.md` §2.4/§3) wraps the SAME registry with the
    // menu-domain `menu/update` reverter, closed over this root's own menuRepo, so a repoint change
    // set is revertible from History exactly like any other publish write.
    revertRegistry: registerMenuReverters(
      { registry: createPostRevertRegistry({
        postRepo,
        clock,
        outbox,
        // `post/delete`'s reverter clears the trash marker; without this the index row it was written
        // with outlives it and the Trash lists a post that is live again.
        forgetRemoved: bindForgetRemovedEntity({
          repo: trashRepo,
          entityType: POST_ENTITY_TYPE
        }),
      }),
      deps: { menuRepo, clock, idGen, outbox } }
    ),
  } satisfies Partial<MemoryRouteDeps>;
}

/** Themes, site binding and layouts, outbox, bus, observability, clock and the identity spread. */
export function memorySiteBindingDeps(required: MemoryRootContext, _optional = {}) {
  const {
    agentPluginLayout,
    agentPluginLifecycle,
    bus,
    clock,
    federatedMcpPresetRegistry,
    idGen,
    identity,
    outbox,
    settingsPrincipals,
    settingsRepo,
    siteBinding,
    siteThemes,
    skillLayout,
  } = required;
  return {
    themes: siteThemes,
    themesDir: builtInThemesDir(),
    siteBinding,
    createSite,
    federatedMcpPresetRegistry,
    agentPluginLayout,
    agentPluginLifecycle,
    skillLayout,
    // Hermetic: no `content.db` is opened here, so this reports the path a real boot of the same
    // env/cwd site WOULD open (`defaultContentDbPath()`) — exactly what the deployment overview and
    // the chat-attachment read-back route resolved per request before this field existed, and what
    // an in-memory agent daemon (`TOVU_DB=memory`, which composes from THIS root) writes uploads under.
    siteStoragePaths: resolveSiteStoragePaths({
      contentDbPath: defaultContentDbPath(),
      siteDir: describeSiteBinding().dir,
      uploadsDir: mediaUploadsDir({ siteDir: describeSiteBinding().dir }),
    }),
    outbox,
    bus,
    // Always the no-op adapter here, never provider-plugin selection (`provider-plugins.ts`) — this
    // root is documented "hermetic, no filesystem" (file header above), and nothing configured on a
    // developer's machine must ever make a test try to reach a real collector. See `routes/types.ts`'s
    // `ObservabilityDeps` doc for the full rule-of-two.
    observability: createNoopObservabilityPort({}),
    tracker: createNoopTracker({}),
    clock,
    idGen,
    analyticsSink: createLocalAnalyticsSink({}),
    analyticsConfig: createSettingsAnalyticsConfig({ settingsRepo }),
    ...identity,
    principalRepo: settingsPrincipals,
  } satisfies Partial<MemoryRouteDeps>;
}
