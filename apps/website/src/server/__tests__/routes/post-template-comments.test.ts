/** Comments build 2026-10-21: the Starter post template's `comments` marker renders the built-in thread. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import type { CommentRecord } from "@jini-ai/cms/comments";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemoryPostRepo } from "#src/features/post/index";
import { loadTheme } from "#src/features/theme/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { renderViaTemplate } from "../../inbound/public-http/routes/site/pages.js";

const root = path.resolve(import.meta.dirname, "../../../../../..");

function comment(patch: Partial<CommentRecord> & Pick<CommentRecord, "id" | "workspaceId" | "entryId">): CommentRecord {
  return { parentId: null, threadRootId: patch.id, depth: 0, status: "approved", authorPrincipalId: null, authorName: "Ada",
    authorEmail: "ada-private@example.test", authorUrl: null, authorIpHash: "IP_HASH_PRIVATE", bodyText: "Approved hello",
    spamScore: null, spamProvider: null, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z", version: 0, ...patch };
}

test("comments: the Starter post template shows approved comments + the no-JS form, never held rows or private fields, and nothing once disabled", async () => {
  const theme = loadTheme({ themeDir: path.join(root, "content/themes/static/tovu-starter"), id: "tovu-starter", source: "built-in" });
  assert.equal(theme.status, "valid", JSON.stringify(theme.errors));
  const deps = createRouteDeps();
  const post = buildPostRecord({ workspaceId: deps.workspaceId, templateChoice: "posts-default.html", status: "published" });
  deps.postRepo = new InMemoryPostRepo([post]);
  await deps.commentsSettingsReady;
  await deps.commentRepo.create({ record: comment({ id: "c-ok", workspaceId: deps.workspaceId, entryId: post.id }) });
  await deps.commentRepo.create({ record: comment({ id: "c-held", workspaceId: deps.workspaceId, entryId: post.id, status: "pending", bodyText: "HELD_BODY" }) });

  const html = await renderViaTemplate(deps, theme, post, undefined);
  assert.match(html, /<section class="post-comments wrap"[^>]*><div data-comments-surface><section id="comments"/);
  assert.match(html, /Approved hello/);
  assert.match(html, new RegExp(`<form method="post" action="/api/site/comments"><input type="hidden" name="entryId" value="${post.id}">`));
  for (const hidden of ["HELD_BODY", "ada-private@example.test", "IP_HASH_PRIVATE", "data-embed-config='{\"type\":\"comments\"}'"]) {
    assert.ok(!html.includes(hidden), hidden);
  }

  const { revision } = await deps.commentsProviders!.active({ siteId: deps.workspaceId });
  await deps.commentsProviders!.select({ siteId: deps.workspaceId, providerId: null, expectedRevision: revision, actorPrincipalId: await deps.ownerPrincipalId });
  const off = await renderViaTemplate(deps, theme, post, undefined);
  assert.doesNotMatch(off, /Approved hello|<form method="post" action="\/api\/site\/comments"/, "disable takes effect on the very next render (no cache)");
  assert.match(off, /data-comments-surface><\/div>/);
});
