import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { createPost, updatePost } from "../../post/post";
import { InMemoryPostRepo } from "../../post/repo.memory";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory";
import { DEFAULT_PAGE_SKELETON } from "../skeleton";

/**
 * @file Regression — editing a bespoke-HTML Page's METADATA must not destroy its BODY.
 *
 * ## The bug
 *
 * `updatePost` spread `resolveBodyFields()`, which returns a hardcoded
 * `{ bodyFormat: "doc", bodyHtml: null }`. The reasoning recorded at the call site was that an html
 * Page's body is written only by `PagesHtmlDocumentStore` and never through `updatePost` — true, and
 * beside the point. An html Page's **title, slug and status** have nowhere else to be written:
 * `pages/update.ts` is the only route that can change them and it calls `updatePost`. So saving a
 * title on a generated Page reverted `body_format` to `"doc"` and nulled `body_html` — the entire
 * generated page discarded, with a 200 response and nothing surfaced to the operator.
 *
 * It had never fired because nothing could produce an `"html"` row until `ensureHtmlFormat` existed.
 * The moment the Pages editor could create one, the very first title save would have destroyed it.
 *
 * ## Why this test lives here and not in `features/post/__tests__`
 *
 * The behavior under test is a Pages guarantee ("a Page's body survives a metadata edit"). Its
 * sibling in `post/__tests__/post.body-format.test.ts` asserts the complementary Post guarantee
 * ("this chokepoint can never MAKE an html row"), and the two must not be conflated — the fix has to
 * keep both true at once, which is exactly the pair a future edit is most likely to trade off.
 */

const clock = { nowIso: () => "2026-08-05T00:00:00.000Z" };

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

/** Creates a Page and converts it to a bespoke-HTML one carrying `html`, the way the editor does. */
async function seedHtmlPage(repo: InMemoryPostRepo, html: string) {
  await createPost({
    deps: { repo, clock },
    input: { workspaceId: "ws-1", id: "page-1", title: "Pricing", kind: "page" },
  });
  const store = new InMemoryPagesHtmlDocumentStore(
    { workspaceId: "ws-1", postId: "page-1" },
    { repo, clock }
  );
  await store.ensureHtmlFormat(DEFAULT_PAGE_SKELETON);
  await store.read();
  await store.write(html);
}

test("updatePost: renaming an html-format Page keeps its bodyFormat and body_html intact", async () => {
  const repo = new InMemoryPostRepo([]);
  const generated = `<section data-agent-element="page-hero" data-agent-role="region"><h1>Pricing</h1></section>`;
  await seedHtmlPage(repo, generated);

  const { post } = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: {
      workspaceId: "ws-1",
      id: "page-1",
      title: "Pricing and plans",
      slug: "pricing-and-plans",
      bodyJson: { type: "doc", content: [] },
      status: "published",
    },
  });

  assert.equal(post.title, "Pricing and plans", "the metadata edit must still apply");
  assert.equal(post.status, "published");
  assert.equal(post.bodyFormat, "html", "a metadata edit must not convert the Page's format");
  assert.equal(post.bodyHtml, generated, "the generated body must survive verbatim");

  const saved = await repo.findById({ workspaceId: "ws-1", id: "page-1" });
  assert.equal(saved?.bodyFormat, "html", "the persisted row must match, not just the return value");
  assert.equal(saved?.bodyHtml, generated);
});

test("updatePost: a caller-supplied bodyJson is ignored on an html-format Page, never written alongside body_html", async () => {
  const repo = new InMemoryPostRepo([]);
  const generated = `<section data-agent-element="page-body" data-agent-role="region"><p>Real content</p></section>`;
  await seedHtmlPage(repo, generated);

  const { post } = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: {
      workspaceId: "ws-1",
      id: "page-1",
      title: "Pricing",
      slug: "pricing",
      // A Tiptap document aimed at a Page that has no Tiptap body. Accepting it is how BOTH body
      // columns would end up populated, which the table's CHECK constraint rejects outright.
      bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
      status: "draft",
    },
  });

  assert.equal(post.bodyFormat, "html");
  assert.equal(post.bodyHtml, generated, "the html body wins; the supplied doc must not replace it");
});

test("updatePost: a doc-format Page is unaffected — the fix must not widen the CIC-3 guarantee", async () => {
  const repo = new InMemoryPostRepo([]);
  await createPost({
    deps: { repo, clock },
    input: { workspaceId: "ws-1", id: "page-2", title: "About", kind: "page" },
  });

  const nextBody = { type: "doc", content: [{ type: "paragraph" }] };
  const { post } = await updatePost({
    deps: { repo, clock, outbox: noopOutbox },
    input: {
      workspaceId: "ws-1",
      id: "page-2",
      title: "About us",
      slug: "about-us",
      bodyJson: nextBody,
      status: "draft",
    },
  });

  assert.equal(post.bodyFormat, "doc", "a doc row stays doc — this path can still never make html");
  assert.equal(post.bodyHtml ?? null, null);
  assert.deepEqual(post.bodyJson, nextBody, "and its Tiptap body is still written from the input");
});
