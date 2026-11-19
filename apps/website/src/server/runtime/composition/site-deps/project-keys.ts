import type { composeAgentPluginBootstrap } from "./agent-plugin-bootstrap.js";
import type { SiteStore } from "../open-site-store.js";
import type { composeStoreBasics } from "./store-basics.js";
import type { composeAssistantCredentials } from "./assistant-credentials.js";
import type { composeProviderConfig } from "./provider-identity.js";
import type { composeProviderConfigSource } from "./provider-config.js";
import type { providerPluginBoot } from "./provider-identity.js";
import { createOtherSiteKeys } from "../other-site-keys.js";
import { createProjectKeys } from "#src/features/project-keys/service";
import { createSharedOAuthLabels } from "#src/features/api-connections/shared-owner";
import { isLocalTovuHost } from "../registered-sites.js";
import { sqliteConnectionOf } from "#src/platform/db/kernel/drivers/sqlite";

interface CompositionProjectKeysRequired {
  resolvedSiteBinding: ReturnType<typeof composeAgentPluginBootstrap>["resolvedSiteBinding"];
  kernel: SiteStore["content"];
  clock: ReturnType<typeof composeStoreBasics>["clock"];
  projectKeyReferences: ReturnType<typeof composeAssistantCredentials>["projectKeyReferences"];
  projectSiteId: Awaited<ReturnType<typeof composeProviderConfig>>["siteId"];
  projectStore: Awaited<ReturnType<typeof composeProviderConfig>>["projectStore"];
  providerConfigSource: ReturnType<typeof composeProviderConfigSource>["providerConfigSource"];
  providerPlugins: Awaited<ReturnType<ReturnType<typeof providerPluginBoot>>>;
  bindSharedApiOAuth: () => (((input: { keyId: string; use: boolean }) => Promise<void>) | undefined);
}

/** Build the shared-key service only for an attached project; binding remains late-bound.
 * @complexity O(1) service construction; I/O occurs only through later service operations. */
export function compositionProjectKeys(required: CompositionProjectKeysRequired, _optional = {}) {
  const { resolvedSiteBinding, kernel, clock, projectKeyReferences, projectSiteId, projectStore, providerConfigSource, providerPlugins, bindSharedApiOAuth } = required;
  return projectStore ? createProjectKeys({ vault: projectStore.vault.repo, attachments: projectStore.attachments,
    describeOAuth: createSharedOAuthLabels({ scope: projectStore.vault, clock }),
    siteId: projectSiteId, siteName: resolvedSiteBinding.name, providerUsage: input => providerConfigSource.usage(input), reapply: input => providerPlugins.reapply(input),
    transaction: input => projectStore.transaction(input), inventory: projectStore.inventory ? () => {
      if (!projectStore.inventory) throw new Error("project keys have no inventory service");
      return projectStore.inventory({});
    } : undefined, references: projectKeyReferences,
    // The site registry exists only on a desktop or self-hosted multi-site install.
    ...(projectSiteId && isLocalTovuHost({}, {}) ? { siteKeys: createOtherSiteKeys({ target: { siteId: projectSiteId, name: resolvedSiteBinding.name, dir: resolvedSiteBinding.dir, file: sqliteConnectionOf(kernel)?.name }, project: projectStore.vault }) } : {}),
    bindOAuth: input => {
      const bind = bindSharedApiOAuth();
      if (!bind) throw new Error("Shared connections are not available yet. Reopen this saved connection and try again.");
      return bind(input);
    } }) : undefined;
}
