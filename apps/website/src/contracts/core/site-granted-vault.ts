import type { VaultRecord, VaultRepoPort } from '@jini-ai/core/contracts/vault';

/** A vault reader that may also offer an indexed `findByLabel` over the same (possibly site-granted) rows.
 * Structural only: the Project Keys grant wrapper produces it and the custom-credential repo consumes it.
 */
export type SiteGrantedVault = VaultRepoPort & { findByLabel?: (input: { workspaceId: string; label: string }, options?: Record<string, never>) => Promise<VaultRecord | null> };
