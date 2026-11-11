/**
 * @file The sites home's half of the web admin's "Open Import in Tovu" (owner, 2026-11-10): inside
 * the desktop app the admin can't make a site, so it asks for this app's Import tab instead (route
 * in `contracts/import-handoff.ts`). The address arrives untrusted and is typed in only when the
 * Import page's own `websiteAddress` accepts it.
 */
import { useEffect, useRef } from 'react';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';
import { websiteAddress } from './import-site-entry.js';

/**
 * The hand-off's address as the Import page would take it, or `null` when there is none or the
 * page would refuse it (the tab then opens empty rather than holding text it would reject).
 * @complexity O(n) in the address length.
 */
export function handoffAddress({ request }: { request: unknown }, _optional: Record<string, never> = {}): string | null {
  const raw = typeof request === 'object' && request !== null ? (request as { address?: unknown }).address : undefined;
  return typeof raw === 'string' ? websiteAddress({ text: raw }) : null;
}

/**
 * Opens the Import tab on each hand-off, typing in its address first unless an import is running
 * (that import is still using the address on screen).
 * @param required.busy whether the Import page's own import is running.
 * @param required.prefill types the address into the Import page.
 * @param required.open opens the Import tab, or brings it to the front.
 * @complexity O(1) per hand-off beyond address parsing.
 */
export function useImportHandoff(
  { busy, prefill, open }: { busy: boolean; prefill: (address: string) => void; open: () => void },
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'onOpenImport'> } = {},
): void {
  // The latest callbacks, so the bridge listener is attached once rather than on every render.
  const latest = useRef({ busy, prefill, open });
  useEffect(() => { latest.current = { busy, prefill, open }; });
  useEffect(() => getBridge()?.onOpenImport((request) => {
    const address = handoffAddress({ request });
    const current = latest.current;
    if (address !== null && !current.busy) current.prefill(address);
    current.open();
  }), [getBridge]);
}
