import { useCallback } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as dictionaryT } from "../import-export-i18n";

/** This panel's `t`, bound to the admin's resolved locale — the one place it reads the locale, same
 *  split as `useWiredSites`. @complexity O(1) per lookup. */
export function useImportExportTranslate(): Translate {
  const locale = useAdminLocale();
  return useCallback((key: string): string => dictionaryT({ locale: locale, key: key }), [locale]);
}
