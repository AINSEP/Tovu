import { useCallback } from "react";
import { renderMarkdownToSafeHtml } from "@jini-ai/ui/renderers";
import { useLibrary, type LibraryController } from "@jini-ai/admin/screens/library/hooks/use-library.hooks";
import { describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { readFileAsBase64 } from "../../media/rules";
import { t as translate } from "../library-i18n";
import { defaultLibraryPort } from "./library-dependencies.hooks";

/**
 * @file Host binding for the Library screen's state hook: the admin locale, the Library dictionary,
 * the real API port, and the host's error-copy, file-reader and Markdown-renderer helpers, injected into the neutral
 * `useLibrary`.
 */
export function useWiredLibrary(): LibraryController {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => translate({ locale: locale, key: key }), [locale]);
  return useLibrary({ port: defaultLibraryPort, locale, t, describeApiError, readFileAsBase64, renderMarkdownToSafeHtml });
}
