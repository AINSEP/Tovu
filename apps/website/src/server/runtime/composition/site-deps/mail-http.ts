import type { composeProviderConfigSource } from "./provider-config.js";
import type { composeSiteKeysMembers } from "./site-keys-members.js";
import type { providerPluginBoot } from "./provider-identity.js";
import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { composeIdentitySettings } from "./identity-settings.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeEventsOrigin } from "./events-origin.js";
import type { CreateSiteRouteDepsOverrides } from "./overrides.js";
import { CUSTOM_CREDENTIALS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { MEDIA_IMPORT_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID } from "../../configuration/seed.js";
import { SINGLE_HOP_HTTPS_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { SITE_BACKUP_EGRESS_POLICY } from "#src/platform/http/egress-policies";
import { createDefaultHttpClient } from "#src/platform/http/client";
import { createMailAttemptObserver } from "#src/features/mail/attempts.repo";
import { createMailCaptureRepo } from "#src/features/mail/index";
import { createMailSendLedgerRepo } from "#src/features/mail/index";
import { createMailSuppressionRepo } from "#src/features/mail/index";
import { createPluginAccountTokenResolver } from "../../boot/mail-plugin-account-token.js";
import { createSiteMailer } from "../site-mailer.js";
import { createTestOriginHttpClientFactory } from "#src/platform/http/test-origin-allowlist";
import { formsMailOutboxReady } from "#src/features/forms/mail-outbox-readiness";
import { loadMailAdapterRegistry } from "#src/features/agent-plugins/mail-adapter-registry";
import { notifyExternalMcpRosterChanged } from "../../../../assistant/external-mcp-roster-change.js";
import { readMailSenderSetting } from "#src/features/settings/index";
import { resolvePublishContentPeerHttpClient } from "../publish-content-http.js";
import { setAgentPluginEnabled } from "#src/features/agent-plugins/set-enabled";

interface ComposeMailHttpRequired {
  workspaceId: string;
  customCredentialSetRepo: ReturnType<typeof composeProviderConfigSource>["customCredentialSetRepo"];
  siteAssistantSecretSealer: ReturnType<typeof composeSiteKeysMembers>["siteAssistantSecretSealer"];
  observability: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>["observability"];
  agentPluginLifecycle: ReturnType<typeof composeAgentPluginBootstrap>["agentPluginLifecycle"];
  externalMcpServerRepo: ReturnType<typeof composeAssistantCredentials>["externalMcpServerRepo"];
  runtimeMode: ReturnType<typeof composeSiteKeysMembers>["runtimeMode"];
  settingsRepo: ReturnType<typeof composeIdentitySettings>["settingsRepo"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  idGen: ReturnType<typeof composeStoreBasics>["idGen"];
  settingsPrincipals: ReturnType<typeof composeIdentitySettings>["settingsPrincipals"];
  identity: ReturnType<typeof composeIdentitySettings>["identity"];
  siteTitleReady: ReturnType<typeof composeIdentitySettings>["siteTitleReady"];
  kernel: SiteStore["content"];
  originRegistry: ReturnType<typeof composeEventsOrigin>["originRegistry"];
  overrides: Partial<CreateSiteRouteDepsOverrides>;
}

export function composeMailHttp(required: ComposeMailHttpRequired, _optional = {}) {
  const { workspaceId, customCredentialSetRepo, siteAssistantSecretSealer, observability, agentPluginLifecycle, externalMcpServerRepo, runtimeMode, settingsRepo, clock, idGen, settingsPrincipals, identity, siteTitleReady, kernel, originRegistry, overrides } = required;
  // `runtimeMode` itself is now resolved further up (see `newsletterKeyring`'s own hoisting
  // comment above) — kept read here via the same local rather than re-hoisting every downstream
  // use, since everything below this point already assumed a local named `runtimeMode` exists.
  // Outbound mail-API calls (plugin-provided hosted mail adapters) use the shared `SINGLE_HOP_HTTPS_EGRESS_POLICY` — see
  // `platform/http/egress-policies.ts`'s own header for why this used to be a hand-copied literal
  // (no default policy exists elsewhere in this codebase to reuse otherwise; checked: no production
  // `HttpClientPort` consumer was wired into either composition root before this).
  // Email provider contract v1 (2026-10-21): lanes read `core.mail.provider` (first boot writes the
  // provider the old implicit chain picked), and every provider sits behind Jini's delivery policy
  // over the mail ledgers (`features/mail`). See `site-mailer.ts` and `resolve-mailer.ts`.
  const mailResolveDeps = {
    workspaceId,
    customCredentialRepo: customCredentialSetRepo,
    sealer: siteAssistantSecretSealer,
    httpClient: createDefaultHttpClient({ policy: SINGLE_HOP_HTTPS_EGRESS_POLICY }, { observability }),
    loadMailAdapters: () => loadMailAdapterRegistry({ workspaceId }, { loadContributions: agentPluginLifecycle.loadPluginContributions }),
    resolvePluginAccountToken: createPluginAccountTokenResolver({ workspaceId, repo: externalMcpServerRepo, sealer: siteAssistantSecretSealer }),
    mode: runtimeMode,
  };
  const resolvedMailer = createSiteMailer({
    resolve: mailResolveDeps,
    settings: { repo: settingsRepo, deps: { clock, ids: idGen, principals: settingsPrincipals }, systemPrincipalId: SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID, authorize: identity.authorize },
    settingsReady: siteTitleReady,
    delivery: { observe: createMailAttemptObserver({ db: kernel }), ledger: createMailSendLedgerRepo({ db: kernel }), suppression: createMailSuppressionRepo({ db: kernel }), capture: createMailCaptureRepo({ db: kernel, origin: originRegistry }) },
    readSenderEmail: async () => (await readMailSenderSetting({ settingsRepo, workspaceId })).email,
    readConfiguredSender: (required) => readMailSenderSetting({ settingsRepo, workspaceId: required.workspaceId }),
  }, { durableOutboxReady: required => mailDurableOutboxReady(required),
    setAgentPluginEnabled: input => setAgentPluginEnabled(input, { lifecycle: agentPluginLifecycle, notifyRosterChanged: notifyExternalMcpRosterChanged }) });
  // Email page phase 3: the provider's own sender-domain verdict and the test-mode read, each fresh.
  // SPEC-022's durable-outbox readiness, named once: the live mailer's purpose gate below and the
  // Email page's use readiness probe (`platform/mail/purpose-gate-probe.ts`) read the same function.
  const mailDurableOutboxReady = formsMailOutboxReady;
  // `features/custom-credentials`'s two agent tools (`custom_credential_verify`/
  // `custom_credential_make_request`) need a guarded `HttpClientPort` of their own — see
  // `routes/types.ts`'s `customCredentialsHttpClient` doc for why this is a genuinely separate
  // CLIENT instance from the mailer's above. Built from its own `CUSTOM_CREDENTIALS_EGRESS_POLICY`
  // (2026-09-10) rather than the mailer's `SINGLE_HOP_HTTPS_EGRESS_POLICY` — that policy's own doc
  // has the live incident (GitHub's Actions job-logs endpoint 302s to a signed Azure Blob URL) that
  // made a zero-redirect policy the wrong fit for this tool specifically.
  const customCredentialsHttpClient = createDefaultHttpClient({ policy: CUSTOM_CREDENTIALS_EGRESS_POLICY }, { observability });
  // `site_backup_push`'s large uploads: see `SITE_BACKUP_EGRESS_POLICY`'s own doc.
  const siteBackupHttpClient = createDefaultHttpClient({ policy: SITE_BACKUP_EGRESS_POLICY }, { observability });

  const { outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient } = composeContentHttpClients({ overrides, observability });

  return { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient };
}

function composeContentHttpClients({ overrides, observability }: Pick<ComposeMailHttpRequired, "overrides" | "observability">, _options = {}) {
  // `features/media-import`'s `media_import_from_url` needs its own guarded `HttpClientPort` — a
  // THIRD instance, and the only one built from a policy other than SINGLE_HOP_HTTPS. See
  // `routes/types.ts`'s `mediaImportHttpClient` doc and `MEDIA_IMPORT_EGRESS_POLICY`'s own doc for
  // why fetching an image file cannot use the fixed-method, no-redirect, 1 MB policy above.
  const outboundTestOrigins = overrides.outboundTestOrigins ?? [];
  const mediaImportHttpClient = createTestOriginHttpClientFactory({ allowedOrigins: outboundTestOrigins })({ policy: MEDIA_IMPORT_EGRESS_POLICY }, { observability });

  // `features/publish-content`'s outbound push/pull leg needs its own guarded `HttpClientPort` — a
  // FOURTH instance. It is the only one whose policy is built rather than imported as a literal,
  // because it is the only one with an operator-configurable `devHostAllowlist`: a legitimate
  // publish peer may sit on a private network (Railway/Render internal DNS, an AWS VPC, two Tovus
  // behind one VPS firewall), and `TOVU_PUBLISH_CONTENT_DEV_HOSTS` is the plain env var that says
  // so on every platform. Unset means "every peer must resolve to a public address", the safe
  // default. See `createPublishContentPeerEgressPolicy`'s own doc.
  const publishContentPeerHttpClient = resolvePublishContentPeerHttpClient({}, {
    ...(overrides.publishContentPeerHttpClient ? { client: overrides.publishContentPeerHttpClient } : {}),
    createClient: ({ policy }) => createDefaultHttpClient({ policy }, { observability }),
  });

  return { outboundTestOrigins, mediaImportHttpClient, publishContentPeerHttpClient };
}
