import type { CollectionListsWarning } from "@jini-ai/cms/public-http/routes/site/pages/render-context/collection-lists";

/**
 * @file The host half of collection-marker warnings: `resolveCollectionListsForRender` reports each miss
 * as structured data (`CollectionListsWarning`) and this binds Tovu's `[collection]` log lines and their
 * sink (`console.warn`), the exact text the route wrote before the resolver moved to Jini. Every miss
 * leaves the marker's authored fallback content, so a warning is operator information, never a failure.
 */

const FALLBACK = "leaving its authored fallback content";

/** The operator-facing line for one warning, byte-identical to the pre-extraction text. @complexity O(1). */
export function formatCollectionListsWarning({ event }: { event: CollectionListsWarning }, _optional: Record<string, never> = {}): string {
  switch (event.code) {
    case "marker-names-no-content-type":
      return `[collection] marker names no content type (a string "id"); ${FALLBACK}`;
    case "content-type-not-registered":
      return `[collection] no content type registered for typeKey "${event.collection}"; ${FALLBACK}`;
    case "config-rejected":
      return `[collection] rejected marker config for typeKey "${event.collection}": ${event.reason}; ${FALLBACK}`;
    case "marker-cap-exceeded":
      return `[collection] page carries ${event.distinct} distinct collection marker configs; only the first ${event.resolved} are resolved, the rest keep their authored fallback content`;
  }
}

/** The `warn` collaborator `resolveCollectionListsForRender` is injected with: format, then `console.warn`. @complexity O(1). */
export function warnCollectionLists(event: CollectionListsWarning): void {
  console.warn(formatCollectionListsWarning({ event }));
}
