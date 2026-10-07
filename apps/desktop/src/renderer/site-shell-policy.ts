import type { CreatedSiteRecord, SiteRecord } from '../contracts/project.js';
import { desktopCopy } from '../desktop-i18n.js';

/** Site-folder refusals need recovery instructions; filesystem paths belong in the site's logs. */
export function siteOperationError(
  { error, operation }: { error: unknown; operation: 'add' | 'start' },
  { locale = typeof navigator === 'undefined' ? 'en' : navigator.language }: { locale?: string } = {},
): string {
  const copy = desktopCopy({ locale }).siteErrors;
  const message = humanSiteError({ error, fallback: operation === 'add' ? copy.add : copy.start });
  if (operation === 'add') {
    if (message.includes('is a folder of unrelated files')) return copy.invalid;
    if (message.includes('there is no Tovu site here') || message.includes('has no Tovu site')) return copy.empty;
    if (message.includes('half-initialized or damaged Tovu site')) return copy.incomplete;
    if (message.includes('cannot be examined')) return copy.unreadable;
  }
  // Main can reject with paths embedded anywhere (including quoted paths containing spaces).
  // Summarize those failures rather than trying to remove only the first path segment.
  if (/(?:^|[\s'"(])(?:\/[\w.~][^\s]*|[A-Za-z]:\\)/.test(message)) return copy[operation];
  return message;
}

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
