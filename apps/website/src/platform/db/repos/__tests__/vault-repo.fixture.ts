import { listTables } from "../../kernel/dialect.js";
import type { StorageKernel } from "../../kernel/port.js";
import type { ContentKernel } from "../../content-kernel.js";
import { vaultStep } from "../../migrations/__tests__/secrets-vault.fixture.js";

/** Apply the unregistered step only to the existing disposable dialect fixture. PGlite reuses
 * its schema between cases; the matrix resets workspaces and cascades vault rows before this.
 */
export async function ensureVaultRepoFixture({ kernel }: { kernel: ContentKernel }, _options = {}): Promise<void> {
  if ((await listTables(kernel)).includes("secrets_vault")) return;
  await kernel.transaction(() => vaultStep.up(kernel as unknown as StorageKernel<unknown>, { note: () => {} }));
}
