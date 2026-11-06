/**
 * @file Where the Import page sends a freshly made site (owner, 2026-11-06). The desktop adds no
 * import logic of its own: a live-website import is the site's own assistant plugin, so the new
 * site's tab opens on its admin Import & Export > Import tab with the address already typed in.
 * (Until 2026-11-06 a header button opened the first running site's admin there instead, which
 * landed people on some other site, started or not; the Import page now makes the site first.)
 * Not an external browser: a desktop site signs in through the webview's boot token, so a browser
 * would land on a login page asking for a password the owner never set.
 */

/**
 * Admin pages a tab can be opened on, relative to `/admin/`. An allowlist on purpose: the renderer
 * never composes a guest path from anything else.
 */
export const SITE_ADMIN_PAGES = { import: 'import-export?tab=import' } as const;

/** One tab's admin landing: an allowlisted page, plus the website address to prefill on it. */
export interface SiteAdminPage {
  page: keyof typeof SITE_ADMIN_PAGES;
  /** A validated http(s) address; the admin's Import tab types it into "Website address". */
  liveAddress?: string;
}

/**
 * The admin path for a tab's landing, `''` for the admin root. The address is re-validated and
 * encoded here, so nothing but an http(s) URL ever reaches the guest's query string.
 * @complexity O(n) in the address length.
 */
export function adminPagePath({ adminPage }: { adminPage?: SiteAdminPage }, _optional: Record<string, never> = {}): string {
  if (!adminPage) return '';
  const base = SITE_ADMIN_PAGES[adminPage.page];
  const address = adminPage.liveAddress === undefined ? null : websiteAddress({ text: adminPage.liveAddress });
  return address === null ? base : `${base}&liveImport=${encodeURIComponent(address)}`;
}

/**
 * The typed text as an http(s) address, or `null` when it is not one. A bare `example.com` gets
 * `https://`, since people type it that way.
 * @complexity O(n) in the text length.
 */
export function websiteAddress({ text }: { text: string }, _optional: Record<string, never> = {}): string | null {
  const trimmed = text.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

/** A site name for a new site made from a website address: its host without `www.`. */
export function siteNameFromAddress({ address }: { address: string }, _optional: Record<string, never> = {}): string {
  return new URL(address).hostname.replace(/^www\./, '');
}

/** Whether two tab landings are the same, so reopening a tab on its page keeps the same record. */
export function sameAdminPage(
  { a, b }: { a: SiteAdminPage | undefined; b: SiteAdminPage },
  _optional: Record<string, never> = {},
): boolean {
  return a !== undefined && a.page === b.page && a.liveAddress === b.liveAddress;
}
