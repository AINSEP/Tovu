import { restoredEntryRefs } from "#src/features/pages/html-inverse";
import { warnUnindexedEntryRef } from "#src/contracts/core/entry-refs/unindexed-ref-warning";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent, OutboxPort } from "@jini-ai/core/contracts/events";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemoryPagesHtmlDocumentStore } from "@jini-ai/cms/pages/html-document-store.memory";

/**
 * @file The in-memory twin of `html-document-store.go-live.test.ts` (review fix, 2026-10-21): both
 * write paths announce a page's pending go-live before moving `updatedAt` past its `publishAt`.
 */

const WS = "ws-pages-go-live";
const SAVED = "2026-10-21T10:00:00.000Z";
const GO_LIVE = "2026-10-21T12:00:00.000Z";
const LATER = "2026-10-21T13:00:00.000Z";
const GO_LIVE_ID = `page-1-entry.published-at-${GO_LIVE}`;
const clock = { nowMs: () => Date.parse(LATER) };

function recordingOutbox(): OutboxPort & { ids: string[] } {
  const ids: string[] = [];
  return { ids, enqueue: async (event: DomainEvent) => void ids.push(event.id), claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} };
}

test("InMemoryPagesHtmlDocumentStore: write and conversion after go-live announce the pending go-live", async () => {
  const page = (fields: Record<string, unknown>) =>
    buildPostRecord({ id: "page-1", workspaceId: WS, kind: "page", status: "published", publishAt: GO_LIVE, updatedAt: SAVED, version: 1, ...fields });

  const htmlRepo = new InMemoryPostRepo({}, { initialRows: [page({ bodyFormat: "html", bodyHtml: "<p>v1</p>", bodyJson: null })] });
  const written = recordingOutbox();
  const store = new InMemoryPagesHtmlDocumentStore({ scope: { workspaceId: WS, postId: "page-1" }, deps: { repo: htmlRepo, clock, outbox: written, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs } });
  await store.read();
  await store.write({ html: "<p>v2</p>" });
  assert.deepEqual(written.ids, [GO_LIVE_ID]);

  const docRepo = new InMemoryPostRepo({}, { initialRows: [page({})] });
  const converted = recordingOutbox();
  await new InMemoryPagesHtmlDocumentStore({ scope: { workspaceId: WS, postId: "page-1" }, deps: { repo: docRepo, clock, outbox: converted, reportUnindexedRef: warnUnindexedEntryRef, restoredEntryRefs } }).ensureHtmlFormat({ seedHtml: "<p>seed</p>" });
  assert.deepEqual(converted.ids, [GO_LIVE_ID]);
});
