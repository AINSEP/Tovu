import { useCallback } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { api } from "@/lib/api";
import { isDesktopAdmin } from "@/features/settings/ai-agent-presentation";
import { sitesTranslator, useSitesSnapshot } from "../../sites";
import { t as dictionaryT } from "../import-export-i18n";

/** This panel's `t`, bound to the admin's resolved locale — the one place it reads the locale, same
 *  split as `useWiredSites`. @complexity O(1) per lookup. */
export function useImportExportTranslate(): Translate {
  const locale = useAdminLocale();
  return useCallback((key: string): string => dictionaryT({ locale: locale, key: key }), [locale]);
}

/** The Export and Import tabs' `t`: the Sites dictionary they were written against, bound the same
 *  way, so they read exactly as they did on Sites. @complexity O(1) per lookup. */
export function useSiteTransferTranslate(): Translate {
  const locale = useAdminLocale();
  return useCallback((key: string): string => sitesTranslator({ locale: locale, key: key }), [locale]);
}

/**
 * Whether this deployment has a Sites section, so the Import tab may link to its New site tab.
 * The same rule `App.hooks.ts`'s `useSiteSectionAvailability` applies to the sidebar and router —
 * never in the desktop shell, otherwise the server's `switchingEnabled` — over the same cached read
 * (the boot scope's principal key is the one App passes), so it costs no extra request. A read still
 * loading counts as no: a link that bounces to the dashboard is worse than one that shows a moment late.
 * @complexity O(1) plus the shared, cached sites read; none in the desktop shell.
 */
export function useSitesSectionAvailable(
  _required: Record<string, never> = {},
  { desktop = isDesktopAdmin({}) }: { desktop?: boolean } = {},
): boolean {
  const snapshot = useSitesSnapshot({ port: api }, { enabled: !desktop });
  return !desktop && snapshot.data?.switchingEnabled === true;
}
