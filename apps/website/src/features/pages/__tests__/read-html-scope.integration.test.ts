import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { BatchResult } from "../../../assistant/batch-tool-inputs.js";
import { peerFixture } from "../../../server/runtime/composition/__tests__/peer-site-reads.fixture.js";
import { createPost } from "../../post/index.js";
import { PagesHtmlDocumentStore } from "../html-document-store.sqlite.js";

test("pages_read_html resolves the same slug on the selected site for single reads and mixed batches", async t => {
  const f = await peerFixture(t);
  for (const site of [f.a, f.b]) {
    const id = `${site.name}-landing`;
    await createPost({ deps: { repo: site.postRepo, clock: site.clock }, input: {
      workspaceId: site.workspaceId, id, kind: "page", slug: "/", title: `${site.name} landing`, actorId: site.ownerId,
    } });
    await new PagesHtmlDocumentStore({ workspaceId: site.workspaceId, postId: id, actorId: site.ownerId }, { db: site.kernel, clock: site.clock })
      .ensureHtmlFormat(`<section data-agent-element="hero">${site.name} hero</section><section data-agent-element="cta">${site.name} CTA</section>`);
  }
  const peer = await f.call("pages_read_html", { site: "B", slug: "/", regionId: "hero" }) as { id: string; html: string };
  assert.equal(peer.id, "B-landing");
  assert.equal(peer.html, '<section data-agent-element="hero">B hero</section>');

  // The fixture's active site reads HTML from the base route deps, not A's seeded kernel, so the
  // unscoped item proves only that its slug resolves through A's own post repository.
  const batch = await f.call("pages_read_html", { items: [
    { site: "B", slug: "/", region: "hero" },
    { site: "B", id: "B-landing", regionId: "cta" },
    { slug: "/" },
  ] }) as BatchResult;
  assert.equal(batch.succeeded, 3);
  assert.equal(batch.failed, 0);
  const rows = batch.results.map(item => (item as { result: { id: string; html: string } }).result);
  assert.deepEqual(rows.map(row => row.id), ["B-landing", "B-landing", "A-landing"]);
  assert.equal(rows[0]!.html, '<section data-agent-element="hero">B hero</section>');
  assert.equal(rows[1]!.html, '<section data-agent-element="cta">B CTA</section>');
});
