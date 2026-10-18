import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useCallback } from "react";
import { useAdminBootScope } from "../lib/admin-boot-scope";
import { APPEARANCE_NAMESPACE, type AppearanceConfig } from "../lib/settings-tabs";

// A controlled draft can change while the shell's initial read is still pending. Invalidate
// that read at the document boundary rather than letting it undo the operator's live preview.
const previewVersions = new WeakMap<HTMLElement, number>();

/** Advance this document's preview cutoff; weak ownership retains no unmounted document. */
export function advanceAppearancePreview({ root }: { root: HTMLElement }, _optional: object = {}): number {
  const version = (previewVersions.get(root) ?? 0) + 1;
  previewVersions.set(root, version);
  return version;
}

/**
 * Every observer of the shared appearance query uses this loader: TanStack may select any
 * observer's fetch on invalidation. Capture the cutoff before I/O, so a response retires only
 * drafts it started after. Errors remain query errors and never retire previews.
 * @example useAdminAppearanceSnapshot({ port }, { root })
 */
export function useAdminAppearanceSnapshot(
  { port }: { port: { loadAppearance(): Promise<AppearanceConfig> } },
  { root = document.documentElement } = {},
) {
  const { queryScope, checking } = useAdminBootScope();
  const fetchAppearance = useCallback(async () => {
    const readPreviewVersion = previewVersions.get(root) ?? 0;
    // Keep the read's cutoff in the cached value so structural sharing retains its freshness.
    // Metadata stays outside the stored config, which the theme picker passes back to save.
    return { appearance: await port.loadAppearance(), readPreviewVersion };
  }, [port, root]);
  return useFetchQuery({ key: ["settings", APPEARANCE_NAMESPACE, queryScope], fetch: fetchAppearance }, { enabled: !checking, staleTime: Infinity });
}
