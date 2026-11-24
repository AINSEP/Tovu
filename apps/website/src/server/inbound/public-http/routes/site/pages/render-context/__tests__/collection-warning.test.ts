import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { ContentTypeRecord } from "@jini-ai/core/contracts/content-types";
import { resolveCollectionListsForRender, type CollectionListsCollaborators } from "@jini-ai/cms/public-http/routes/site/pages/render-context/collection-lists";
import { markersOfType, COLLECTION_MARKER_TYPE } from "@jini-ai/cms/widgets/markers";
import { collectionMarkerKey, splitCollectionMarkerInner, renderEntryList, listingBatchPath, listingKeyOfAttributes, readListingBatch, renderListingMore } from "@jini-ai/cms/listing";
import { parseCollectionListConfig, humanizeFieldName, entryPublicHref } from "@jini-ai/cms/entries/site/public-list";
import { formatDateLabel, resolveSiteTimeZoneSafely } from "@jini-ai/cms/widgets/date-label";
import { warnCollectionLists } from "../collection-warning.js";

/**
 * @file Pins the `[collection]` console lines the public site writes when a collection marker falls back
 * to its authored content: the Jini resolver reports structured warnings, and `warnCollectionLists` (the
 * binding `static-tier` injects) must keep each line byte-identical to the pre-extraction route. Named
 * mutation `collection-warning-dropped` (the binding a no-op) turns every case RED.
 */

const collaborators: CollectionListsCollaborators = {
  listing: { collectionMarkerKey, splitCollectionMarkerInner, renderEntryList, listingBatchPath, listingKeyOfAttributes, readListingBatch, renderListingMore },
  markers: { markersOfType, COLLECTION_MARKER_TYPE },
  entries: { parseCollectionListConfig, humanizeFieldName, entryPublicHref },
  dates: { formatDateLabel, resolveSiteTimeZoneSafely },
};
const bookType = { workspaceId: "w1", key: "books", label: "Books", status: "active", version: 1, tombstonedAt: null, fields: [{ name: "author", kind: "text" }] } as unknown as ContentTypeRecord;

/** Runs the resolver with Tovu's warning binding and returns every line written to `console.warn`. */
async function consoleLines({ html, found }: { html: string; found: ContentTypeRecord | null }): Promise<string[]> {
  const spy = mock.method(console, "warn", () => undefined);
  try {
    await resolveCollectionListsForRender({
      deps: { workspaceId: "w1", contentTypeRepo: { findByKey: async () => found }, entryRepo: { listPublishedForDisplay: async () => [] }, entryListAttribute: "data-entry-list", collaborators, warn: warnCollectionLists },
      html, pagePath: "/",
    });
    return spy.mock.calls.map((call) => String(call.arguments[0]));
  } finally {
    spy.mock.restore();
  }
}
const marker = (config: string) => `<div data-embed-config='${config}'>fallback</div>`;

test("a marker naming no content type logs the legacy no-id line", async () => {
  assert.deepEqual(await consoleLines({ html: marker('{"type":"collection"}'), found: bookType }),
    ['[collection] marker names no content type (a string "id"); leaving its authored fallback content']);
});

test("an unknown content type logs the legacy not-registered line", async () => {
  assert.deepEqual(await consoleLines({ html: marker('{"type":"collection","id":"books"}'), found: null }),
    ['[collection] no content type registered for typeKey "books"; leaving its authored fallback content']);
});

test("a rejected config logs the legacy line carrying the parser's reason", async () => {
  const lines = await consoleLines({ html: marker('{"type":"collection","id":"books","sort":"nope"}'), found: bookType });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^\[collection\] rejected marker config for typeKey "books": .+; leaving its authored fallback content$/);
});

test("more than ten distinct markers logs the legacy cap line once", async () => {
  const html = Array.from({ length: 12 }, (_, i) => marker(`{"type":"collection","id":"books","limit":${i + 1}}`)).join("");
  const lines = await consoleLines({ html, found: bookType });
  assert.equal(lines.filter((line) => line.includes("page carries")).length, 1);
  assert.ok(lines.includes("[collection] page carries 12 distinct collection marker configs; only the first 10 are resolved, the rest keep their authored fallback content"));
});
