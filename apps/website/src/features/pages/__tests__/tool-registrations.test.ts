import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv from "ajv";
import { EMBED_MARKER_TARGET_KEYS, parseEmbedMarkerConfig, parseGalleryConfig } from "@jini-ai/cms/widgets/markers";

import { InMemoryPostRepo, createPost, VERSION_CONFLICT_CODE } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { discoverAllBuiltInThemes, requestThemePreviewRefresh, type DiscoveredTheme } from "../../theme/index.js";
import { buildPagesRegistrations, type PagesToolDeps } from "../tool-registrations.js";
import { PageConcurrentEditError, PageNotFoundError, type PagesHtmlDocumentStorePort } from "../html-document-store.sqlite.js";

/**
 * @file The Pages agent tools — the surface the assistant actually authors pages through.
 *
 * Worth its own test because until these existed there was NO tool anywhere in the 21 wired domains
 * that could write a Page's HTML: `content_post_update` writes `bodyJson`, and on an html-format
 * Page it now ignores that field entirely. An assistant asked to "build me a landing page" had no
 * call it could make. What is certified here is that the call exists, is wired, and reaches the
 * store.
 */

const clock = { nowMs: () => Date.parse("2026-08-05T00:00:00.000Z") };
const WS = "ws-1";

function harness(
  themeDeps: Pick<PagesToolDeps, "themes" | "themesDir" | "resolveActiveThemeId"> = {},
  storeFactory?: PagesToolDeps["pagesHtmlStore"],
) {
  const repo = new InMemoryPostRepo([]);
  const registrations = buildPagesRegistrations({
    ...themeDeps,
    workspaceId: WS,
    // Permission checks are exercised by the domain's own route tests; this harness grants, so the
    // assertions below are about the tools' behavior rather than about authz plumbing.
    authorize: async () => ({ allowed: true, reason: "matched" }),
    postRepo: repo,
    pagesHtmlStore: storeFactory ?? ((scope) => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock })),
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

test('page authoring tools show a valid gallery marker and describe its required image/layout contract', () => {
  const { byName } = harness();
  for (const name of ['pages_write_html', 'pages_write_region']) {
    const description = byName.get(name)?.descriptor.description ?? '';
    const match = /<div data-embed-config='([^']*"type":"gallery"[^']*)'/.exec(description);
    assert.ok(match, `${name} must include usable gallery HTML`);
    const config = JSON.parse(match[1]!);
    assert.equal(config.type, 'gallery');
    assert.deepEqual(parseGalleryConfig({ config }).errors, []);
    const mediaMatch = /<div data-embed-config='([^']*"type":"media"[^']*)'/.exec(description);
    assert.ok(mediaMatch, `${name} must include usable Media HTML`);
    assert.deepEqual(JSON.parse(mediaMatch[1]), { type: 'media', content: { mode: 'media', items: [{ slug: 'photo-slug', alt: 'Description' }], layout: 'grid' } });
    assert.match(description, /grid\|carousel\|masonry/);
    assert.match(description, /alt/);
    assert.match(description, /lightbox/);
  }
});

// Regression (2026-10-05): the contract named only collection/widget/media/menu/post-previews, so the
// model never learned `{"type":"form"}` (restored 2026-10-04) — or taxonomy/post/content/partial —
// existed, and wrote "I can't add a form" instead of embedding a real one. The list is now derived
// from `EMBED_MARKER_TARGET_KEYS`, the marker vocabulary every resolver reads, so this pins parity.
test("pages_write_html and pages_write_region name every embed marker type the resolvers support", () => {
  const { byName } = harness();
  for (const name of ["pages_write_html", "pages_write_region"]) {
    const description = byName.get(name)?.descriptor.description ?? "";
    for (const type of Object.keys(EMBED_MARKER_TARGET_KEYS)) {
      assert.ok(description.includes(`{"type":"${type}"`), `${name} must document the '${type}' embed marker`);
    }
    assert.match(description, /\{"type":"form","id":"<form id or slug>"\}/, `${name} must show the form marker's target`);
    assert.match(description, /forms_list_definitions/, `${name} must point at where a form's id comes from`);
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
    const escape = description.match(/must be written as the JSON escape `([^`]+)`/)?.[1];
    assert.ok(escape, `${name} must supply an escape`);
    const example = description.match(/`(\{"type":"collection","id":"<content-type-key>"\})`/)?.[1];
    assert.ok(example, `${name} must supply the collection example`);
    assert.deepEqual(parseEmbedMarkerConfig({ raw: example.replace("<content-type-key>", `reader${escape}s`) }), { config: { type: "collection", id: "reader\'s" } });
    assert.match(description, /must be written as the JSON escape `\\u0027`/, `${name} must document the \\u0027 JSON escape`);
  }
});

test("all four Pages tools are registered with the input schemas the model needs", () => {
  const { byName } = harness();
  assert.deepEqual([...byName.keys()].sort(), ["pages_move_region", "pages_read_html", "pages_write_html", "pages_write_region"]);
  for (const [name, entry] of byName) {
    const schema = entry.descriptor.inputSchema as { type: string; required: string[]; properties: Record<string, { type: string; minimum?: number }> };
    assert.ok(schema, `${name} must publish an input schema`);
    // why: N3 (42773ffa) made regionId the canonical region field; handle/region are executor-side aliases only.
    const required = name === "pages_read_html" ? [] : name === "pages_write_html" ? ["id", "html"] : name === "pages_write_region" ? ["id", "regionId", "html"] : ["id", "regionId"];
    assert.equal(schema.type, "object");
    assert.deepEqual(schema.required ?? [], required);
    for (const field of required) assert.equal(schema.properties[field].type, "string", `${name}.${field}`);
    const validate = new Ajv().compile(schema);
    const valid: Record<string, string> = name === "pages_read_html" ? { id: "hero" } : Object.fromEntries(required.map((field) => [field, field === "html" ? "<p>Hi</p>" : "hero"]));
    assert.equal(validate(valid), true, `${name}: ${JSON.stringify(validate.errors)}`);
    for (const field of required) {
      const missing = { ...valid }; delete missing[field];
      assert.equal(validate(missing), false, `${name} requires ${field}`);
      assert.equal(validate({ ...valid, [field]: 42 }), false, `${name}.${field} must be a string`);
    }
    if (name !== "pages_read_html") {
      assert.equal(schema.properties.expectedVersion.type, "integer");
      assert.equal(schema.properties.expectedVersion.minimum, 0);
      assert.equal(validate({ ...valid, expectedVersion: 0 }), true);
      for (const expectedVersion of ["1", -1, 1.5]) assert.equal(validate({ ...valid, expectedVersion }), false);
    }
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

// todos 281: observe the tool output, including empty pages, mode overrides and runtime theme switches.
test("pages_read_html supplies the resolved theme vocabulary on both empty and authored pages", async () => {
  const theme = (id: string, tokens: Record<string, string>, tokensLight = {}): DiscoveredTheme => ({
    manifest: { id }, status: "valid", tokens, tokensLight,
  } as DiscoveredTheme);
  const ink = theme("fashion", { "--ink": "#eee", "--line": "#444" }, { "--ink": "#111" });
  const fg = theme("classic", { "--fg": "#eee", "--border": "#444" });
  let activeId = "fashion";
  const { repo, call } = harness({ themes: [ink, fg], resolveActiveThemeId: async () => activeId });
  await seedPage(repo, "themed-page", "Landing");
  const read = () => call("pages_read_html", { id: "themed-page" }) as Promise<{ theme: unknown }>;
  assert.deepEqual((await read()).theme, { id: "fashion", tokens: ink.tokens, tokensLight: ink.tokensLight });
  await call("pages_write_html", { id: "themed-page", html: '<section data-agent-element="hero" data-agent-role="region">Hello</section>' });
  activeId = "classic";
  assert.deepEqual((await read()).theme, { id: "classic", tokens: fg.tokens, tokensLight: {} });
  activeId = "none";
  assert.equal((await read()).theme, null);
});

test("page token vocabulary follows the renderer fallback when the configured theme is missing", async () => {
  const fallback = { manifest: { id: "tovu-theme" }, status: "valid", tokens: { "--fg": "#fff" }, tokensLight: {} } as unknown as DiscoveredTheme;
  const { repo, call } = harness({ themes: [fallback], resolveActiveThemeId: async () => "removed" });
  await seedPage(repo, "fallback-page", "Landing");
  const result = await call("pages_read_html", { id: "fallback-page" }) as { theme: { id: string; tokens: unknown } };
  assert.equal(result.theme.id, "tovu-theme");
  assert.deepEqual(result.theme.tokens, fallback.tokens);
});

test("standalone page reads have no fabricated theme vocabulary", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "unstyled-page", "Landing");
  assert.equal((await call("pages_read_html", { id: "unstyled-page" }) as { theme: unknown }).theme, null);
});

test("a failed theme lookup is reported instead of returning invented styling guidance", async () => {
  const { repo, call } = harness({ themes: [], resolveActiveThemeId: async () => { throw new Error("theme settings unavailable"); } });
  await seedPage(repo, "lookup-failed", "Landing");
  await assert.rejects(() => call("pages_read_html", { id: "lookup-failed" }), { message: "theme settings unavailable" });
});

test("a site with no installed theme returns no token vocabulary", async () => {
  const { repo, call } = harness({ themes: [], resolveActiveThemeId: async () => "missing" });
  await seedPage(repo, "no-theme-installed", "Landing");
  assert.equal((await call("pages_read_html", { id: "no-theme-installed" }) as { theme: unknown }).theme, null);
});

test("a page store that reads without capturing a version fails closed", async () => {
  const { call } = harness({}, () => ({
    read: async () => '<section data-agent-element="hero">Hello</section>',
    capturedVersion: () => null,
    ensureHtmlFormat: async () => { assert.fail("a read must not convert the page"); },
    write: async () => { assert.fail("a missing version must never allow a write"); },
  }));
  await assert.rejects(call("pages_read_html", { id: "broken-store" }), {
    message: "pages tool: the store captured no version after a successful read — the write guard has nothing to condition on",
  });
});

test("a theme roster without an active-theme resolver supplies no invented vocabulary", async () => {
  const { repo, call } = harness({ themes: [] });
  await seedPage(repo, "unresolved", "Landing");
  assert.equal((await call("pages_read_html", { id: "unresolved" }) as { theme: unknown }).theme, null);
});

test("a doc page without a content array is reported as empty", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "empty-doc", title: "Landing", kind: "page", bodyJson: { type: "doc" } } });
  const result = await call("pages_read_html", { id: "empty-doc" }) as { html: string; hasDocContent: boolean; note?: string };
  assert.equal(result.html, "");
  assert.equal(result.hasDocContent, false);
  assert.equal(result.note, undefined);
});

test("reading a post through the page tool does not advertise an empty page to author", async () => {
  const { repo, call } = harness();
  await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "post-1", title: "Post", kind: "post" } });
  await assert.rejects(call("pages_read_html", { id: "post-1" }), { name: "ToolInputError", message: /^PAGES_NOT_FOUND: / });
});

test("a page trashed between the HTML read and fallback lookup is not reported as authorable", async () => {
  const h = harness({}, scope => {
    const store = new InMemoryPagesHtmlDocumentStore(scope, { repo: h.repo, clock });
    const read = store.read.bind(store);
    store.read = async () => {
      try {
        return await read();
      } catch (error) {
        if (!(error instanceof PageNotFoundError)) throw error;
        const row = await h.repo.findById({ workspaceId: WS, id: scope.postId });
        assert.ok(row);
        await h.repo.softDelete({ workspaceId: WS, id: row.id, deletedAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z", version: row.version });
        throw error;
      }
    };
    return store;
  });
  await seedPage(h.repo, "trashed-during-read", "Landing");
  await assert.rejects(h.call("pages_read_html", { id: "trashed-during-read" }), { name: "ToolInputError", message: /^PAGES_NOT_FOUND: / });
  const saved = await h.repo.findById({ workspaceId: WS, id: "trashed-during-read" });
  assert.equal(saved?.deletedAt, "2026-08-05T00:00:00.000Z");
  assert.equal(saved?.bodyFormat, "doc");
});

test("page reads refresh theme vocabulary after an external theme edit", async (t) => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-page-theme-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const themeDir = path.join(themesDir, "static", "ink");
  fs.mkdirSync(path.join(themeDir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(themeDir, "theme.json"), JSON.stringify({ id: "ink", name: "Ink", version: "1.0.0", tier: "declarative", engine: 1 }));
  fs.writeFileSync(path.join(themeDir, "tokens.json"), JSON.stringify({ "--ink": "#111" }));
  fs.writeFileSync(path.join(themeDir, "styles.css"), "body{margin:0}");
  fs.writeFileSync(path.join(themeDir, "templates", "home.json"), '{"type":"doc","content":[]}');
  fs.writeFileSync(path.join(themeDir, "templates", "entry.json"), '{"type":"doc","content":[]}');
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  const { repo, call } = harness({ themes, themesDir, resolveActiveThemeId: async () => "ink" });
  await seedPage(repo, "disk-themed", "Landing");
  const readTheme = async () => (await call("pages_read_html", { id: "disk-themed" }) as { theme: { id: string; tokens: Record<string, string> } }).theme;
  assert.equal((await readTheme()).tokens["--ink"], "#111");
  fs.writeFileSync(path.join(themeDir, "tokens.json"), JSON.stringify({ "--ink": "#abc" }));
  requestThemePreviewRefresh({ themesDir }, { revision: "page-theme-updated" });
  const refreshed = await readTheme();
  assert.equal(refreshed.id, "ink");
  assert.equal(refreshed.tokens["--ink"], "#abc");
});

const FAULT_PAGE = '<section data-agent-element="a">A</section><section data-agent-element="b">B</section>';
// why: handlers are called directly (no executor alias hook), so region tools take canonical regionId (N3, 42773ffa).
const WRITES = [
  ["pages_write_html", { id: "page-1", html: '<section data-agent-element="a">Updated</section>' }],
  ["pages_write_region", { id: "page-1", regionId: "a", html: "Updated" }],
  ["pages_move_region", { id: "page-1", regionId: "b", before: "a" }],
] as const;

for (const [tool, input] of [["pages_read_html", { id: "page-1" }], ...WRITES] as const) {
  test(`${tool} propagates a store read failure without writing`, async () => {
    const failure = new Error("page storage unavailable");
    const store: PagesHtmlDocumentStorePort = {
      read: async () => { throw failure; },
      capturedVersion: () => null,
      write: async () => { assert.fail("a failed read must never write"); },
      ensureHtmlFormat: async () => { assert.fail("a storage failure must never convert the page"); },
    };
    const { call } = harness({}, () => store);
    await assert.rejects(call(tool, input), error => error === failure);
  });
}

for (const [tool, input] of WRITES) {
  for (const concurrent of [false, true]) {
    test(`${tool} ${concurrent ? "explains a compare-and-set conflict" : "propagates a storage write failure"} without altering the body`, async () => {
      const failure = concurrent ? new PageConcurrentEditError("page changed during the write") : new Error("page storage unavailable");
      const pending: string[] = [];
      const store: PagesHtmlDocumentStorePort = {
        read: async () => FAULT_PAGE,
        capturedVersion: () => 1,
        ensureHtmlFormat: async () => { assert.fail("the page already has HTML"); },
        write: async html => { pending.push(html); throw failure; },
      };
      const { call } = harness({}, () => store);
      await assert.rejects(call(tool, input), error => {
        if (!concurrent) return error === failure;
        assert.ok(error instanceof Error);
        assert.equal(error.name, "ToolInputError");
        assert.equal(error.message, "VERSION_CONFLICT: page changed during the write. Nothing was written. Re-read the page with pages_read_html, reapply your change to the body you get back, and resend.");
        return true;
      });
      assert.equal(pending.length, 1, "the failure must occur at the write boundary");
      assert.notEqual(pending[0], FAULT_PAGE);
      assert.equal(await store.read(), FAULT_PAGE);
    });
  }
}

for (const [tool, input] of WRITES) {
  test(`${tool} refuses a negative expectedVersion without changing the page`, async () => {
    const { repo, call } = harness();
    await seedPage(repo, "page-1", "Landing");
    await call("pages_write_html", { id: "page-1", html: FAULT_PAGE });
    const before = structuredClone(await repo.findById({ workspaceId: WS, id: "page-1" }));

    await assert.rejects(call(tool, { ...input, expectedVersion: -1 }), {
      name: "ToolInputError",
      message: "'expectedVersion' must be a non-negative integer when present",
    });

    assert.deepEqual(await repo.findById({ workspaceId: WS, id: "page-1" }), before);
  });
}

test("a region edit on legacy HTML without handles explains that there are no regions and preserves the page", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "legacy", "Legacy");
  // Legacy markup enters through the store: the tools correctly refuse to author untagged HTML.
  const store = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "legacy" }, { repo, clock });
  await store.ensureHtmlFormat("<p>Keep this legacy copy.</p>");
  const before = structuredClone(await repo.findById({ workspaceId: WS, id: "legacy" }));

  // why: direct handler call bypasses the alias hook; regionId is the canonical field since N3 (42773ffa).
  await assert.rejects(call("pages_write_region", { id: "legacy", regionId: "hero", html: "Replacement" }), {
    name: "ToolInputError",
    message:
      'Nothing was written: page \'legacy\' has no region with data-agent-element="hero" — it has none at all. ' +
      "Call pages_read_html to see the current handles, and target one of those; if the section you want does not exist " +
      "yet, add it with pages_write_html.",
  });

  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "legacy" }), before);
});

test("an unclosed region is refused with repair guidance and its stored HTML survives", async () => {
  const { repo, call } = harness();
  await seedPage(repo, "unclosed", "Unclosed");
  const store = new InMemoryPagesHtmlDocumentStore({ workspaceId: WS, postId: "unclosed" }, { repo, clock });
  await store.ensureHtmlFormat('<section data-agent-element="hero"><p>Keep the unclosed section.</p>');
  const before = structuredClone(await repo.findById({ workspaceId: WS, id: "unclosed" }));

  // why: direct handler call bypasses the alias hook; regionId is the canonical field since N3 (42773ffa).
  await assert.rejects(call("pages_write_region", { id: "unclosed", regionId: "hero", html: "Replacement" }), {
    name: "ToolInputError",
    message:
      'Nothing was written: the <section> carrying data-agent-element="hero" in page \'unclosed\' has no closing ' +
      "tag in the stored markup, so it delimits no content to replace. Repair the page with pages_write_html.",
  });

  assert.deepEqual(await repo.findById({ workspaceId: WS, id: "unclosed" }), before);
});

// L254: pin the old read handler's fallback before flattening its nested catch.
for (const { bodyJson, hasDocContent } of [
  { bodyJson: { type: "doc" }, hasDocContent: false },
  { bodyJson: { type: "doc", content: [] }, hasDocContent: false },
  { bodyJson: DOC_WITH_PARAGRAPH, hasDocContent: true },
]) {
  test(`L254 doc fallback preserves every response field for ${JSON.stringify(bodyJson)}`, async () => {
    const { repo, call } = harness();
    await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "fallback", title: "Landing", kind: "page", bodyJson } });
    const before = structuredClone(await repo.findById({ workspaceId: WS, id: "fallback" }));
    assert.ok(before);
    const result = await call("pages_read_html", { id: "fallback" });
    assert.deepEqual(result, {
      id: "fallback", html: "", regions: [], bodyFormat: "doc", version: before.version,
      hasDocContent, theme: null,
      ...(hasDocContent ? { note: "This page is a rich-text (doc) page with content. pages_write_html converts it to HTML and " +
        "replaces that rich-text body; the previous body is kept in the page's revision history." } : {}),
    });
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: "fallback" }), before);
  });
}

test("L254 an unrelated read failure propagates without consulting the doc fallback", async () => {
  const failure = new Error("read unavailable");
  const { repo, call } = harness({}, () => ({
    read: async () => { throw failure; },
    capturedVersion: () => null,
    ensureHtmlFormat: async () => { assert.fail("read must not convert"); },
    write: async () => { assert.fail("read must not write"); },
  }));
  repo.findById = async () => { assert.fail("unrelated read failures must not look up a doc row"); };
  await assert.rejects(call("pages_read_html", { id: "fallback" }), error => error === failure);
});

for (const state of ["missing", "post", "trashed"] as const) {
  test(`L254 a ${state} row cannot become an authorable doc fallback`, async () => {
    const { repo, call } = harness({}, () => ({
      read: async () => { throw new PageNotFoundError("original read failure"); },
      capturedVersion: () => null,
      ensureHtmlFormat: async () => { assert.fail("read must not convert"); },
      write: async () => { assert.fail("read must not write"); },
    }));
    if (state !== "missing") {
      await createPost({ deps: { repo, clock }, input: { workspaceId: WS, id: "fallback", title: "Landing", kind: state === "post" ? "post" : "page" } });
    }
    if (state === "trashed") {
      const row = await repo.findById({ workspaceId: WS, id: "fallback" });
      assert.ok(row);
      await repo.softDelete({ workspaceId: WS, id: row.id, version: row.version, deletedAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z" });
    }
    const before = structuredClone(await repo.findById({ workspaceId: WS, id: "fallback" }));
    await assert.rejects(call("pages_read_html", { id: "fallback" }), {
      name: "ToolInputError", message: "PAGES_NOT_FOUND: original read failure",
    });
    assert.deepEqual(await repo.findById({ workspaceId: WS, id: "fallback" }), before);
  });
}

test("L254 a successful HTML read returns the captured version without a fallback lookup", async () => {
  const html = '<section data-agent-element="hero">Hello</section>';
  const { repo, call } = harness({}, () => ({
    read: async () => html,
    capturedVersion: () => 7,
    ensureHtmlFormat: async () => { assert.fail("read must not convert"); },
    write: async () => { assert.fail("read must not write"); },
  }));
  repo.findById = async () => { assert.fail("HTML reads must not consult the doc fallback"); };
  assert.deepEqual(await call("pages_read_html", { id: "fallback" }), {
    id: "fallback", html, regions: ["hero"], version: 7, theme: null,
  });
});
