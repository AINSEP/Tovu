/**
 * @file The "Import site" header entry (owner, 2026-10-18). It opens a site's own admin IN-APP on the
 * Import & Export page's Import tab, where the import itself lives; the desktop adds no import logic.
 * (It was Sites → Import until 2026-10-25, but the admin hides Sites inside the desktop app and that
 * route bounced to the dashboard; the owner moved the tab.) Not an
 * external browser: a desktop site signs in through the webview's boot token, so a browser would land
 * on a login page asking for a password the owner never set.
 */
import type { SiteRecord } from '../contracts/project.js';

/**
 * Admin pages a tab can be opened on, relative to `/admin/`. An allowlist on purpose: the renderer
 * never composes a guest path from anything else.
 */
export const SITE_ADMIN_PAGES = { import: 'import-export?tab=import' } as const;

export type SiteAdminPage = keyof typeof SITE_ADMIN_PAGES;

/**
 * Which site's admin the entry opens: the first running one, else the first one. A stopped target is
 * fine — its tab shows the usual "Start site" panel, and once started it lands on the Import tab.
 * `null` when there are no sites, which hides the button.
 * @complexity O(n) time over `projects`, O(1) space.
 */
export function resolveImportSiteTarget(
  { projects }: { projects: readonly Pick<SiteRecord, 'id' | 'status'>[] },
  _optional: Record<string, never> = {},
): string | null {
  return (projects.find((project) => project.status === 'running') ?? projects[0])?.id ?? null;
}
