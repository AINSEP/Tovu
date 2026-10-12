import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { buildVaultAad, type VaultKind, type VaultMeta, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { seedPrincipals } from "../kernel/__tests__/content-seeds.js";
import type { ContentKernel } from "../content-kernel.js";
import type { StorageKernel } from "../kernel/port.js";

export const WS = "ws-recovery";
export const NOW = "2026-10-11T00:00:00.000Z";
export function keyPair() {
  const keyring = new InMemoryKeyring();
  return { keyring, sealer: new AesGcmSecretSealer(keyring) };
}
export function vaultRepo(kernel: ContentKernel) {
  return new SqlSecretsVaultRepo({ kernel: kernel as unknown as StorageKernel<SecretsVaultDatabase> });
}
/** Fixture records use the real Jini repository and AAD; no retired table is recreated. */
export async function fixture(kernel: ContentKernel) {
  await seedPrincipals(kernel, WS, ["principal-1"]);
  const right = keyPair();
  const wrong = keyPair();
  const repo = vaultRepo(kernel);
  async function put(input: { id: string; kind?: VaultKind; meta?: VaultMeta; key?: ReturnType<typeof keyPair> | null;
    provider?: string | null; ownerKey?: string; principalId?: string | null; isDefault?: boolean }) {
    const record: VaultRecord = { workspaceId: WS, id: input.id, kind: input.kind ?? "custom", ownerKey: input.ownerKey ?? "tovu",
      principalId: input.principalId ?? null, binding: null, provider: input.provider ?? null, label: input.id,
      revision: 1, isDefault: input.isDefault ?? false, sealed: null, last4: "LEAK", tokenLength: 20,
      meta: input.meta ?? { category: "general", baseUrl: "https://mail.example.test", username: null, additionalHosts: [] },
      createdAt: NOW, updatedAt: NOW };
    if (input.key !== null) {
      const key = input.key ?? right;
      record.sealed = await key.sealer.seal({ plaintext: JSON.stringify({ token: `LEAK-token-${input.id}` }),
        key: await key.keyring.activeKey(), aad: buildVaultAad(record) });
    } else { record.last4 = null; record.tokenLength = null; }
    return repo.put({ record, expectedRevision: null });
  }
  return { kernel, repo, right, wrong, put };
}
