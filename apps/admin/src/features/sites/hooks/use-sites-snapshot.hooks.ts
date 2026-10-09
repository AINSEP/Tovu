import { useCallback } from "react";
import { useFetchQuery, useInvalidate, type QueryResult } from "@jini-ai/ui/fetch-query";
import type { AdminSitesSnapshot } from "@/lib/api";
import { useContentRefreshSubscription } from "@/hooks/use-content-refresh-subscription.hooks";
import { KEYS, SITES_RESOURCE } from "../rules";
import type { SitesPort } from "./sites-port.hooks";

/** Shared Sites read/refresh lifecycle for the screen and its sidebar label.
 * @returns The cached server snapshot, including the current live binding and list status.
 * @complexity O(1) plus the existing cached site-list read.
 */
export function useSitesSnapshot(
  { port }: { port: Pick<SitesPort, "listSites"> },
  { enabled = true }: { enabled?: boolean } = {},
): QueryResult<AdminSitesSnapshot> {
  const list = useFetchQuery({ key: KEYS.list, fetch: () => port.listSites() }, { enabled });
  // Stable identity (not an inline arrow) so the subscription effect does not resubscribe every
  // render — same note as `Jini redirects/react/hooks/use-redirects.hooks.ts`'s own `invalidateList`.
  const invalidate = useInvalidate();
  const invalidateList = useCallback(() => invalidate({ key: KEYS.list }), [invalidate]);
  useContentRefreshSubscription(SITES_RESOURCE, invalidateList);
  return list;
}
