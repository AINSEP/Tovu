import { ToolInputError } from "@jini-ai/core";
import type { VaultRecord, VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyAttachments, ProjectKeyTransaction } from "./attachments.js";
import type { PluginCredentialCard } from "../custom-credentials/plugin-credential-card.js";

export interface ProviderKeyUsage {
  readonly keyId?: string;
  readonly store: "project" | "site";
  readonly usedByThisSite: boolean;
  readonly usedBy: readonly string[];
}
export interface ProviderWriteResult extends ProviderKeyUsage { readonly keyId: string }
export const providerKeyId = ({ pluginId }: { pluginId: string }, _optional = {}) => `plugin-state:${pluginId}:provider.config`;

export const providerPluginOf = ({ keyId }: { keyId: string }, _optional = {}) => /^plugin-state:([a-z0-9-]+):provider\.config$/.exec(keyId)?.[1];
export interface ProjectKeyRow { keyId: string; name: string; kind: string; usedByThisSite: boolean; usedBy: readonly string[] }
export interface ProjectKeysPort {
  list(required: { cards?: readonly PluginCredentialCard[] }, optional?: Record<string, never>): Promise<ProjectKeyRow[]>;
  permissionFor(required: { keyId: string }, optional?: Record<string, never>): Promise<string>;
  use(required: { keyId: string; use: boolean }, optional?: Record<string, never>): Promise<{ keyId: string; usedByThisSite: boolean; usedBy: readonly string[]; appliesAt: "now" | "restart" }>;
  savedResult(required: { result: unknown; label?: string }, optional?: Record<string, never>): Promise<unknown>;
}

/** Permission follows the same domain that owns saving this row. Unknown kinds fail closed. */
export function projectKeyPermission({ row }: { row: VaultRecord }, _optional = {}): string {
  if (row.kind === "api-connection" && providerPluginOf({ keyId: row.id })) return "admin.plugins.enable";
  if (row.kind === "custom" || row.kind === "vendor" && row.meta.credentialType === "custom") return "custom-credentials.write";
  if (row.kind === "vendor") return "deployments.credentials.write";
  if (row.kind === "source-control") return "source-control.credentials.write";
  throw new ToolInputError({ message: "This kind of project key cannot be attached here." });
}

/** Metadata-only project inventory and explicit opt-in; no decrypt or secret projection. */
export function createProjectKeys({ vault, attachments, siteId, siteName, reapply, transaction }: {
  vault: VaultRepoPort; attachments: KeyAttachments; siteId: string; siteName: string;
  reapply: (input: { pluginId: string }) => Promise<"now" | "restart">;
  transaction: ProjectKeyTransaction;
}, _optional = {}): ProjectKeysPort {
  const find = async ({ keyId }: { keyId: string }) => {
    const row = await vault.find({ workspaceId: "project", id: keyId });
    if (!row) throw new ToolInputError({ message: "This project key no longer exists. List the project keys again." });
    projectKeyPermission({ row });
    return row;
  };
  async function usage({ keyId }: { keyId: string }) {
    const users = await attachments.usersOf({ keyId });
    return { keyId, usedByThisSite: users.some(user => user.siteId === siteId), usedBy: users.map(user => user.siteName) };
  }
  return {
    async list({ cards = [] }) {
      const kinds = ["api-connection", "vendor", "custom", "source-control"] as const;
      const rows = (await Promise.all(kinds.map(kind => vault.list({ workspaceId: "project", kind, ownerKey: "tovu", principalId: null })))).flat();
      return Promise.all(rows.filter(row => row.kind !== "api-connection" || providerPluginOf({ keyId: row.id })).map(async row => {
        const pluginId = providerPluginOf({ keyId: row.id });
        const card = pluginId ? cards.find(card => card.saveKind === "provider-settings" && card.saveTarget === pluginId) : undefined;
        return { ...(await usage({ keyId: row.id })), name: card?.label ?? row.label, kind: row.kind };
      }));
    },
    permissionFor: async input => projectKeyPermission({ row: await find(input) }),
    async use(input) {
      if (!siteId) throw new ToolInputError({ message: "This site has no id yet; restart it." });
      await transaction({ run: async () => {
        await find(input);
        if (input.use) await attachments.attach({ siteId, keyId: input.keyId, siteName });
        else await attachments.detach({ siteId, keyId: input.keyId });
      } });
      const pluginId = providerPluginOf(input);
      const appliesAt = pluginId ? await reapply({ pluginId }) : "now";
      return { ...(await usage(input)), appliesAt };
    },
    async savedResult({ result, label }) {
      const identity = savedKeyIdentity({ result });
      if (!identity) return result;
      const { keyId, value } = identity;
      const row = await vault.find({ workspaceId: "project", id: keyId });
      if (!row) return result;
      // Provider ids also exist in site vaults; a site-only save must never ask to attach its project sibling.
      if (value.store === "site") return result;
      const current = await usage({ keyId });
      return { ...value, ...current, ...(!current.usedByThisSite ? { ask: `Apply this ${label ?? row.label} key to ${siteName}?` } : {}) };
    },
  };
}


/** Only successful, identifiable saves can acquire a project attachment question. */
function savedKeyIdentity({ result }: { result: unknown }, _optional = {}): { keyId: string; value: Record<string, unknown> } | undefined {
  if (!result || typeof result !== "object") return undefined;
  const value = result as Record<string, unknown>;
  if (value.saved !== true && value.created !== true) return undefined;
  const credential = value.credential as { id?: string } | undefined;
  const keyId = value.keyId ?? credential?.id ?? value.credentialId;
  return typeof keyId === "string" ? { keyId, value } : undefined;
}
