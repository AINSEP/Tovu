import assert from "node:assert/strict";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import type { AssignedTermView, EntryTermReadPort } from "#src/features/taxonomy/repo.sqlite";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Regression coverage for the taxonomy render-surface gap fix (2026-09-02): categories/tags
 * had a complete WRITE path (`assign-terms.ts` -> `entry_terms`) and no READ path — a term assigned
 * to a page/post rendered nowhere on the public site. Mirrors `pages-branch-coverage.integration
 * .test.ts`'s own `testDeps`/fixture-builder pattern (real HTTP round trip via `startTestServer`,
 * asserting the actual response body — not an internal render variable).
 *
 * The first two tests below cover the `static`-tier "no explicit templateChoice" page-shell-fallback
 * branch (`resolveStaticTierPageShellFallback` -> `renderViaTemplate`) — the SAME branch the live
 * proof page (`/testing-page`, an `html`-format Page with no `templateChoice`) renders through.
 *
 * 2026-09-03 follow-up — the `declarative`/`templated`/`handlebars` tiers' own render paths
 * (`render.ts`'s `renderPostBody`, shared by `buildTemplateRenderData`'s `post.content`, the
 * declarative `"content"` slot, and the tierless `entryContent` fallback) were a disclosed gap this
 * fix did not originally close; the three tests after the "no terms assigned" one below close it,
 * one per tier, each rendering through `renderGenericPostPage` (never `renderViaTemplate` — none of
 * these three tiers can ever satisfy `isEligibleForTemplateBranch`'s `tier === "static"` gate).
 */

const WORKSPACE_ID = "workspace-local";

function testDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), ...overrides };
}

/** A minimal static-tier theme shipping only `page-shell.html` — the same canonical, content-slot-
 *  bearing document `resolveStaticTierPageShellFallback` looks up by convention (no `templates`
 *  array entry needed; that gate is bypassed on this fallback branch, see this function's own doc). */
function pageShellTheme(): DiscoveredTheme {
  return {
    manifest: {
      id: "page-shell-terms-integration-theme",
      name: "Page Shell Terms Integration Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/page-shell-terms-integration-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "page-shell": `<html><body><article><div data-embed-config='{"type":"content"}'></div></article></body></html>`,
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function htmlPageWithNoTemplateChoice(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "page-with-terms-int",
    workspaceId: WORKSPACE_ID,
    title: "Page With Terms",
    slug: "page-with-terms-int",
    bodyJson: null,
    bodyFormat: "html",
    bodyHtml: "<p>Hello from a taxonomy-tagged page.</p>",
    status: "published",
    kind: "page",
    templateChoice: undefined,
    updatedAt: "2026-09-02T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as unknown as PostRecord;
}

/** Returns the fixed two-row assignment (`QA` Category, `e2e` Tag) for exactly
 *  `(expectedContentType, expectedContentId)`, and nothing for any other pair — mirrors the real
 *  `entry_terms` rows already live on `/testing-page` in the dev DB (`content_type='page'`), the proof
 *  case this fix targets. `expectedContentType` defaults to `"page"` (every pre-existing caller of
 *  this helper renders a Page) — the declarative/templated/handlebars-tier tests below pass
 *  `"post"` explicitly, since they render a `kind: "post"` row and Pages/Posts are different things
 *  in this codebase (same `content_type` column, different `PostRecord.kind` values). */
function stubEntryTermReadRepo(expectedContentId: string, expectedContentType: "page" | "post" = "page"): EntryTermReadPort {
  const rows: readonly AssignedTermView[] = [
    { termId: "term-qa", termName: "QA", taxonomyName: "Category" },
    { termId: "term-e2e", termName: "e2e", taxonomyName: "Tag" },
  ];
  return {
    async listForContent(params) {
      return params.contentType === expectedContentType && params.contentId === expectedContentId ? rows : [];
    },
  };
}

test("integration: GET /:slug renders a Page's assigned category/tag terms as plain labels (no term-archive route exists)", async (t) => {
  const post = htmlPageWithNoTemplateChoice();
  const app = createApp(
    testDeps({
      themes: [pageShellTheme()],
      postRepo: new InMemoryPostRepo([post]),
      entryTermReadRepo: stubEntryTermReadRepo(post.id),
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/page-with-terms-int`);
  assert.equal(res.status, 200);
  const html = await res.text();

  assert.ok(html.includes(">QA<"), "expected the assigned Category term 'QA' to render in the page HTML");
  assert.ok(html.includes(">e2e<"), "expected the assigned Tag term 'e2e' to render in the page HTML");
  // Plain labels only — never a link, since no term-archive route exists anywhere in this codebase
  // (`platform/routing/types.ts`'s `TermRefTarget` doc: `urlFor` resolves every `termRef` to `null`).
  assert.ok(!/<a[^>]*>QA<\/a>/.test(html), "a term must render as a plain label, not a link, until an archive route exists");
});

test("integration: GET /:slug renders no terms block when nothing is assigned (byte-identical to before this feature)", async (t) => {
  const post = htmlPageWithNoTemplateChoice({ id: "page-without-terms-int", slug: "page-without-terms-int" });
  const app = createApp(
    testDeps({
      themes: [pageShellTheme()],
      postRepo: new InMemoryPostRepo([post]),
      entryTermReadRepo: stubEntryTermReadRepo("some-other-content-id"),
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/page-without-terms-int`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(!html.includes("entry-terms"), "no assigned terms should mean no entry-terms block at all");
});

/** A `doc`-format Post, rendered through `renderGenericPostPage` (never `renderViaTemplate`) by every
 *  non-`static` tier theme — none of them can ever satisfy `isEligibleForTemplateBranch`'s
 *  `tier === "static"` gate, regardless of `templateChoice`. */
function docFormatPostWithTerms(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-with-terms-int",
    workspaceId: WORKSPACE_ID,
    title: "Post With Terms",
    slug: "post-with-terms-int",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello from a taxonomy-tagged post." }] }] },
    bodyFormat: "doc",
    status: "published",
    kind: "post",
    templateChoice: undefined,
    updatedAt: "2026-09-03T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as unknown as PostRecord;
}

/** Declarative tier: a `templates.post` block tree whose only content is the `"content"` slot
 *  (`render.ts`'s `renderSlot("content")` -> `renderPostBody`) — the same slot shape a real
 *  declarative-tier theme's `post`/`entry` template authors. */
function declarativeTierTheme(): DiscoveredTheme {
  return {
    manifest: {
      id: "declarative-terms-integration-theme",
      name: "Declarative Terms Integration Theme",
      version: "1.0.0",
      tier: "declarative",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/declarative-terms-integration-theme",
    tokens: {},
    tokensLight: {},
    templates: { post: { type: "doc", content: [{ type: "slot", name: "content" }] } },
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {},
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

/** Templated (LiquidJS) tier: a `liquidTemplates.post` source reading `post.content` — the same
 *  `buildTemplateRenderData` field `render.ts`'s `renderPostBody` populates. */
function templatedTierTheme(): DiscoveredTheme {
  return {
    manifest: {
      id: "templated-terms-integration-theme",
      name: "Templated Terms Integration Theme",
      version: "1.0.0",
      tier: "templated",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/templated-terms-integration-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: { post: "<article>{{ post.content | raw }}</article>" },
    handlebarsTemplates: {},
    pages: {},
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

/** Handlebars tier: a `handlebarsTemplates.post` source reading `post.content` — same
 *  `buildTemplateRenderData` field as the templated (Liquid) tier above, different sandbox. */
function handlebarsTierTheme(): DiscoveredTheme {
  return {
    manifest: {
      id: "handlebars-terms-integration-theme",
      name: "Handlebars Terms Integration Theme",
      version: "1.0.0",
      tier: "handlebars",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/handlebars-terms-integration-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: { post: "<article>{{{post.content}}}</article>" },
    pages: {},
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("integration: GET /:slug renders assigned terms through the DECLARATIVE tier's own 'content' slot (renderGenericPostPage, not renderViaTemplate)", async (t) => {
  const post = docFormatPostWithTerms({ id: "post-declarative-terms-int", slug: "post-declarative-terms-int" });
  const app = createApp(
    testDeps({
      themes: [declarativeTierTheme()],
      postRepo: new InMemoryPostRepo([post]),
      entryTermReadRepo: stubEntryTermReadRepo(post.id, "post"),
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/post-declarative-terms-int`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(">QA<"), "declarative tier: expected the assigned Category term 'QA' to render in the page HTML");
  assert.ok(html.includes(">e2e<"), "declarative tier: expected the assigned Tag term 'e2e' to render in the page HTML");
});

test("integration: GET /:slug renders assigned terms through the TEMPLATED (Liquid) tier's own post.content field (renderGenericPostPage, not renderViaTemplate)", async (t) => {
  const post = docFormatPostWithTerms({ id: "post-templated-terms-int", slug: "post-templated-terms-int" });
  const app = createApp(
    testDeps({
      themes: [templatedTierTheme()],
      postRepo: new InMemoryPostRepo([post]),
      entryTermReadRepo: stubEntryTermReadRepo(post.id, "post"),
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/post-templated-terms-int`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(">QA<"), "templated tier: expected the assigned Category term 'QA' to render in the page HTML");
  assert.ok(html.includes(">e2e<"), "templated tier: expected the assigned Tag term 'e2e' to render in the page HTML");
});

test("integration: GET /:slug renders assigned terms through the HANDLEBARS tier's own post.content field (renderGenericPostPage, not renderViaTemplate)", async (t) => {
  const post = docFormatPostWithTerms({ id: "post-handlebars-terms-int", slug: "post-handlebars-terms-int" });
  const app = createApp(
    testDeps({
      themes: [handlebarsTierTheme()],
      postRepo: new InMemoryPostRepo([post]),
      entryTermReadRepo: stubEntryTermReadRepo(post.id, "post"),
    })
  );
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/post-handlebars-terms-int`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes(">QA<"), "handlebars tier: expected the assigned Category term 'QA' to render in the page HTML");
  assert.ok(html.includes(">e2e<"), "handlebars tier: expected the assigned Tag term 'e2e' to render in the page HTML");
});
