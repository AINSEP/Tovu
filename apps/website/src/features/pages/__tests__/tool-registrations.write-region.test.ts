import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { buildPagesRegistrations } from "../tool-registrations.js";

/**
 * @file `pages_write_region` — editing ONE section of a page without rewriting the other 42KB — and
 * the optimistic-concurrency basis both page writers were missing.
 *
 * Three separate defects are certified here, and they are not independent:
 *
 * 1. **No region writer existed.** `PAGE_HTML_CONTRACT` has mandated
 *    `data-agent-element="<handle>" data-agent-role="region"` on every top-level section since
 *    SPEC-047, and `pages_read_html`'s description already promises to hand back "the list of
 *    editable region handles currently present" — but no tool could address one. Every edit was a
 *    full-body rewrite, which on the live landing pages (~42KB each) means re-emitting 42KB to
 *    change a headline, with the rest of the page at risk on every turn.
 *
 * 2. **`pages_write_html` had no `expectedVersion` at all** while `content_post_update` has taken
 *    one since 2026-09-06. That is survivable for a full rewrite (a rewrite is a deliberate
 *    "replace everything" act). It is NOT survivable for a region writer: two region edits to two
 *    DIFFERENT regions of the same page are exactly the interleaving that reads as success and
 *    silently drops one of them, because neither writer's markup mentions the other's region.
 *
 * 3. **Nothing enforced the tagging.** Both live landing pages (`landing-sample-xai-2`,
 *    `landing-sample-xai-3`) contain zero `data-agent-element` attributes across ~42KB — the model
 *    is handed the contract on every call and ignores it, and the only feedback was an advisory
 *    `warning` on a `written: true` result, which is not feedback.
 */

const clock = { nowIso: () => "2026-09-09T00:00:00.000Z" };
const WS = "ws-region";

function harness() {
  const repo = new InMemoryPostRepo([]);
  const registrations = buildPagesRegistrations({
    workspaceId: WS,
    authorize: async () => ({ allowed: true }),
    postRepo: repo,
    pagesHtmlStore: (scope) => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock }),
  });
  const byName = new Map(registrations.map((entry) => [entry.descriptor.id, entry]));
  const ctx = { principal: { id: "admin-1", kind: "user" }, signal: new AbortController().signal };

  async function call(name: string, input: Record<string, unknown>) {
    const entry = byName.get(name);
    assert.ok(entry, `tool '${name}' is not registered`);
    return entry.handler({ ...ctx, input } as never);
  }

  return { repo, byName, call };
}

async function seedPage(repo: InMemoryPostRepo, id: string) {
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id, title: "Landing", kind: "page" } });
}

/** A three-region page in the shape the contract asks for, with a `<style>` block after it — the
 *  real skeleton's own shape, so "everything outside the target region is byte-identical" is being
 *  asserted against markup that has content on BOTH sides of the target. */
const THREE_REGIONS =
  `<section data-agent-element="page-hero" data-agent-role="region" class="page-hero"><h1>Old headline</h1></section>\n` +
  `<section data-agent-element="page-body" data-agent-role="region" class="page-body"><p>Body copy.</p></section>\n` +
  `<section data-agent-element="page-cta" data-agent-role="region" class="page-cta"><a href="/contact">Talk</a></section>\n` +
  `<style>\n  .page-hero { padding: 4rem 1.5rem; }\n</style>\n`;

async function seedThreeRegionPage(call: (n: string, i: Record<string, unknown>) => Promise<unknown>, repo: InMemoryPostRepo, id: string) {
  await seedPage(repo, id);
  await call("pages_write_html", { id, html: THREE_REGIONS });
}

test("pages_write_region is registered and publishes an input schema", () => {
  const { byName } = harness();
  assert.deepEqual([...byName.keys()].sort(), ["pages_read_html", "pages_write_region", "pages_write_html"].sort());
  assert.ok(byName.get("pages_write_region")?.descriptor.inputSchema, "pages_write_region must publish an input schema");
});

test("pages_write_region replaces ONLY the addressed region — every other byte of the document survives", async () => {
  const { repo, call } = harness();
  await seedThreeRegionPage(call, repo, "page-1");

  const result = (await call("pages_write_region", {
    id: "page-1",
    handle: "page-hero",
    html: "<h1>New headline</h1><p>And a subhead.</p>",
  })) as { written: boolean; regions: string[] };

  assert.equal(result.written, true);

  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(
    saved?.bodyHtml,
    `<section data-agent-element="page-hero" data-agent-role="region" class="page-hero"><h1>New headline</h1><p>And a subhead.</p></section>\n` +
      `<section data-agent-element="page-body" data-agent-role="region" class="page-body"><p>Body copy.</p></section>\n` +
      `<section data-agent-element="page-cta" data-agent-role="region" class="page-cta"><a href="/contact">Talk</a></section>\n` +
      `<style>\n  .page-hero { padding: 4rem 1.5rem; }\n</style>\n`
  );
  assert.deepEqual(result.regions, ["page-hero", "page-body", "page-cta"]);
});

test("pages_write_region keeps the region's own tag and attributes — the handle cannot be destroyed by the write that targets it", async () => {
  const { repo, call } = harness();
  await seedThreeRegionPage(call, repo, "page-1");

  await call("pages_write_region", { id: "page-1", handle: "page-cta", html: "<p>Different call to action.</p>" });

  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.match(saved?.bodyHtml ?? "", /<section data-agent-element="page-cta" data-agent-role="region" class="page-cta"><p>Different call to action\.<\/p><\/section>/);
});

test("a handle that is not in the document is refused, and the refusal names the handles that ARE", async () => {
  const { repo, call } = harness();
  await seedThreeRegionPage(call, repo, "page-1");

  await assert.rejects(
    () => call("pages_write_region", { id: "page-1", handle: "page-pricing", html: "<p>x</p>" }),
    (err: Error) => {
      assert.match(err.message, /page-pricing/);
      assert.match(err.message, /page-hero/);
      assert.match(err.message, /page-body/);
      assert.match(err.message, /page-cta/);
      return true;
    }
  );
});

test("a handle carried by two elements is refused rather than guessed — an address that resolves to two places is not an address", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1");
  await call("pages_write_html", {
    id: "page-1",
    html:
      `<section data-agent-element="dup" data-agent-role="region"><p>first</p></section>` +
      `<section data-agent-element="dup" data-agent-role="region"><p>second</p></section>`,
  });

  await assert.rejects(
    () => call("pages_write_region", { id: "page-1", handle: "dup", html: "<p>x</p>" }),
    /2 elements|twice|ambiguous/i
  );
});

test("a region containing a nested same-tag element is replaced whole — the splice does not stop at the first inner </section>", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1");
  await call("pages_write_html", {
    id: "page-1",
    html:
      `<section data-agent-element="outer" data-agent-role="region"><section class="inner"><p>nested</p></section><p>tail</p></section>` +
      `<section data-agent-element="after" data-agent-role="region"><p>after</p></section>`,
  });

  await call("pages_write_region", { id: "page-1", handle: "outer", html: "<p>replaced</p>" });

  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(
    saved?.bodyHtml,
    `<section data-agent-element="outer" data-agent-role="region"><p>replaced</p></section>` +
      `<section data-agent-element="after" data-agent-role="region"><p>after</p></section>`
  );
});

test("pages_write_region rejects a stale expectedVersion and writes NOTHING — two region edits cannot silently clobber each other", async () => {
  const { repo, call } = harness();
  await seedThreeRegionPage(call, repo, "page-1");

  const read = (await call("pages_read_html", { id: "page-1" })) as { version: number };
  assert.equal(typeof read.version, "number");

  // A second editor lands in between, touching a DIFFERENT region — the interleaving that reads as
  // success on both sides and silently drops one edit.
  await call("pages_write_region", { id: "page-1", handle: "page-body", html: "<p>Someone else's edit.</p>" });

  await assert.rejects(
    () => call("pages_write_region", { id: "page-1", handle: "page-hero", html: "<h1>Stale.</h1>", expectedVersion: read.version }),
    /VERSION_CONFLICT/
  );

  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.match(saved?.bodyHtml ?? "", /Someone else's edit\./, "the other editor's write must survive");
  assert.doesNotMatch(saved?.bodyHtml ?? "", /Stale\./, "the stale write must not have landed");
});

test("pages_write_html rejects a stale expectedVersion and writes NOTHING", async () => {
  const { repo, call } = harness();
  await seedThreeRegionPage(call, repo, "page-1");

  const read = (await call("pages_read_html", { id: "page-1" })) as { version: number };
  assert.equal(typeof read.version, "number", "pages_read_html must hand back the basis a writer can state");

  // Interleaved through the OTHER writer on purpose, so this test fails for its own reason even
  // while `pages_write_region` does not exist yet.
  await call("pages_write_html", {
    id: "page-1",
    html: `<section data-agent-element="page-hero" data-agent-role="region"><h1>Someone else's edit.</h1></section>`,
  });

  await assert.rejects(
    () =>
      call("pages_write_html", {
        id: "page-1",
        html: `<section data-agent-element="page-hero" data-agent-role="region"><h1>Stale rewrite.</h1></section>`,
        expectedVersion: read.version,
      }),
    /VERSION_CONFLICT/
  );

  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.match(saved?.bodyHtml ?? "", /Someone else's edit\./);
  assert.doesNotMatch(saved?.bodyHtml ?? "", /Stale rewrite\./);
});

test("a malformed expectedVersion is rejected on both writers rather than coerced to 'no basis sent'", async () => {
  const { repo, call } = harness();
  await seedThreeRegionPage(call, repo, "page-1");

  await assert.rejects(
    () => call("pages_write_html", { id: "page-1", html: THREE_REGIONS, expectedVersion: 3.5 }),
    /non-negative integer/
  );
  await assert.rejects(
    () => call("pages_write_region", { id: "page-1", handle: "page-hero", html: "<h1>x</h1>", expectedVersion: "3" }),
    /non-negative integer/
  );
});

test("pages_write_html REFUSES untagged top-level markup instead of warning about it after the fact", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1");

  await assert.rejects(
    () => call("pages_write_html", { id: "page-1", html: "<h1>Untagged</h1><p>No handles anywhere.</p>" }),
    /data-agent-element/
  );

  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(saved?.bodyHtml ?? null, null, "a refused write must not have converted or written the row");
});

test("the untagged-markup refusal suggests a handle derived from the section's own heading, never a positional one", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1");

  await assert.rejects(
    () =>
      call("pages_write_html", {
        id: "page-1",
        html: `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section><section><h2>Our Pricing</h2></section>`,
      }),
    (err: Error) => {
      assert.match(err.message, /our-pricing/, `expected a heading-derived handle suggestion; got: ${err.message}`);
      assert.doesNotMatch(err.message, /section-\d/, "a positional handle churns between turns and must never be suggested");
      return true;
    }
  );
});

test("a <style> block at top level needs no handle — the tagging rule is about sections, not about every node", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1");

  const result = (await call("pages_write_html", {
    id: "page-1",
    html: `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>\n<style>.x{color:red}</style>`,
  })) as { written: boolean };

  assert.equal(result.written, true);
});
