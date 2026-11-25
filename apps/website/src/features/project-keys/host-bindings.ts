import { ToolInputError } from "@jini-ai/core";
import type { VaultRecord } from "@jini-ai/core/contracts/vault";
import { createHash } from "node:crypto";
import { createProjectKeys as createKeys, providerPluginOf, isSharedOAuthKey } from "@jini-ai/user-management/project-keys/service";
import { createSiteKeyReferences as createReferences, createSiteOAuthBindings as createBindings } from "@jini-ai/user-management/project-keys/site-references";
import { buildProjectKeyRegistrations as buildRegistrations, createProjectKeysCatalog } from "@jini-ai/user-management/project-keys/tools";
import { apiConnectionVaultScope, PLUGIN_STATE_FORMAT } from "#src/platform/secrets/vault-api-connection-meta";
import { attachedVaultPolicy } from "./vault-policy.js";
import { approvalToolHandler } from "../../contracts/core/human-confirm.js";
import { toolMetadata } from "@jini-ai/core/tool-metadata/custom-credentials";

/** Permission follows the same domain that owns saving this row. Unknown kinds fail closed. */
export function projectKeyPermission({ row }: { row: VaultRecord }, _optional = {}): string {
  if (row.kind === "api-connection" && providerPluginOf({ keyId: row.id })) return "admin.plugins.enable";
  if (isSharedOAuthKey({ row })) return "admin.plugins.enable";
  if (row.kind === "custom" || row.kind === "vendor" && row.meta.credentialType === "custom") return "custom-credentials.write";
  if (row.kind === "vendor") return "deployments.credentials.write";
  if (row.kind === "source-control") return "source-control.credentials.write";
  throw new ToolInputError({ message: "Choose an API key, provider-settings key or saved OAuth connection in Shared Keys. Details: P25_KEY_KIND_NOT_SUPPORTED." });
}

export function createProjectKeys(required: Omit<Parameters<typeof createKeys>[0], "owner" | "attachedPolicy" | "permissionForRow" | "copy">, _optional: Record<string, never> = {}) {
  return createKeys({ ...required, owner: { workspaceId: "project", ownerKey: "tovu" }, attachedPolicy: attachedVaultPolicy, permissionForRow: projectKeyPermission,
    copy: { missingSite: "This site has no id yet; restart it.", missingProjectKey: "This project key no longer exists. List the project keys again.", missingSiteKey: "This saved key is no longer on that site. Open Use a saved key again.", oauthBindingRequired: "Choose a saved connection from this site's connection settings before granting access.", revoked: "Access is revoked within 30 seconds." } });
}

export function createSiteKeyReferences({ vault, repo, workspaceId }: Pick<Parameters<typeof createReferences>[0], "vault" | "repo"> & { workspaceId: string }, _optional: Record<string, never> = {}) {
  const scope = apiConnectionVaultScope({ workspaceId });
  return createReferences({ vault, repo, identity: ({ credentialId }) => ({ ...scope, id: `plugin-state:tovu-key-references:${createHash('sha256').update(credentialId).digest('hex')}` }),
    credentialFormat: PLUGIN_STATE_FORMAT, invalidIdMessage: 'Choose an existing Shared Key with an id of at most 512 characters.' });
}

export function createSiteOAuthBindings({ vault, repo, workspaceId }: Pick<Parameters<typeof createBindings>[0], "vault" | "repo"> & { workspaceId: string }, _optional: Record<string, never> = {}) {
  const scope = apiConnectionVaultScope({ workspaceId });
  return createBindings({ vault, repo, identity: ({ consumerId }) => ({ ...scope, id: `plugin-state:tovu-shared-oauth-binding:${createHash('sha256').update(consumerId).digest('hex')}` }),
    credentialFormat: PLUGIN_STATE_FORMAT, invalidIdMessage: 'Choose an existing saved connection for this site.' });
}

export const projectKeysCatalog = createProjectKeysCatalog({ readPermission: "custom-credentials.read", restartPermission: "admin.plugins.enable", descriptions: {
  list: "List only saved keys already granted to this site. To choose another saved key, open credential_copy_from_project; its owner card keeps ungranted keys private.",
  use: "Stop using a granted shared key on this site. Use credential_copy_from_project to approve a new grant in the owner card. Revocation applies immediately to future reads.",
  restart: "Offer a confirmation card before restarting this site when live provider apply reports restart. Unsaved work and running chats will be lost. Without a dev supervisor returns instructions for the Sites list.",
} });

export const projectKeyToolHost: Parameters<typeof buildRegistrations>[0]["host"] = {
  metadata: toolMetadata, catalogModule: "features/project-keys/host-bindings.ts", catalog: projectKeysCatalog,
  readPermission: "custom-credentials.read", restartPermission: "admin.plugins.enable", restartReason: "provider-settings-live-apply",
  copy: { unavailable: "This site has no project key store; keys saved here are used by this site at once.", noArguments: "This tool takes no arguments.",
    revokeInput: "To revoke a grant, provide keyId and use:false. To grant a saved key, open credential_copy_from_project.", ungranted: "This key is not granted to this site. Open Use a saved key to choose it in the owner's card.",
    restartTitle: "Restart this site?", restartWarning: "Unsaved work and running chats will be lost.", restartLabel: "Restart this site", restartUnavailable: "Restart the site from the Sites list",
    restartUnconfirmed: "The dev supervisor did not confirm the restart request.", restartAccepted: "The dev supervisor accepted the restart request." },
  approvalToolHandler: ({ surfaces, prepare, describe, run }, optional) => approvalToolHandler({ surfaces, prepare, describe,
    run: (required, executionOptions) => run({ ...required, executionOptions }) }, optional),
};

export function buildProjectKeyRegistrations(required: Omit<Parameters<typeof buildRegistrations>[0], "host">, _optional: Record<string, never> = {}) {
  return buildRegistrations({ ...required, host: projectKeyToolHost });
}
