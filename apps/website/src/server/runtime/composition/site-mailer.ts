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
  /** Clear only this plugin's selected lanes through the settings owner; failures propagate.
   * Re-read live ownership too: a conflict retry cannot clear a newly enabled plugin's same id.
   * @complexity O(a + p) active adapters and provider ids, two lane checks and at most one settings write. */
  const clearPluginSelectionSnapshot = async ({ providerIds, principalId, pluginId }: { providerIds: ReadonlySet<string>; principalId: string; pluginId: string }): Promise<void> => {
    await ready();
    const catalog = await loadMailProviderCatalog(resolve);
    const owned = new Set([...providerIds].filter(id => {
      const provider = catalog.registry.get({ id });
      return !provider || provider.pluginId === pluginId;
    }));
    const { setting, revisionSeq } = await readMailProviderSelection({ settingsRepo: settings.repo, workspaceId });
    const value = {
      transactional: owned.has(setting.transactional ?? "") ? null : setting.transactional,
      bulk: owned.has(setting.bulk ?? "") ? null : setting.bulk,
    };
    if (value.transactional === setting.transactional && value.bulk === setting.bulk) return;
    // A provider chosen after this snapshot belongs to the newer writer, even in the other lane.
    await writeMailProviderSetting({ deps: { ...settings.deps, repo: settings.repo, authorize: settings.authorize }, workspaceId, callerPrincipalId: principalId, value }, { expectedRevisionSeq: revisionSeq });
  };
  /** Re-read after contention so a newer unrelated lane is never overwritten. Three guarded
   * attempts bound work; failed ownership stays available to a subsequent disable retry.
   * @complexity At most three catalog/snapshot/write attempts; O(a + p) ownership checks each. */
  const clearPluginSelection = async (input: { providerIds: ReadonlySet<string>; principalId: string; pluginId: string }): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await clearPluginSelectionSnapshot(input); return; }
      catch (error) { if (!(error instanceof SettingsRevisionConflictError) || attempt === 2) throw error; }
    }
  };
  // Only failed cleanup retains ownership: executable contributions disappear after OFF.
  const pendingPluginSelections = new Map<string, ReadonlySet<string>>();
  /** Retain active ownership across an interrupted cleanup; after a restart, read only the
   * trusted inactive declaration when a selected provider no longer exists in the live catalog.
   * @complexity O(a) active adapters plus the conditional installed-declaration lookup. */
  const disabledProviderIds = async (input: Parameters<typeof setAgentPluginEnabled>[0]): Promise<ReadonlySet<string>> => {
    const catalog = await loadMailProviderCatalog(resolve);
    const providers = catalog.registry.list();
    const pending = [...pendingPluginSelections.get(input.pluginId) ?? []].filter(id => {
      const owner = catalog.registry.get({ id });
      return !owner || owner.pluginId === input.pluginId;
    });
    const ids = new Set([...pending, ...providers.filter(provider => provider.pluginId === input.pluginId).map(provider => provider.id)]);
    if (ids.size) return ids;
    await ready();
    const { setting } = await readMailProviderSelection({ settingsRepo: settings.repo, workspaceId });
    const missing = Object.values(setting).some(id => id !== null && !catalog.registry.get({ id }));
    return missing ? new Set((await installedMailProviderIds(input)).filter(id => !catalog.registry.get({ id }))) : ids;
  };
  /** Bind the plugin toggle to this site's mail settings, using plugin ownership rather than ids.
   * @complexity O(a) loaded adapters; one lifecycle write and at most three guarded settings writes. */
  const setPluginEnabled: typeof setAgentPluginEnabled = async (input, _optional = {}) => {
    // MOVE: Capture ownership while the plugin is active; disabling removes its executable adapters.
    const providerIds = input.enabled ? new Set<string>() : await disabledProviderIds(input);
    const written = await (options.setAgentPluginEnabled ?? setAgentPluginEnabled)(input);
    try {
      if (!written.enabled && providerIds.size > 0) {
        pendingPluginSelections.set(input.pluginId, providerIds);
        await clearPluginSelection({ providerIds, principalId: input.actor, pluginId: input.pluginId });
      }
      pendingPluginSelections.delete(input.pluginId);
    } finally { resolved.invalidate(); }
    return written;
  };
  const selectProvider: SiteMailer["selectProvider"] = async ({ id, principalId, expectedRevisionSeq }) => {
    await ready();
    // Finish the first-boot unconfigured write before persisting the owner's selection.
    await resolved.ready;
    await writeMailProviderSetting({ deps: { ...settings.deps, repo: settings.repo, authorize: settings.authorize }, workspaceId, callerPrincipalId: principalId, value: { transactional: id, bulk: id } }, { expectedRevisionSeq });
    // Only after the write succeeded: a switch must reach the very next send and status read.
    resolved.invalidate();
  };
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
  return { ...resolved, setAgentPluginEnabled: setPluginEnabled, selectProvider, readProviderSelection, operations };
}
