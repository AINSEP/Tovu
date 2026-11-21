import type { composeIdentitySettings } from "./identity-settings.js";
import type { startBootData } from "./boot-data.js";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeEventsOrigin } from "./events-origin.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { composeTrashStores } from "./trash-stores.js";
import type { composeOutboundConnections } from "./outbound-connections.js";
import type { createConsoleLogger } from "@jini-ai/core/primitives";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import { DefaultMemberAccessResolver } from "#src/features/members/index";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { SqlFormPullLeaseRepo, SqlFormSubmissionReceiptRepo } from "@jini-ai/cms/forms/sql";
import { schemaErasedKernel } from "#src/platform/db/content-kernel";
import { adoptLegacyTrashedWidgets } from "@jini-ai/cms/widgets";
import { bindSiteSearchPorts } from "../modules/site-search.js";
import { buildWidgetsDeps } from "#src/features/widgets/deps";
import { composeFormDelivery } from "#src/server/runtime/composition/form-delivery";
import { composeFormDeliveryDeliverer } from "#src/server/runtime/composition/form-delivery-deliverer";
import { composeFormSubmissions } from "#src/server/runtime/composition/form-submissions";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { createDeployHostKit } from "#src/features/deployments/deploy-targets/host-kit";
import { createSiteSearchRuntime } from "../modules/site-search.js";
import { loadFormDestinationRegistry } from "#src/features/form-destinations/registry";
import { resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";

interface WireFormsAndSearchRequired {
  siteTitleReady: ReturnType<typeof composeIdentitySettings>["siteTitleReady"];
  menuBindingsReady: ReturnType<typeof startBootData>["menuBindingsReady"];
  mediaTransformReady: ReturnType<typeof startBootData>["mediaTransformReady"];
  routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps;
  workspaceId: string;
  kernel: SiteStore["content"];
  outbox: ReturnType<typeof composeEventsOrigin>["outbox"];
  bus: ReturnType<typeof composeEventsOrigin>["bus"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  siteAssistantSecretKeyring: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretKeyring"];
  agentPluginLifecycle: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
  formDeliveryRepo: ReturnType<typeof composeTrashStores>["formDeliveryRepo"];
  agentPluginConnections: ReturnType<typeof composeOutboundConnections>["agentPluginConnections"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  settingsPrincipals: ReturnType<typeof composeIdentitySettings>["settingsPrincipals"];
  agentPluginLayout: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLayout"];
  consoleLogger: ReturnType<typeof createConsoleLogger>;
}

export function wireFormsAndSearch(required: WireFormsAndSearchRequired, _optional = {}) {
  const { siteTitleReady, menuBindingsReady, mediaTransformReady, routeDeps, workspaceId, kernel, outbox, bus, clock, idGen, customCredentialSetRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring, agentPluginLifecycle, settingsRepo, observability, formDeliveryRepo, agentPluginConnections, identity, settingsPrincipals, agentPluginLayout, consoleLogger } = required;

  // Owner decision 6 (2026-09-21): the widgets the retired "delete permanently" rung left behind
  // (payload status `purged`/`trash`) go into the Trash, once — idempotent, so every later boot finds
  // none and logs nothing. Waits for every boot-time SQLite writer above to settle first (the shared-
  // connection transaction hazard `seoReady`'s comment documents); fire-and-forget, logged, never
  // aborts boot.
  const widgetAdoptionReady = Promise.allSettled([siteTitleReady, menuBindingsReady, mediaTransformReady])
    .then(() => adoptLegacyTrashedWidgets({ deps: buildWidgetsDeps(routeDeps), input: { workspaceId } }))
    .then(({ adopted }) => {
      for (const widget of adopted) {
        consoleLogger.info({ message: `[trash] moved legacy deleted widget '${widget.id}' ("${widget.title}") to the Trash` });
      }
    })
    .catch((err) => {
      consoleLogger.error({ message: `adoptLegacyTrashedWidgets failed at boot: ${(err as Error).message}` });
    });

  // Keep the boot-tail contract used by shutdown. Legacy credentials are folded once by 0012;
  // recurring copies would resurrect a credential deleted from the vault.
  routeDeps.legacyPublishCredentialsReady = widgetAdoptionReady;

  // Form destinations: a published static site's receiver (a plugin's form destination, selected by
  // the site's `core.forms` setting) stores submissions; publishing hands it the active forms and a
  // receiver key, and the pull imports what it stored (`form-submissions.ts`).
  const formSubmissions = composeFormSubmissions({
    formDefinitionRepo: routeDeps.formDefinitionRepo, formSubmissionRepo: routeDeps.formSubmissionRepo,
    receipts: new SqlFormSubmissionReceiptRepo({ kernel: schemaErasedKernel({ store: kernel }), table: "form_submission_remote_receipts" }), pullLeases: new SqlFormPullLeaseRepo({ kernel: schemaErasedKernel({ store: kernel }), table: "form_receiver_pulls" }), outbox, bus, clock, idGen,
    credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer, keyring: siteAssistantSecretKeyring, clock, idGen },
    loadFormDestinations: ({ workspaceId }, _optional = {}) => loadFormDestinationRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    settingsRepo,
  }, { observability });
  routeDeps.formDestination = formSubmissions.destination;
  routeDeps.formSubmissionsPull = formSubmissions.pull;
  routeDeps.formSubmissionsAutoPull = formSubmissions.autoPull;

  // Durable delivery of each new submission to the `core.forms/deliveryBindings` destinations: one
  // outbox child job per binding, its credential resolved fresh per attempt (a plugin's OAuth
  // connection first, else a saved custom credential), status read back from the same rows. The
  // integrations module starts the subscriptions once per bus.
  routeDeps.formDeliveryStatus = formDeliveryRepo;
  routeDeps.formDelivery = composeFormDelivery({
    bus, plans: formDeliveryRepo, settingsRepo, idGen, clock,
    formDefinitionRepo: routeDeps.formDefinitionRepo, formSubmissionRepo: routeDeps.formSubmissionRepo,
    deliver: composeFormDeliveryDeliverer({
      apiConnections: agentPluginConnections.apiConnections,
      loadRegistry: ({ workspaceId }) => loadFormDestinationRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
      credentials: { repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer },
      kit: createDeployHostKit({ observability }),
    }),
  });

  // Site search (lots S4-S6): registry, query service and indexer, built once per composition so the
  // public route, the bus subscription (`app.ts`), the serving loop (`serving-app.ts`) and the
  // assistant's search tools share one registry. See `modules/site-search.ts`'s header for the vendor
  // credential labels (`Search — <Provider label>`), index names and the empty built-in slot.
  // Vendor calls go through the shared single-hop public-HTTPS policy, like hosted mail adapters.
  routeDeps.siteSearch = createSiteSearchRuntime(bindSiteSearchPorts({
    workspaceId, kernel, now: clock.nowMs, settingsRepo,
    settingsWriteDeps: { repo: settingsRepo, clock, ids: idGen, authorize: identity.authorize, principals: settingsPrincipals },
    keyring: siteAssistantSecretKeyring,
    resolveCredentialByLabel: (input) => resolveCustomCredentialByLabel({ repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer }, input),
    resolveMemberContext: (input) => new DefaultMemberAccessResolver({
      sessions: routeDeps.memberSessionRepo, subscriptions: routeDeps.memberSubscriptionRepo, tiers: routeDeps.memberTierRepo,
    }).resolveContext(input),
    httpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }),
    loadContributions: agentPluginLifecycle.loadPluginContributions,
    // Fail closed: an unreadable activations file is `undetermined`, never active.
    isPluginActive: async ({ pluginId }) => (await agentPluginLifecycle.resolveAgentPluginActivation({ workspaceRoot: agentPluginLayout.root, pluginId })).verdict === "active",
  }), { storage: kernel, settingsReady: siteTitleReady });
  return { widgetAdoptionReady };
}
