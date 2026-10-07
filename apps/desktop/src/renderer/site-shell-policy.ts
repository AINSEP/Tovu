import type { CreatedSiteRecord, SiteRecord } from '../contracts/project.js';

/** Electron and Error class wrappers are transport details, never useful instructions. */
export function humanSiteError({ error, fallback }: { error: unknown; fallback: string }, _optional = {}): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^(?:Error:\s*)?Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(?:[\w.]*Error:\s*)+/, '').trim() || fallback;
}
export function tabAfterClose(
  { tabs, active, closing }: { tabs: readonly string[]; active: string | null; closing: string }, _optional = {},
): string | null {
  if (active !== closing) return active;
  const index = tabs.indexOf(closing);
  return index < 0 ? null : tabs[index + 1] ?? tabs[index - 1] ?? null;
}
/** Dismiss permanently when the created site starts, disappears, or loses its folder. */
export function readyNoticeStillTrue(
  { created, projects }: { created: CreatedSiteRecord | null; projects: readonly SiteRecord[] }, _optional = {},
): boolean {
  if (!created) return false;
  return projects.some((site) => site.id === created.id && site.displayName === created.displayName && !site.folderMissing && site.status === 'stopped');
}
export function dismissOnEscape(
  { event, dismiss, busy = false }: { event: { key: string; isComposing?: boolean }; dismiss: () => void; busy?: boolean }, _optional = {},
): void {
  if (event.key === 'Escape' && !event.isComposing && !busy) dismiss();
}
export function addedSiteMessage({ added }: { added: SiteRecord & { alreadyTracked?: boolean } }, _optional = {}): string | null {
  return added.alreadyTracked ? `${added.displayName} is already in your list.` : null;
}
