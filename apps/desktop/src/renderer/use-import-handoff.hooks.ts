/**
 * @file The sites home's half of the web admin's "Open Import in Tovu" (owner, 2026-11-10): inside
 * the desktop app the admin can't make a site, so it asks for this app's Import tab instead (route
 * in `contracts/import-handoff.ts`). The address arrives untrusted and is typed in only when the
 * Import page's own `websiteAddress` accepts it.
 */
import { useImportHandoff as useHandoff } from '@jini-ai/ui/import-handoff';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';
import { websiteAddress } from './import-site-entry.js';

/**
 * Opens the Import tab on each hand-off, typing in its address first unless an import is running
 * (that import is still using the address on screen). Binds `@jini-ai/ui/import-handoff`'s hook to
 * this app's bridge and the Import page's own `websiteAddress`.
 * @param required.busy whether the Import page's own import is running.
 * @param required.prefill types the address into the Import page.
 * @param required.open opens the Import tab, or brings it to the front.
 * @complexity O(1) per hand-off beyond address parsing.
 */
export function useImportHandoff(
  { busy, prefill, open }: { busy: boolean; prefill: (address: string) => void; open: () => void },
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'onOpenImport'> } = {},
): void {
  useHandoff({ busy, prefill, open, getBridge, accept: websiteAddress });
}
