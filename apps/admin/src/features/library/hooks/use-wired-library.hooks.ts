import { useCallback, useMemo } from "react";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { renderMarkdownToSafeHtml } from "@jini-ai/ui/renderers";
import { useLibrary, type LibraryController } from "@jini-ai/admin/screens/library/hooks/use-library.hooks";
import { MAX_UPLOAD_BYTES } from "@tovu/contracts/upload-limits";
import { describeApiError } from "@/lib/admin-http/request";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { readFileAsBase64 } from "@jini-ai/admin/screens/media/rules";
import { libraryFileProblem } from "@jini-ai/admin/screens/library/rules";
import { fileSizeRefusal, sizeRefusalFromError } from "@/features/media/upload-size-copy";
import { t as translate } from "../library-i18n";
import { defaultLibraryPort } from "./library-dependencies.hooks";

/**
 * @file Host binding for the Library screen's state hook: the admin locale, the Library dictionary,
 * the real API port, and the host's error-copy, file-reader and Markdown-renderer helpers, injected into the neutral
 * `useLibrary`.
 */
/**
 * Gives a file refused for its size the host's translated copy. Jini's local check words it in English with
 * both sizes; the row's name and size are enough to tell that refusal apart from a type, empty or server failure.
 *
 * @complexity O(rows).
 */
export function translateLibrarySizeRefusals(
  { uploads, t, maxBytes }: { uploads: LibraryController["uploads"]; t: (key: string) => string; maxBytes: number },
  _optional: Record<string, never> = {},
): LibraryController["uploads"] {
  return uploads.map((row) => (
    row.status === "failed" && row.error !== null && libraryFileProblem(row, { maxBytes }) === "size"
      ? { ...row, error: fileSizeRefusal({ t, limitBytes: maxBytes, fallback: row.error }) }
      : row
  ));
}

export function useWiredLibrary(): LibraryController {
  const locale = useAdminLocale();
  const t = useCallback((key: string): string => translate({ locale: locale, key: key }), [locale]);
  // A typed size refusal from the server gets the same translated copy as the local check; every other failure keeps its own message.
  const describeError = useCallback(({ e, fallback }: { e: unknown; fallback: string }): string => sizeRefusalFromError({ t, error: e }) ?? describeApiError({ e, fallback }), [t]);
  const library = useLibrary({ port: defaultLibraryPort, locale, t, describeApiError: describeError, readFileAsBase64, maxUploadBytes: MAX_UPLOAD_BYTES, renderMarkdownToSafeHtml, useContentRefreshSubscription });
  const uploads = useMemo(() => translateLibrarySizeRefusals({ uploads: library.uploads, t, maxBytes: MAX_UPLOAD_BYTES }), [library.uploads, t]);
  return { ...library, uploads };
}
