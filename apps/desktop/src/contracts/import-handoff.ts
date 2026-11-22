/**
 * @file The web admin's hand-off to the desktop Import tab (owner, 2026-11-10). Inside the desktop
 * app the admin can't make a new site, so its "From a live website" asks the app to open its own
 * Import tab instead, with the address the person typed.
 *
 * Two hops, each on a bridge that already exists rather than a new kind of channel:
 *   - admin → main: the admin's sandboxed preload (`speech/preload-speech.cts`) exposes
 *     `window.tovuImport` on admin pages only, beside `tovuFiles`, and invokes `request` the way
 *     `tovuVoice` invokes its speech channels, behind the same shell-page sender check
 *     (`import-handoff-ipc.ts`). That preload inlines the literal; its test pins it to this file.
 *   - main → sites home: main pushes `open` to the sites home window the way `desktop.navigate`
 *     pushes `workspace:chat:navigate`; `preload.mts` hands it to the renderer as `onOpenImport`.
 */

export const IMPORT_HANDOFF_CHANNELS = {
  /** invoke (admin page → main). */
  request: 'tovu:import:open',
  /** push (main → sites home renderer). */
  open: 'runner:import:open',
} as const;

/**
 * What crosses both hops. The address stays untrusted text until the Import page's own
 * `websiteAddress` (`renderer/import-site-entry.ts`) accepts it; main only bounds its shape.
 */
export interface ImportHandoffRequest {
  address?: string;
}

/** `opened: false` when no sites home window is open to show the Import tab. */
export interface ImportHandoffResult {
  opened: boolean;
}

/** Far longer than any address worth typing; a cap so main never forwards an unbounded string. */
export const IMPORT_HANDOFF_ADDRESS_MAX = 2048;

/**
 * The request as main forwards it: a fresh object holding only a nonblank, bounded string address.
 * Anything else becomes `{}`, which still opens the Import tab, just empty.
 * @complexity O(n) in the address length.
 */
export function importHandoffRequest({ raw }: { raw: unknown }, _optional: Record<string, never> = {}): ImportHandoffRequest {
  if (typeof raw !== 'object' || raw === null) return {};
  const address = (raw as { address?: unknown }).address;
  if (typeof address !== 'string') return {};
  const trimmed = address.trim();
  return trimmed === '' || trimmed.length > IMPORT_HANDOFF_ADDRESS_MAX ? {} : { address: trimmed };
}
