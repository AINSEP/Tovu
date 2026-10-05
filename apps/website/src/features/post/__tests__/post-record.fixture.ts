import type { PostRecord } from "../post.js";

/**
 * @file The one shared `PostRecord` builder for tests.
 *
 * `PostRecord` gains required fields over time (`bodyFormat`/`bodyHtml`, SPEC-047/ADR-056 Decision 3),
 * and every hand-rolled literal then stops type-checking at once. Building through here keeps a new
 * required field a one-line change: give it its `createPost` value below and every caller is current.
 */

/**
 * Builds a live, published `"doc"` post, with `fields` overriding any default.
 *
 * Defaults match what `createPost` writes for a plain post: `bodyFormat: "doc"`, `bodyHtml: null`
 * (an `"html"` body is only ever written by `PagesHtmlDocumentStore`), version 1, no trash marker.
 *
 * @param fields the values the test cares about; everything else takes the default.
 * @returns a fresh record; nested `bodyJson` is not shared between calls.
 * @complexity O(fields), one spread.
 */
export function buildPostRecord(fields: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: "workspace-1",
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-04-06T00:00:00.000Z",
    version: 1,
    ...fields,
  };
}
