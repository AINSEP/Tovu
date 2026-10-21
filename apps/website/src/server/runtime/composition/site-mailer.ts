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
  delivery: { ledger: MailSendLedgerPort; suppression: MailSuppressionRepoPort; capture?: MailCapturePort };
  readSenderEmail: () => Promise<string | undefined>;
}

export interface SiteMailer extends ResolvedMailer {
  /** Sets both lanes to `id` as `principalId`; the caller already checked `checkProvider` and got approval. */
  selectProvider: (required: { id: string; principalId: string }) => Promise<void>;
}

/**
 * Builds the lane-routed, policy-wrapped site mailer.
 * @complexity O(1); see `resolve-mailer.ts` for per-send costs.
 */
export function createSiteMailer(required: SiteMailerRequired, _optional: Record<string, never> = {}): SiteMailer {
  const { resolve, settings, delivery } = required;
  const workspaceId = resolve.workspaceId;
  const ready = async () => { await required.settingsReady; };
  const selectProvider: SiteMailer["selectProvider"] = async ({ id, principalId }) => {
    await ready();
    await writeMailProviderSetting({ deps: { ...settings.deps, repo: settings.repo, authorize: settings.authorize }, workspaceId, callerPrincipalId: principalId, value: { transactional: id, bulk: id } });
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
      { ledger: delivery.ledger, suppression: delivery.suppression, readTestMode: async () => { await ready(); return readMailTestMode({ settingsRepo: settings.repo, workspaceId }); } },
      delivery.capture ? { capture: delivery.capture } : {},
    ),
    readSenderEmail: required.readSenderEmail,
  });
  return { ...resolved, selectProvider };
}
