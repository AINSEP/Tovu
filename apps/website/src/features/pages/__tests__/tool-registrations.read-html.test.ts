import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { applyBatchInputs, type BatchResult } from "../../../assistant/batch-tool-inputs.js";
import { invokeRegisteredTool } from "../../../assistant/__tests__/fixtures/execute-registered-tool.js";
import { createPost, InMemoryPostRepo } from "../../post/index.js";
import type { DiscoveredTheme } from "../../theme/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../html-document-store.memory.js";
import { buildPagesRegistrations, type PagesToolDeps } from "../tool-registrations.js";

const workspaceId = "page-reader-workspace";
const clock = { nowMs: () => Date.parse("2026-10-23T00:00:00.000Z") };
const hero = '<section data-agent-element="hero"><h1>Hello</h1><section data-agent-element="nested">Inside</section></section>';
const html = hero + '<section data-agent-element="cta">Contact</section>';
const theme = { manifest: { id: "ink" }, status: "valid", tokens: { "--ink": "#111" }, tokensLight: {} } as DiscoveredTheme;

interface PageRead {
  id: string;
  html: string;
  regions: string[];
  version: number;
  theme: unknown;
  hasDocContent?: boolean;
  normalizationNotes?: string[];
}

/** Real domain/store plus the production batch selection and executor normalization gates. */
function readerHarness(_required: Record<string, never>, { authorize }: { authorize?: PagesToolDeps["authorize"] } = {}) {
  const repo = new InMemoryPostRepo([]);
  const registrations = buildPagesRegistrations({
    workspaceId, postRepo: repo, authorize: authorize ?? (async () => ({ allowed: true, reason: "test" })),
    pagesHtmlStore: scope => new InMemoryPagesHtmlDocumentStore(scope, { repo, clock }),
    themes: [theme], resolveActiveThemeId: async () => "ink",
  });
  const reader = applyBatchInputs({ registrations }).find(entry => entry.descriptor.id === "pages_read_html")!;
  const call = (input: Record<string, unknown>) => invokeRegisteredTool(reader, {
    executionId: "read", run: { id: "run" }, principal: { id: "owner" }, input, signal: new AbortController().signal,
  } satisfies ToolExecutionContext);
  return { repo, call };
}

async function seed(
  { repo, id = "page", slug = "/", body = html }: { repo: InMemoryPostRepo; id?: string; slug?: string; body?: string },
  _optional: Record<string, never> = {},
) {
  await createPost({ deps: { repo, clock }, input: { workspaceId, id, slug, title: id, kind: "page" } });
  await new InMemoryPagesHtmlDocumentStore({ workspaceId, postId: id }, { repo, clock }).ensureHtmlFormat(body);
  return (await repo.findById({ workspaceId, id }))!;
}

for (const selector of ["regionId", "region", "handle"]) {
  test(`pages_read_html reads one nested region through ${selector}, preserving page metadata`, async () => {
    const { repo, call } = readerHarness({});
    const row = await seed({ repo });
    const before = structuredClone(row);
    const result = await call({ id: "page", [selector]: "hero" }) as PageRead;
    assert.equal(result.html, hero);
    assert.equal(result.id, "page");
    assert.deepEqual(result.regions, ["hero", "nested", "cta"]);
    assert.equal(result.version, row.version);
    assert.deepEqual(result.theme, { id: "ink", tokens: theme.tokens, tokensLight: {} });
    if (selector !== "regionId") assert.ok(result.normalizationNotes?.includes(`${selector}→regionId`));
    assert.deepEqual(await repo.findById({ workspaceId, id: "page" }), before);
  });
}

test("pages_read_html without a region selector keeps the full-page response", async () => {
  const { repo, call } = readerHarness({});
  const row = await seed({ repo });
  assert.deepEqual(await call({ id: "page" }), {
    id: "page", html, regions: ["hero", "nested", "cta"], version: row.version,
    theme: { id: "ink", tokens: theme.tokens, tokensLight: {} },
  });
});

for (const selectors of [{ regionId: "hero", region: "hero" }, { regionId: "hero", handle: "hero" }, { region: "hero", handle: "hero" }]) {
  test(`pages_read_html refuses competing region selectors ${Object.keys(selectors)}`, async () => {
    const { repo, call } = readerHarness({});
    repo.findById = async () => assert.fail("a selector conflict must fail before reading storage");
    await assert.rejects(call({ id: "page", ...selectors }), /Send only regionId/);
  });
}

for (const [state, body, regionId, error] of [
  ["missing", html, "missing", /has no region.*missing.*hero, nested, cta/],
  ["ambiguous", hero + hero, "hero", /2 elements.*hero/],
  ["unclosed", '<section data-agent-element="hero"><p>Unclosed</p>', "hero", /has no closing tag/],
] as const) {
  test(`pages_read_html refuses a ${state} region without a full-page fallback`, async () => {
    const { repo, call } = readerHarness({});
    const before = structuredClone(await seed({ repo, body }));
    await assert.rejects(call({ id: "page", regionId }), error);
    assert.deepEqual(await repo.findById({ workspaceId, id: "page" }), before);
  });
}

test("pages_read_html does not turn a missing region on a doc page into an empty-page success", async () => {
  const { repo, call } = readerHarness({});
  await createPost({ deps: { repo, clock }, input: { workspaceId, id: "doc", slug: "doc", title: "Doc", kind: "page" } });
  const result = await call({ slug: "doc" }) as PageRead;
  assert.equal(result.id, "doc");
  assert.equal(result.html, "");
  assert.equal(result.hasDocContent, false);
  await assert.rejects(call({ slug: "doc", regionId: "hero" }), /has no region.*hero/);
});

test("pages_read_html resolves root and normalized ordinary slugs to page ids", async () => {
  const { repo, call } = readerHarness({});
  await seed({ repo });
  await seed({ repo, id: "about-page", slug: "about" });
  assert.equal((await call({ slug: "/" }) as PageRead).id, "page");
  const about = await call({ slug: "  ABOUT  ", regionId: "hero" }) as PageRead;
  assert.equal(about.id, "about-page");
  assert.equal(about.html, hero);
});

for (const state of ["missing", "trashed", "post"] as const) {
  test(`pages_read_html refuses a ${state} slug target`, async () => {
    const { repo, call } = readerHarness({});
    if (state === "trashed") {
      const row = await seed({ repo });
      await repo.softDelete({ workspaceId, id: row.id, version: row.version, deletedAt: "2026-10-23T00:00:00.000Z", updatedAt: "2026-10-23T00:00:00.000Z" });
    }
    if (state === "post") await createPost({ deps: { repo, clock }, input: { workspaceId, id: "post", slug: "target", title: "Post" } });
    await assert.rejects(call({ slug: state === "post" ? "target" : "/" }), /PAGES_NOT_FOUND/);
  });
}

for (const target of [{}, { id: "page", slug: "/" }]) {
  test(`pages_read_html requires exactly one page selector: ${JSON.stringify(target)}`, async () => {
    const { repo, call } = readerHarness({});
    repo.findById = repo.findBySlug = async () => assert.fail("invalid selectors must not access storage");
    await assert.rejects(call(target), /exactly one of id or slug/);
  });
}

test("pages_read_html checks permission before slug lookup", async () => {
  const { repo, call } = readerHarness({}, { authorize: async () => ({ allowed: false, reason: "test denial" }) });
  repo.findById = repo.findBySlug = async () => assert.fail("denied readers must not resolve a slug");
  await assert.rejects(call({ slug: "/" }), /PAGES_FORBIDDEN/);
});

test("pages_read_html batches id and slug targets, normalizes region aliases, and continues after failures", async () => {
  const { repo, call } = readerHarness({});
  const row = await seed({ repo });
  const result = await call({ items: [{ slug: "/" }, { slug: "missing" }, { id: "page", region: "hero" }, { id: "page", slug: "/" }] }) as BatchResult;
  assert.equal(result.outcome, "partial_failure");
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 2);
  assert.equal((result.results[0] as { result: PageRead }).result.html, html);
  assert.match((result.results[1] as { error: string }).error, /PAGES_NOT_FOUND/);
  const selected = (result.results[2] as { result: PageRead }).result;
  assert.equal(selected.html, hero);
  assert.equal(selected.version, row.version);
  assert.match((result.results[3] as { error: string }).error, /exactly one of id or slug/);
});
