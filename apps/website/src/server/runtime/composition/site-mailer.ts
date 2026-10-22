import { createMailSenderIdentityResolver } from "#src/platform/mail/sender-identity";
import { createMailPurposeGateProbe } from "#src/platform/mail/purpose-gate-probe";
import { createMailTestSendLimiter, type MailTestSendDeps } from "#src/features/mail-status/test-send";
import type { AuthorizeFn, SettingsRepoPort, SetValueRequired } from "@jini-ai/core/settings";
import type { MailCapturePort, MailSendLedgerPort, MailSuppressionRepoPort } from "@jini-ai/platform/mail";

import { readMailProviderSetting, readMailTestMode, writeMailProviderSetting } from "#src/features/settings/mail-provider";
import { createMailPolicyWrapper } from "../boot/mail-delivery-policy.js";
import { createResolvedMailer, type ResolvedMailer, type ResolveMailerDeps } from "../boot/resolve-mailer.js";

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
  operations: Pick<MailTestSendDeps, "mailTestMode" | "mailTestProvider" | "mailTestRequests" | "mailTestSendLimiter" | "mailSenderIdentity"> & {
    mailLaneReady: ResolvedMailer["laneReady"];
    mailSenderDomainVerification: ResolvedMailer["senderDomainVerification"];
    mailPurposeGate: import("#src/platform/mail/purpose-gate-probe").MailPurposeGateProbe;
  };
  /** Sets both lanes to `id` as `principalId`, then drops cached mailers and status; the caller already
   *  checked `checkProvider` and got approval. A failed write throws and changes nothing. */
  selectProvider: (required: { id: string; principalId: string }) => Promise<void>;
}

/**
 * Builds the lane-routed, policy-wrapped site mailer.
 * @complexity O(1); see `resolve-mailer.ts` for per-send costs.
 */
export function createSiteMailer(required: SiteMailerRequired, options: { durableOutboxReady?: (capabilityName: string) => boolean } = {}): SiteMailer {
  const { resolve, settings, delivery } = required;
  const workspaceId = resolve.workspaceId;
  const ready = async () => { await required.settingsReady; };
  const selectProvider: SiteMailer["selectProvider"] = async ({ id, principalId }) => {
    await ready();
    await writeMailProviderSetting({ deps: { ...settings.deps, repo: settings.repo, authorize: settings.authorize }, workspaceId, callerPrincipalId: principalId, value: { transactional: id, bulk: id } });
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
  return { ...resolved, selectProvider, operations };
}
