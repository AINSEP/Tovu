import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, createPost, VERSION_CONFLICT_CODE } from "../../post/index.js";
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

test("pages_write_html and pages_write_region document the collection embed marker, including its <template> placeholders", () => {
  const { byName } = harness();
  for (const name of ["pages_write_html", "pages_write_region"]) {
    const description = byName.get(name)?.descriptor.description ?? "";
    assert.match(description, /"type":"collection"/, `${name} must mention the collection marker`);
    assert.match(description, /<template>/, `${name} must mention <template> placeholders`);
  }
});

// Regression: `&#39;` was the escape this contract used to tell the model to write for an apostrophe
// inside a marker's JSON string value, but `marker.ts`'s own `parseEmbedMarkerConfig` just calls
// `JSON.parse(raw)` on the un-decoded attribute text — an HTML entity is never decoded, so it would
// have left the six literal characters `&#39;` in the value instead of an apostrophe. `'` is a
// real JSON string escape, so `JSON.parse` turns it into an apostrophe (verified directly against
// `MARKER_PATTERN` + `JSON.parse`, not just read off the regex). The contract text still names
// `&#39;` once, as the thing NOT to do, so this only pins that the correct escape is the one actually
// told to write it.
test("pages_write_html and pages_write_region tell the model to write the JSON escape for an apostrophe", () => {
  const { byName } = harness();
  for (const name of ["pages_write_html", "pages_write_region"]) {
    const description = byName.get(name)?.descriptor.description ?? "";
    assert.match(description, /must be written as the JSON escape `\\u0027`/, `${name} must document the \\u0027 JSON escape`);
  }
});

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

// S5 (web-high fix plan, 2026-09-24) — `pages_write_html`'s catch only special-cases
// `PageNotFoundError` (`tool-registrations.ts`'s own doc); `EntityNotLiveError` is a `ToolInputError`
// and re-throws unmodified, so the model sees the Trash message.
test("pages_write_html on a trashed page rejects with the entity-liveness message", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1", "Landing");
  const row = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.ok(row);
  await repo.softDelete({ workspaceId: WS, id: "page-1", deletedAt: "2026-09-24T00:00:00.000Z", updatedAt: "2026-09-24T00:00:00.000Z", version: row.version });

  await assert.rejects(
    () => call("pages_write_html", { id: "page-1", html: `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>` }),
    { message: "ENTITY_IN_TRASH: page 'page-1' is in the Trash. Restore it from the Trash before changing it." }
  );
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

// ---------------------------------------------------------------------------
// S2 (fix plan 2026-09-24, rows 13 + 18-pages) — pages_read_html tells the truth about a doc page,
// and pages_write_html accepts a caller-stated basis for the conversion that follows.
// ---------------------------------------------------------------------------

const DOC_WITH_PARAGRAPH = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

test("pages_read_html on a doc page with content reports bodyFormat, the real version, and hasDocContent — not an empty not-found", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "page-1", title: "Landing", kind: "page", bodyJson: DOC_WITH_PARAGRAPH } });
  const row = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.ok(row);

  const result = (await call("pages_read_html", { id: "page-1" })) as {
    html: string;
    bodyFormat: string;
    version: number;
    hasDocContent: boolean;
    note?: string;
  };

  assert.equal(result.html, "");
  assert.equal(result.bodyFormat, "doc");
  assert.equal(result.version, row.version);
  assert.equal(result.hasDocContent, true);
  assert.match(String(result.note), /rich-text \(doc\) page with content/);
  assert.match(String(result.note), /revision history/);
});

test("pages_read_html on a brand-new (empty doc) page reports hasDocContent: false and no note", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "page-1", "Brand new");

  const result = (await call("pages_read_html", { id: "page-1" })) as { hasDocContent: boolean; note?: string };

  assert.equal(result.hasDocContent, false);
  assert.equal(result.note, undefined);
});

test("pages_write_html with a stale expectedVersion on a doc page rejects with the version-conflict code, and the row is untouched", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "page-1", title: "Landing", kind: "page", bodyJson: DOC_WITH_PARAGRAPH } });
  const row = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.ok(row);

  const html = `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>`;
  await assert.rejects(
    () => call("pages_write_html", { id: "page-1", html, expectedVersion: row.version - 1 }),
    { message: new RegExp(`^${VERSION_CONFLICT_CODE}:`) }
  );

  const stillThere = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.deepEqual(stillThere?.bodyJson, DOC_WITH_PARAGRAPH, "the rejected write must not have converted or touched the doc body");
  assert.equal(stillThere?.bodyFormat, "doc");
});

test("pages_write_html with the CORRECT expectedVersion on a doc page converts and writes normally", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "page-1", title: "Landing", kind: "page", bodyJson: DOC_WITH_PARAGRAPH } });
  const row = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.ok(row);

  const html = `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>`;
  const result = (await call("pages_write_html", { id: "page-1", html, expectedVersion: row.version })) as { written: boolean };

  assert.equal(result.written, true);
  const saved = await repo.findById({ workspaceId: WS, id: "page-1" });
  assert.equal(saved?.bodyFormat, "html");
  assert.equal(saved?.bodyHtml, html);
});

test("a page id that does not exist reaches the model as PAGES_NOT_FOUND input, not a redacted internal error", async () => {
  const { call } = harness();
  const html = `<section data-agent-element="hero" data-agent-role="region"><h1>Hi</h1></section>`;

  // Unwrapped, `PageNotFoundError` is a plain domain error the executor classifies as internal and
  // redacts, so the model never learns the id was simply wrong.
  await assert.rejects(() => call("pages_read_html", { id: "no-such-page" }), { name: "ToolInputError", message: /^PAGES_NOT_FOUND: / });
  await assert.rejects(() => call("pages_write_html", { id: "no-such-page", html }), { name: "ToolInputError", message: /^PAGES_NOT_FOUND: / });
});
