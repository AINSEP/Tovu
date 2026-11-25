/**
 * @file Host binding of the shared appearance-snapshot hook: supplies the appearance settings
 * namespace and the host's fetch-query hook once, so every observer shares one cache entry. The
 * loader, preview cutoff and `advanceAppearancePreview` live in
 * `@jini-ai/admin/shell/hooks/use-admin-appearance-snapshot.hooks`.
 */
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminAppearanceSnapshot as useSharedAppearanceSnapshot } from "@jini-ai/admin/shell/hooks/use-admin-appearance-snapshot.hooks";
import { APPEARANCE_NAMESPACE, type AppearanceConfig } from "../lib/settings-tabs";

/** @example useAdminAppearanceSnapshot({ port }, { root }) */
export function useAdminAppearanceSnapshot(
  { port }: { port: { loadAppearance(): Promise<AppearanceConfig> } },
  { root }: { root?: HTMLElement } = {},
) {
  return useSharedAppearanceSnapshot<AppearanceConfig>({ port, namespace: APPEARANCE_NAMESPACE, useFetchQuery }, { root });
}
