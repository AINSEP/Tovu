import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { buildPagesRegistrations } from "../tool-registrations.js";

/**
 * @file The Pages agent tools — the surface the assistant actually authors pages through.
 *
 * Worth its own test because until these existed there was NO tool anywhere in the 21 wired domains
 * that could write a Page's HTML: `content_post_update` writes `bodyJson`, and on an html-format
 * Page it now ignores that field entirely. An assistant asked to "build me a landing page" had no
 * call it could make. What is certified here is that the call exists, is wired, and reaches the
 * store.
 */

const clock = { nowIso: () => "2026-08-05T00:00:00.000Z" };
const WS = "ws-1";

function harness() {
  const repo = new InMemoryPostRepo([]);
  const registrations = buildPagesRegistrations({
    workspaceId: WS,
    // Permission checks are exercised by the domain's own route tests; this harness grants, so the
    // assertions below are about the tools' behavior rather than about authz plumbing.
    authorize: async () => ({ allowed: true }),
    postRepo: repo,
    pagesHtmlStore: (scope) => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock }),
  });
  // Keyed by `descriptor.id` — the registry's own key (`ToolRegistry.register` throws on a
  // duplicate id), which is what the catalog's `name` becomes once wired.
  const byName = new Map(registrations.map((entry) => [entry.descriptor.id, entry]));
  const ctx = { principal: { id: "admin-1", kind: "user" }, signal: new AbortController().signal };

  async function call(name: string, input: Record<string, unknown>) {
    const entry = byName.get(name);
    assert.ok(entry, `tool '${name}' is not registered`);
    return entry.handler({ ...ctx, input } as never);
  }

  return { repo, byName, call };
}

async function seedPage(repo: InMemoryPostRepo, id: string, title: string) {
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id, title, kind: "page" } });
}

test("all three Pages tools are registered with the input schemas the model needs", () => {
  const { byName } = harness();
  assert.deepEqual([...byName.keys()].sort(), ["pages_read_html", "pages_write_html", "pages_write_region"]);
  for (const [name, entry] of byName) {
    assert.ok(entry.descriptor.inputSchema, `${name} must publish an input schema`);
  }
});

test("pages_write_html writes the document, births the html row, and reports its regions", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1", "Landing");

  const html =
    `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>` +
    `<section data-agent-element="cta" data-agent-role="region"><a href="/contact">Talk</a></section>`;
  const result = (await call("pages_write_html", { id: "page-1", html })) as {
    written: boolean;
    regions: string[];
    warning?: string;
  };

  assert.equal(result.written, true);
  assert.deepEqual(result.regions, ["hero", "cta"]);
  assert.equal(result.warning, undefined);

  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(saved?.bodyFormat, "html");
  assert.equal(saved?.bodyHtml, html);
});

// Was "warns when the model tagged no editable regions", asserting `written: true` plus an advisory
// `warning`. Changed 2026-09-09, deliberately and in the strict direction: an advisory on a
// successful write is not feedback — both live landing pages carry zero handles across ~42KB, so the
// warning demonstrably taught the model nothing. Untagged markup is now malformed input, refused on
// the turn it is sent. The row-is-untouched half of the property lives in
// `tool-registrations.write-region.test.ts`; this keeps the domain's own tool test honest about what
// the tool now does.
test("pages_write_html refuses markup whose top-level sections carry no editable-region handle", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1", "Landing");

  await assert.rejects(
    () => call("pages_write_html", { id: "page-1", html: "<h1>Untagged</h1>" }),
    /data-agent-element/
  );
});

test("pages_write_html refuses a post id with a reason the model can act on, not a thrown error", async () => {
  const { repo, call } = harness();
  await createPost({
    deps: { repo, clock },
    input: { workspaceId: WS, id: "post-1", title: "A blog post", kind: "post" },
  });

  // Tagged markup on purpose: the tagging check runs before the store is opened (so a refused write
  // can never one-way-convert a row), which means untagged markup here would report the tagging
  // problem instead of the wrong-id one this test is about.
  const html = `<section data-agent-element="body" data-agent-role="region"><p>x</p></section>`;
  const result = (await call("pages_write_html", { id: "post-1", html })) as {
    written: boolean;
    reason?: string;
  };

  assert.equal(result.written, false);
  assert.match(String(result.reason), /is a post, not a page/);
  assert.match(String(result.reason), /content_post_create with kind:'page'/);

  const saved = await repo.findById({ workspaceId: WS, id: "post-1" });
  assert.equal(saved?.bodyFormat, "doc", "the post must be untouched");
});

test("pages_read_html returns an empty document for a page that has never been written, not a not-found", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1", "Brand new");

  const result = (await call("pages_read_html", { id: "page-1" })) as { html: string; regions: string[] };

  assert.equal(result.html, "", "a fresh page is empty, and telling the model 'not found' would send it hunting for another id");
  assert.deepEqual(result.regions, []);
});

test("pages_read_html round-trips what pages_write_html wrote", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1", "Landing");
  const html = `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>`;
  await call("pages_write_html", { id: "page-1", html });

  const result = (await call("pages_read_html", { id: "page-1" })) as { html: string; regions: string[] };

  assert.equal(result.html, html);
  assert.deepEqual(result.regions, ["hero"]);
});
