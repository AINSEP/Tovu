import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { PostRecord } from "#src/features/post/index";
import { resolveHtmlPageEmbeds } from "../../resolver-service.js";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render";

/**
 * @file Adversarial verification (peer-dispatched, 2026-09-05) of an externally-reported,
 * never-run finding: a page embedding the SAME `"content"` id twice with DIFFERENT per-occurrence
 * `header` options collapses to one `header` value for both occurrences, because
 * `resolveContentTypeEmbeds` (`resolver-service.ts`) stores exactly one IR entry per `ref.id` in a
 * `Map`, and `renderHtmlPageBody` (`render.ts`) looks that single entry up by id at substitution
 * time — never reading the CURRENT occurrence's own `ref.header`, even though
 * `substituteHtmlEmbeds` rebuilds a full, correct, per-occurrence `PageHtmlEmbedRef` (header
 * included) for every marker it substitutes.
 *
 * This is a scratch-then-permanent regression test: written to prove RED against the pre-fix
 * code, kept as the permanent regression test once the fix (threading the OCCURRENCE's own
 * `ref.header` through at substitution time, in `renderHtmlPageBody`) lands.
 */

const WORKSPACE_ID = "ws-header-collision";

function postRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "entity-1",
    workspaceId: WORKSPACE_ID,
    title: "A published entity",
    slug: "a-published-entity",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "page",
    updatedAt: "2026-08-11T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test('renderHtmlPageBody: two "content" markers referencing the SAME id with DIFFERENT header options must render each occurrence with ITS OWN header setting, not whichever one won the resolve-time Map collapse', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord()]);

  const html =
    `<main data-embed-config='{"type":"content","id":"entity-1","header":true}'></main>` +
    `<main data-embed-config='{"type":"content","id":"entity-1","header":false}'></main>`;

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID, html },
  });

  const output = renderHtmlPageBody(html, resolved);

  const headerCount = (output.match(/post-detail-header/g) ?? []).length;
  assert.equal(
    headerCount,
    1,
    `expected exactly ONE of the two occurrences to render the .post-detail-header block ` +
      `(the header:true one) and the other to suppress it (header:false) — got ${headerCount} ` +
      `occurrences in:\n${output}`
  );
});
