import { matchingCredentialProviderIds, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import { customVaultScope } from "#src/features/custom-credentials/index";
import { credentialHint } from "#src/features/vendor-credentials/vault-adapter";
import type { DeployTargetRegistry } from "../deploy-targets/types.js";
import type { PublishCredentialReadDeps, PublishCredentialResolveDeps } from "./store.js";
import type { PublishConnectionInput, PublishCredentialSummary } from "./types.js";

/** Adapt deploy descriptors to Jini's metadata matcher. Custom keys hold one token, so hosts
 * needing additional required credential fields cannot be satisfied by one. No I/O; O(hosts).
 */
export function publishHostsForCredential({ credential, registry }: {
  credential: { kind: string; provider: string | null; label: string }; registry: DeployTargetRegistry;
}, _options = {}): string[] {
  return matchingCredentialProviderIds({ credential, providers: registry.list().flatMap(({ descriptor }) => {
    const spec = descriptor.credential;
    return spec ? [{ id: descriptor.id, vendorId: spec.vendorId,
      acceptsCustomToken: !spec.fields.some(field => field.required && field.name !== spec.tokenField) }] : [];
  }) });
}

/** Non-decrypting, scoped custom inventory. Never carry an envelope into the read model.
 * O(custom keys) reads/space; an older injected repo without a vault has no custom inventory.
 */
async function customRows({ deps, workspaceId }: { deps: PublishCredentialReadDeps; workspaceId: string }, _options = {}): Promise<VaultSummary[]> {
  const rows = await deps.repo.vault?.list(customVaultScope({ workspaceId })) ?? [];
  return rows.filter(row => row.workspaceId === workspaceId && row.kind === "custom" && row.ownerKey === "tovu" &&
    row.principalId === null && row.binding === null && row.sealed !== null).map(({ sealed: _sealed, ...row }) => ({ ...row, configured: true }));
}

/** Custom publish candidates share the vendor read model, but never replace a vendor default.
 * A unique custom candidate is the fallback default; multiple matches require an explicit ID.
 * No decrypt or writes. O(custom keys × hosts + vendor defaults), O(matches) space.
 */
export async function listCustomPublishCredentials({ deps, workspaceId, registry, providerId: requestedProviderId }: {
  deps: PublishCredentialReadDeps; workspaceId: string; registry: DeployTargetRegistry; providerId?: string;
}, _options = {}): Promise<PublishCredentialSummary[]> {
  const candidates = (await customRows({ deps, workspaceId })).flatMap(row => {
    const hosts = publishHostsForCredential({ credential: row, registry });
    const providerId = requestedProviderId === undefined ? hosts[0] : hosts.find(host => host === requestedProviderId);
    const spec = providerId === undefined ? undefined : registry.get(providerId)?.descriptor.credential;
    return spec ? [{ row, providerId: providerId!, vendorId: spec.vendorId }] : [];
  });
  const defaults = new Map<string, boolean>();
  for (const { vendorId } of candidates) if (!defaults.has(vendorId)) {
    defaults.set(vendorId, (await deps.repo.findDefaultByVendor({ workspaceId, vendorId })) !== null);
  }
  const counts = new Map<string, number>();
  for (const { vendorId } of candidates) counts.set(vendorId, (counts.get(vendorId) ?? 0) + 1);
  return candidates.map(({ row, providerId, vendorId }) => {
    const tokenHint = credentialHint({ record: row });
    return { id: row.id, providerId, vendorId, label: row.label, configured: true,
      isDefault: !defaults.get(vendorId) && counts.get(vendorId) === 1, tokenHint, tokenTail: tokenHint?.last4 ?? "",
      accountLabel: null, createdAt: row.createdAt, updatedAt: row.updatedAt };
  });
}

/** Open only the selected custom row through the existing host-scoped vault. Recheck metadata
 * from that same read before adapting its token to a deploy descriptor. No copy or migration.
 * Throws the publish store's fixed storage error on crypto/shape failure. O(hosts), one open.
 */
export async function resolveCustomPublishCredential({ deps, workspaceId, summary, storageError }: {
  deps: PublishCredentialResolveDeps; workspaceId: string; summary: PublishCredentialSummary; storageError: () => Error;
}, _options = {}): Promise<PublishConnectionInput | null> {
  try {
    const resolved = await createTovuStoreVault({ repo: deps.repo, kind: "custom", sealer: deps.sealer, storageError })
      .get({ ...customVaultScope({ workspaceId }), id: summary.id });
    if (!resolved) return null;
    const registry = await deps.loadDeployTargets(workspaceId);
    if (!publishHostsForCredential({ credential: resolved.summary, registry }).includes(summary.providerId)) return null;
    const token = resolved.payload?.token;
    if (typeof token !== "string" || !token.trim()) throw storageError();
    const spec = registry.get(summary.providerId)!.descriptor.credential!;
    return { providerId: summary.providerId, [spec.tokenField]: token };
  } catch { throw storageError(); }
}
