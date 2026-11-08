import { createHostMailer } from "@jini-ai/agent-plugins/lifecycle/mail";
import { createMailSenderIdentityResolver } from "#src/platform/mail/sender-identity";
import { createMailPurposeGateProbe } from "#src/platform/mail/purpose-gate-probe";
import { createMailTestSendLimiter, type MailTestSendDeps } from "#src/features/mail-status/test-send";
import { SettingsRevisionConflictError, type AuthorizeFn, type SettingsRepoPort, type SetValueRequired } from "@jini-ai/core/settings";
import type { MailCapturePort, MailSendLedgerPort, MailSuppressionRepoPort } from "@jini-ai/platform/mail";
import { createTovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import { MAIL_ADAPTERS_FILENAME, parseMailAdaptersFile } from "#src/features/agent-plugins/mail-adapter-registry";
import { setAgentPluginEnabled } from "#src/features/agent-plugins/set-enabled";

import { readMailProviderSetting, readMailProviderSelection, readMailTestMode, writeMailProviderSetting } from "#src/features/settings/mail-provider";
import { createMailPolicyWrapper } from "../boot/mail-delivery-policy.js";
import { createResolvedMailer, type ResolvedMailer, type ResolveMailerDeps } from "../boot/resolve-mailer.js";
import { loadMailProviderCatalog } from "../boot/mail-provider-catalog.js";

/**
 * @file Composition glue for the site mailer: the explicit `core.mail.provider` setting port, the
 * delivery policy (ledger, suppression, capture, test mode) around each provider, and the sender
 * address the status warnings read. Kept out of `deps.ts` so that file only names the parts.
 */

/** Boot-time system writes (the first-boot migration) are not a principal's request. */
const allowSystemMailMigration: AuthorizeFn = async () => ({ allowed: true, reason: "system_migration" });

export interface SiteMailerRequired {
  resolve: Omit<ResolveMailerDeps, "providerSetting" | "wrapProviderMailer" | "readSenderEmail">;
  /** `authorize` checks a principal's own provider change (`mail_set_provider`) at the settings chokepoint. */
  settings: { repo: SettingsRepoPort; deps: Omit<SetValueRequired["deps"], "authorize" | "repo">; systemPrincipalId: string; authorize: AuthorizeFn };
  /** Resolves once `core.mail.*` definitions are registered; reads wait for it. */
  settingsReady: Promise<unknown>;
  delivery: { ledger: MailSendLedgerPort; suppression: MailSuppressionRepoPort; capture?: MailCapturePort; observe?: import("../boot/mail-delivery-policy.js").MailPolicyWrapperDeps["observe"] };
  readSenderEmail: () => Promise<string | undefined>;
  readConfiguredSender?: import("#src/platform/mail/sender-identity").CreateMailSenderIdentityResolverOptional["readConfiguredSender"];
}

export interface SiteMailer extends ResolvedMailer {
  setAgentPluginEnabled: typeof setAgentPluginEnabled;
  operations: Pick<MailTestSendDeps, "mailTestMode" | "mailTestProvider" | "mailTestRequests" | "mailTestSendLimiter" | "mailSenderIdentity"> & {
    mailLaneReady: ResolvedMailer["laneReady"];
    mailSenderDomainVerification: ResolvedMailer["senderDomainVerification"];
    mailPurposeGate: import("#src/platform/mail/purpose-gate-probe").MailPurposeGateProbe;
  };
  /** Sets both lanes to `id` as `principalId`, then drops cached mailers and status; the caller already
   *  checked `checkProvider` and got approval. A failed write throws and changes nothing. */
  selectProvider: (required: { id: string; principalId: string; expectedRevisionSeq?: number }) => Promise<void>;
  /** Snapshot read waits for initialization and returns the exact workspace setting revision. */
  readProviderSelection: () => ReturnType<typeof readMailProviderSelection>;
}

/** Recover provider ownership after a restart without executing a disabled plugin's code.
 * Trust and containment come from the existing lifecycle; builtin provider ids stay builtin.
 * @complexity O(p + a) installed packages and declared adapters, on a missing-provider retry only. */
async function installedMailProviderIds(input: Parameters<typeof setAgentPluginEnabled>[0]): Promise<readonly string[]> {
  const lifecycle = createTovuAgentPluginLifecycle({ layout: input.agentPluginLayout });
  const verdicts = await lifecycle.findTrustedPluginPackages({ workspaceId: input.workspaceId,
    filename: MAIL_ADAPTERS_FILENAME, contribution: 'mail adapters', requireActive: false });
  const verdict = verdicts.find(item => 'trusted' in item && item.trusted.pluginId === input.pluginId);
  if (!verdict || !('trusted' in verdict)) return [];
  const parsed = parseMailAdaptersFile(await lifecycle.readTrustedPluginFile(verdict.trusted, MAIL_ADAPTERS_FILENAME));
  return parsed.ok ? parsed.descriptors.map(adapter => adapter.id).filter(id => id !== 'smtp' && id !== 'console') : [];
}

/**
 * Builds the lane-routed, policy-wrapped site mailer.
 * @complexity O(1); see `resolve-mailer.ts` for per-send costs.
 */
export function createSiteMailer(required: SiteMailerRequired, options: { durableOutboxReady?: (capabilityName: string) => boolean; setAgentPluginEnabled?: typeof setAgentPluginEnabled } = {}): SiteMailer {
  const { resolve, settings, delivery } = required;
  const workspaceId = resolve.workspaceId;
  const ready = async () => { await required.settingsReady; };
  const resolved = createResolvedMailer({
    ...resolve,
    providerSetting: {
      read: async () => { await ready(); return readMailProviderSetting({ settingsRepo: settings.repo, workspaceId }); },
      write: async (value) => {
        await ready();
        await writeMailProviderSetting({ deps: { ...settings.deps, repo: settings.repo, authorize: allowSystemMailMigration }, workspaceId, callerPrincipalId: settings.systemPrincipalId, value });
      },
    },
    wrapProviderMailer: createMailPolicyWrapper(
      { ledger: delivery.ledger, suppression: delivery.suppression, observe: delivery.observe, readTestMode: async () => { await ready(); return readMailTestMode({ settingsRepo: settings.repo, workspaceId }); } },
      delivery.capture ? { capture: delivery.capture } : {},
    ),
    readSenderEmail: required.readSenderEmail,
  });
  const readProviderSelection: SiteMailer["readProviderSelection"] = async () => {
    await ready();
    await resolved.ready;
    return readMailProviderSelection({ settingsRepo: settings.repo, workspaceId });
  };
  const operations: SiteMailer["operations"] = {
    mailTestMode: async () => { await ready(); return readMailTestMode({ settingsRepo: settings.repo, workspaceId }); },
    mailTestProvider: async () => { await ready(); return (await readMailProviderSetting({ settingsRepo: settings.repo, workspaceId }))?.transactional ?? null; },
    mailTestRequests: new Map(),
    // One bucket per site, so the Email page's button and the assistant's tool share it.
    mailTestSendLimiter: createMailTestSendLimiter(),
    mailLaneReady: resolved.laneReady, mailSenderDomainVerification: resolved.senderDomainVerification,
    mailSenderIdentity: createMailSenderIdentityResolver({ mailer: resolved.mailer }, {
      readConfiguredSender: required.readConfiguredSender ?? (async () => ({ email: await required.readSenderEmail() })), settle: resolved.settle,
    }),
    mailPurposeGate: createMailPurposeGateProbe({ mode: resolve.mode, durableOutboxReady: options.durableOutboxReady ?? (() => false) }),
  };
  return { ...createHostMailer({ resolved, operations, selection: {
    ready, loadCatalog: () => loadMailProviderCatalog(resolve),
    readSelection: () => readMailProviderSelection({ settingsRepo: settings.repo, workspaceId }),
    writeSelection: ({ value, principalId, expectedRevisionSeq }) => writeMailProviderSetting({ deps: { ...settings.deps, repo: settings.repo, authorize: settings.authorize }, workspaceId, callerPrincipalId: principalId, value }, { expectedRevisionSeq }),
    installedProviderIds: installedMailProviderIds, toggle: options.setAgentPluginEnabled ?? setAgentPluginEnabled,
    isRevisionConflict: (error) => error instanceof SettingsRevisionConflictError,
  } }), readProviderSelection };
}
