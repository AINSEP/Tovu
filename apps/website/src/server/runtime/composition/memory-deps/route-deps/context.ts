import type { composeMemoryTrash } from "../slices/memory-trash.js";
import type { composeTaxonomyTrashRepos } from "../slices/taxonomy-trash-repos.js";
import type { composeMemoryRepos } from "../slices/repos.js";
import type { composeNavFormContentRepos } from "../slices/nav-form-content-repos.js";
import type { composeMemberSecrets } from "../slices/member-secrets.js";
import type { composeIdentitySettings } from "../slices/identity-settings.js";
import type { composeMemorySeo } from "../slices/seo-sitemap.js";
import type { composeMemoryAgentPlugins } from "../slices/agent-plugins.js";
import type { composeOutboundHttp } from "../../outbound-http.js";
import type { composeSiteTitleSettings } from "../slices/site-title-settings.js";
import type { composePublishContentStores } from "../slices/publish-content-stores.js";
import type { composeOriginNewsletter } from "../slices/origin-newsletter.js";
import type { composeMemoryComments } from "../slices/comments.js";
import type { createInMemoryToolAttemptAuditSink } from "@jini-ai/diagnostics/tool-audit/repo.memory";
import type { InMemoryWorkspaceRepo } from "#src/features/workspace/index";
import type { InMemoryPostRepo } from "#src/features/post/index";
import type { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import type { InMemorySettingsRepo } from "#src/features/settings/index";
import type { followProviderActivations } from "#src/features/agent-plugins/provider-plugin-link";
import type { composePluginRuntime } from "../../plugin-runtime.js";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import type { createSiteTimeZonePort } from "#src/features/settings/site-timezone";
import type { PublishContentSeedHashFn } from "#src/features/publish-content/seed-hash";
import type { discoverAllBuiltInThemes } from "#src/features/theme/index";
import type { memoryPublishContentApplyPort } from "../slices/publish-apply.js";
import type { createInMemoryChatHistory } from "../../../../../assistant/index.js";
import type { createSiteConsentReadiness } from "#src/features/consent/settings";
import type { createPluginExportRuntime } from "#src/features/agent-plugins/exports/runtime";
import type { composeAgentPluginMcp } from "../../agent-plugin-service-ports.js";
import type { NewsletterRouteDeps } from "../../../../inbound/admin-http/routes/newsletter/deps.js";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { CreateRouteDepsOptions } from "../create-route-deps-options.js";
import type { MemoryClock, MemoryIdGen } from "../ports.js";

/** The in-memory root's route deps: the same type `createRouteDeps` returns. */
export type MemoryRouteDeps = NewsletterRouteDeps & ByokToolSurfaceDeps;

/**
 * Everything the `routeDeps` literal reads from the statements that precede it in `createRouteDeps`: the slices' outputs
 * (picked by name, so a slice may grow without widening this contract) and the root's own locals.
 * `routeDeps` is a getter because the fragments only ever read the FINAL object from inside a closure that runs
 * after `createRouteDeps` has returned; `createSiteApp` is built by the root because a fragment must not import `app.ts`.
 */
export type MemoryRootContext = {
  options: CreateRouteDepsOptions;
  routeDeps: () => MemoryRouteDeps;
  createSiteApp: MemoryRouteDeps["createSiteApp"];
  agentPluginMcp: ReturnType<typeof composeAgentPluginMcp>;
  clock: MemoryClock;
  derivedPublicOrigin: string;
  idGen: MemoryIdGen;
  inMemoryChatHistory: ReturnType<typeof createInMemoryChatHistory>;
  pluginActivationRepo: ReturnType<typeof followProviderActivations>;
  pluginExports: ReturnType<typeof createPluginExportRuntime>;
  pluginRuntime: ReturnType<typeof composePluginRuntime>;
  postRepo: InMemoryPostRepo;
  presentationRepo: InMemoryPresentationSettingsRepo;
  publishContentApplyPort: ReturnType<typeof memoryPublishContentApplyPort>;
  publishContentSeedHash: PublishContentSeedHashFn;
  redirectsWriteDeps: RedirectsWriteDeps;
  removeTheme: MemoryRouteDeps["removeTheme"];
  settingsRepo: InMemorySettingsRepo;
  siteConsentReady: ReturnType<typeof createSiteConsentReadiness>;
  siteThemes: ReturnType<typeof discoverAllBuiltInThemes>;
  siteTimeZone: ReturnType<typeof createSiteTimeZonePort>;
  toolAttemptAuditSink: ReturnType<typeof createInMemoryToolAttemptAuditSink>;
  workspaceRepo: InMemoryWorkspaceRepo;
}
  & Pick<ReturnType<typeof composeMemoryTrash>, "formTrashEntry" | "removePlugin" | "trash" | "trashAdapters">
  & Pick<ReturnType<typeof composeTaxonomyTrashRepos>, "entryTermRepo" | "taxonomyRepo" | "taxonomyRevisionRepo" | "termRepo" | "trashRegistry" | "trashRepo">
  & Pick<ReturnType<typeof composeMemoryRepos>, "assetRenditionRepo" | "bus" | "entryRepo" | "formSubmissionRepo" | "mediaRepo" | "outbox" | "redirectHitSink" | "redirectRepo" | "restorePointsRepo" | "sqliteTrashDb" | "taxonomyDb" | "workspaceId">
  & Pick<ReturnType<typeof composeNavFormContentRepos>, "contentTypeIndexProvisioner" | "contentTypeRepo" | "entryRefsRepo" | "formDefinitionRepo" | "menuRepo" | "navLocationBindingRepo" | "widgetBindingRepo">
  & Pick<ReturnType<typeof composeMemberSecrets>, "externalMcpOAuthDevices" | "externalMcpServerRepo" | "memberRepo" | "newsletterHooks" | "newsletterKeyring" | "newsletterSubscriberDirectory" | "siteAssistantCredentialRepo" | "siteAssistantSecretKeyring" | "siteAssistantSecretSealer">
  & Pick<ReturnType<typeof composeIdentitySettings>, "analyticsSettingsReady" | "assistantSettingsReady" | "commentsSettingsReady" | "executionSettingsReady" | "identity" | "seoReady" | "settingsPrincipals" | "settingsReady" | "settingsUiTabsReady">
  & Pick<ReturnType<typeof composeMemorySeo>, "seoDeps" | "sitemapService" | "transformDefinitionRepo">
  & Pick<ReturnType<typeof composeMemoryAgentPlugins>, "agentPluginLayout" | "agentPluginLifecycle" | "customCredentialSetRepo" | "federatedMcpPresetRegistry" | "siteBinding" | "skillLayout">
  & Pick<ReturnType<typeof composeOutboundHttp>, "externalMcpOAuthHttpPorts" | "guardedOutboundHttpClient">
  & Pick<ReturnType<typeof composeSiteTitleSettings>, "siteTitlePreservationStore" | "siteTitleReady">
  & Pick<ReturnType<typeof composePublishContentStores>, "assetBlobRepo" | "blobStore" | "changeSets" | "fileBlobIndex" | "mediaContentTypeStore" | "publishContentBaselineRepo" | "publishContentBundleRepo" | "publishContentPeerRepo" | "publishContentRunRepo">
  & Pick<ReturnType<typeof composeOriginNewsletter>, "newsletterListRepoInMemory" | "originRegistry">
  & Pick<ReturnType<typeof composeMemoryComments>, "commentsCapability" | "commentsModule">;
