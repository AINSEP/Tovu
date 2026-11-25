import type { AdminMedia, MediaGridOrder, MediaGridTab } from "@jini-ai/core/contracts/site/cms-admin-media";
import { fakeGridPage } from "../hooks/media-dependencies.hooks";

/**
 * The grid route's JSON answer for a stubbed `fetch`: the same filter, order and workspace counts the
 * server gives, derived from the stub's full list. Whole list as one page; a test that needs paging
 * answers its own requests.
 */
export function gridResponseBody({ url, media }: { url: string; media: AdminMedia[] }, _optional: Record<string, never> = {}): unknown {
  const query = new URL(url, "http://localhost").searchParams;
  return fakeGridPage({
    items: media,
    tab: (query.get("tab") ?? "all") as MediaGridTab,
    orderBy: (query.get("orderBy") ?? "created") as MediaGridOrder,
    itemId: query.get("itemId") ?? undefined,
  });
}

/** True when `url` is a grid request (`.../media/grid?...`). */
export function isGridUrl({ url }: { url: string }, _optional: Record<string, never> = {}): boolean {
  return /\/media\/grid(\?|$)/.test(url);
}
