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
 * Covers the `static`-tier "no explicit templateChoice" page-shell-fallback branch only
 * (`resolveStaticTierPageShellFallback` -> `renderViaTemplate`) — the SAME branch the live proof
 * page (`/testing-page`, an `html`-format Page with no `templateChoice`) renders through. The
 * `declarative`/`templated`/`handlebars` tiers' own render paths (`render.ts`'s `renderPostBody`/
 * `buildTemplateRenderData`) are a disclosed, separate gap this fix does not close — see the
 * dispatch's own handoff report.
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

/** Returns the fixed two-row assignment (`QA` Category, `e2e` Tag) for exactly `expectedContentId`,
 *  and nothing for any other id — mirrors the real `entry_terms` rows already live on
 *  `/testing-page` in the dev DB (`content_type='page'`), the proof case this fix targets. */
function stubEntryTermReadRepo(expectedContentId: string): EntryTermReadPort {
  const rows: readonly AssignedTermView[] = [
    { termId: "term-qa", termName: "QA", taxonomyName: "Category" },
    { termId: "term-e2e", termName: "e2e", taxonomyName: "Tag" },
  ];
  return {
    async listForContent(params) {
      return params.contentType === "page" && params.contentId === expectedContentId ? rows : [];
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
