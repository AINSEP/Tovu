import { useCallback } from "react";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { sitesApi } from "@/features/sites/api/sites-api";
import { isDesktopAdmin } from "@/features/settings/ai-agent-presentation";
import { sitesTranslator, useSitesSnapshot } from "../../sites";
import {
  useImportExportTranslate,
  useSitesSectionAvailable,
  type ImportExportTranslateHost,
  type SitesSectionAvailabilityHost,
} from "@jini-ai/admin/screens/import-export/hooks/use-import-export.hooks";

import { type Translate } from '@jini-ai/core/text';
/**
 * @file This admin's bindings for the package's Import & Export hooks: its locale query, the desktop
 * check (`ai-agent-presentation.ts`'s `isDesktopAdmin`) and the cached sites read that
 * `site-section-availability.hooks.ts`'s `useSiteSectionAvailability` shares — plus the Sites
 * dictionary the Export and Import tabs read. Module-level host objects, so hook fields keep their identity.
 */

export const IMPORT_EXPORT_TRANSLATE_HOST: ImportExportTranslateHost = { useLocale: () => useAdminLocale() };

export const SITES_SECTION_HOST: SitesSectionAvailabilityHost = {
  isDesktop: () => isDesktopAdmin({}),
  useSitesSnapshot: ({ enabled }) => useSitesSnapshot({ port: sitesApi }, { enabled }),
};

/** The panel's `t`, bound to this admin's resolved locale. */
export function useWiredImportExportTranslate(): Translate {
  return useImportExportTranslate({ host: IMPORT_EXPORT_TRANSLATE_HOST });
}

/** The Export and Import tabs' `t`: the Sites dictionary they were written against, bound the same
 *  way, so they read exactly as they did on Sites. @complexity O(1) per lookup. */
export function useSiteTransferTranslate(): Translate {
  const locale = useAdminLocale();
  return useCallback((key: string): string => sitesTranslator({ locale: locale, key: key }), [locale]);
}

/** Whether this deployment has a Sites section (see the package hook); `desktop` overrides the
 *  shell check in tests. */
export function useWiredSitesSectionAvailable(
  _required: Record<string, never> = {},
  optional: { desktop?: boolean } = {},
): boolean {
  return useSitesSectionAvailable({ host: SITES_SECTION_HOST }, optional);
}
