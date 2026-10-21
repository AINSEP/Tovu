/** @file The site's mail feedback route from its content kernel, vault and plugin mail adapters. */
import type { CustomCredentialResolveDeps } from "#src/features/custom-credentials/index";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { createMailFeedbackInboxRepo } from "./feedback-inbox.repo.js";
import { createMailFeedbackRoute, type MailFeedbackRoute } from "./feedback-route.js";
import { createPluginMailFeedbackSources, createVaultMailWebhookSecrets, type MailAdapterSource } from "./feedback-sources.js";
import { createMailSuppressionRepo } from "./suppression.repo.js";

/**
 * One composition call for the composition roots, so they add a single line. Parsers come from the
 * plugin mail-adapter registry until a mail provider registry exists (see `feedback-sources.ts`).
 * @example createSiteMailFeedbackRoute({ db: kernel, workspaceId, credentials: { repo, sealer }, loadAdapters })
 */
export function createSiteMailFeedbackRoute<DB>(required: {
  db: StorageKernel<DB>;
  workspaceId: string;
  credentials: CustomCredentialResolveDeps;
  loadAdapters: () => Promise<MailAdapterSource>;
}): MailFeedbackRoute {
  const { db, workspaceId, credentials, loadAdapters } = required;
  const sources = createPluginMailFeedbackSources({ loadAdapters });
  return createMailFeedbackRoute({
    parserFor: sources.parserFor,
    secretsFor: createVaultMailWebhookSecrets({ credentials, workspaceId, labelFor: sources.labelFor }),
    repos: { inbox: createMailFeedbackInboxRepo({ db }), suppression: createMailSuppressionRepo({ db }) },
    resolveWorkspaceId: () => workspaceId,
  });
}
