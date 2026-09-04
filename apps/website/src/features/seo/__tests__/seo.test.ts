import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { OriginNotVerifiedError, type OriginRegistryPort, type VerifiedOrigin } from "../../origin/index.js";
import { SeoEntryNotFoundError } from "../errors.js";
import { ensureSeoSettingDefinitions, setSeoSettings } from "../settings.js";
import { getEntryMeta } from "../seo.js";

/**
 * @file T024 — failing-first unit certification of `getEntryMeta`
 * (ADR-PIPE-008 Decision, C-001; behavior.spec.md §1.1/§3/§7): per-field
 * precedence (override wins, site-default wins when no override,
 * derived-from-excerpt fallback when both absent), `title` never resolves
 * empty, canonical override accepted cross-domain as-is (EC-10), no-override
 * canonical falls back to routing, draft-safety `noindex` derivation (EC-11),
 * entry override beats a workspace default (EC-02).
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `seo-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "An excerpt body." }] }] },
    status: "published",
    kind: "post",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

/** Fake `OriginRegistryPort` (mirrors `site-evidence/__tests__/unit/collect-page-evidence.unit.test.ts`'s
 *  own copy) — `origin: undefined` (the default, and every pre-existing test's implicit behavior)
 *  means "no verified origin registered yet", which `resolveWorkspaceOrigin` degrades to
 *  `undefined`, keeping every canonical/og:url/og:image assertion below unchanged (still relative).
 *  A test that needs the absolute-URL fix passes a real `VerifiedOrigin` explicitly. */
function fakeOriginRegistry(origin?: VerifiedOrigin): OriginRegistryPort {
  return {
    async canonicalOrigin() {
      if (!origin) throw new OriginNotVerifiedError("no verified origin registered for this workspace");
      return origin;
    },
    async isAllowedRedirectTarget() {
      return false;
    },
    async isAllowedEgressTarget() {
      return false;
    },
  };
}

async function makeDeps(posts: PostRecord[], origin?: VerifiedOrigin) {
  const postRepo = new InMemoryPostRepo(posts);
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });

  return {
    postRepo,
    settingsRepo,
    settingsDeps,
    media: {
      mediaRepo: new InMemoryMediaRepo([]),
      assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    },
    originRegistry: fakeOriginRegistry(origin),
  };
}

test("getEntryMeta: entry not found rejects SeoEntryNotFoundError", async () => {
  const deps = await makeDeps([]);
  await assert.rejects(
    () => getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "missing" }),
    SeoEntryNotFoundError
  );
});

test("getEntryMeta: no overrides and no site defaults resolves fully derived meta (AC-07)", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });

  assert.equal(meta.title, "Hello World");
  assert.equal(meta.robots.noindex, false);
  assert.equal(meta.robots.nofollow, false);
  assert.ok(meta.canonical.includes("hello-world"));
});

test("getEntryMeta: title override wins over derived template (AC-06)", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ title: "Override Title" }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.title, "Override Title");
});

test("getEntryMeta: title is derived from titleTemplate applied to entry.title when no override", async () => {
  const deps = await makeDeps([seedPost()]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { titleTemplate: "%s — My Site" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.title, "Hello World — My Site");
});

test("getEntryMeta: title never resolves empty even when override/default/derived all appear absent", async () => {
  const deps = await makeDeps([seedPost({ title: "X" })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.ok(meta.title.length > 0);
});

test("getEntryMeta: description — site default wins when no override (behavior.spec.md example)", async () => {
  const deps = await makeDeps([seedPost()]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { defaultDescription: "A great site" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "A great site");
});

test("getEntryMeta: description override wins over site default", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ description: "Override description" }) })]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { defaultDescription: "Site default" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "Override description");
});

test("getEntryMeta: description derives from excerpt when override and site default are both absent", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "An excerpt body.");
});

test("getEntryMeta: all precedence sources absent for description resolves undefined (EC, behavior.spec.md §7)", async () => {
  const deps = await makeDeps([seedPost({ bodyJson: { type: "doc", content: [] } })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, undefined);
});

test("getEntryMeta: description derives from an html-format page's bodyHtml when override and site default are absent (SPEC-047 gap)", async () => {
  const deps = await makeDeps([
    seedPost({
      kind: "page",
      bodyFormat: "html",
      bodyHtml: "<header><h1>Quickstart</h1></header><p>From nothing to a published post in five steps.</p>",
    }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "Quickstart From nothing to a published post in five steps.");
});

test("getEntryMeta: html-format description strips a leading <style> block and decodes entities instead of leaking CSS/markup", async () => {
  const deps = await makeDeps([
    seedPost({
      kind: "page",
      bodyFormat: "html",
      bodyHtml: "<style>.qs-wrap { max-width: 46rem; }</style><div class=\"qs-wrap\"><p>Tovu &amp; you: &lt;init&gt; a site in minutes.</p></div>",
    }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "Tovu & you: <init> a site in minutes.");
});

test("getEntryMeta: html-format description truncates at the same length and with the same ellipsis as the doc-format path", async () => {
  const longSentence = "A".repeat(200);
  const deps = await makeDeps([
    seedPost({ kind: "page", bodyFormat: "html", bodyHtml: `<p>${longSentence}</p>` }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, `${"A".repeat(160)}…`);
});

test("getEntryMeta: an explicit description override still wins over the derived html excerpt", async () => {
  const deps = await makeDeps([
    seedPost({
      kind: "page",
      bodyFormat: "html",
      bodyHtml: "<p>This should never be used as the description.</p>",
      seoExtJson: JSON.stringify({ description: "Manual override description" }),
    }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "Manual override description");
});

test("getEntryMeta: canonical override is accepted cross-domain as-is (EC-10)", async () => {
  const deps = await makeDeps([
    seedPost({ seoExtJson: JSON.stringify({ canonical: "https://other-domain.example/elsewhere" }) }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.canonical, "https://other-domain.example/elsewhere");
});

test("getEntryMeta: no canonical override falls back to the routing-resolved canonical, never a seo setting", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.ok(meta.canonical.endsWith("/hello-world"));
});

// 2026-09-03 absolute-URL fix — reproduced on both production and local via `curl` before this fix:
// every page emitted a RELATIVE `canonical`/`og:url`, and `og:image` is required to be absolute per
// the Open Graph protocol (a relative one breaks every social crawler/link-preview fetcher).
const VERIFIED_ORIGIN: VerifiedOrigin = {
  scheme: "https",
  host: "example.test",
  verifiedAt: "2026-09-03T00:00:00.000Z",
  source: "workspace-setting",
};

test("getEntryMeta: with a verified origin, canonical and og:url are absolute (2026-09-03 fix)", async () => {
  const deps = await makeDeps([seedPost()], VERIFIED_ORIGIN);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.canonical, "https://example.test/hello-world");
  assert.equal(meta.openGraph.url, "https://example.test/hello-world");
});

test("getEntryMeta: the root-slug '/' page's absolute canonical is 'https://host/', never 'https://host//' (2026-09-03 fix)", async () => {
  const deps = await makeDeps([seedPost({ slug: "/" })], VERIFIED_ORIGIN);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.canonical, "https://example.test/");
});

test("getEntryMeta: with NO verified origin registered, canonical degrades to the bare relative path (disclosed fallback, 2026-09-03 fix)", async () => {
  const deps = await makeDeps([seedPost()]); // no origin argument -> fakeOriginRegistry() throws OriginNotVerifiedError
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.canonical, "/hello-world");
  assert.equal(meta.openGraph.url, "/hello-world");
});

test("getEntryMeta: an already-absolute canonical override is never double-prefixed with the verified origin (EC-10 preserved, 2026-09-03 fix)", async () => {
  const deps = await makeDeps(
    [seedPost({ seoExtJson: JSON.stringify({ canonical: "https://other-domain.example/elsewhere" }) })],
    VERIFIED_ORIGIN
  );
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.canonical, "https://other-domain.example/elsewhere");
});

test("getEntryMeta: a media-resolved og:image (the '/m/...' contract) becomes absolute with a verified origin (2026-09-03 fix)", async () => {
  const now = "2026-09-03T00:00:00.000Z";
  const mediaRepo = new InMemoryMediaRepo([
    {
      id: "asset-1",
      workspaceId: WORKSPACE,
      title: "Cover",
      alt: "",
      caption: "",
      credit: "",
      source: { kind: "upload", sha256: "a".repeat(64) } as never,
      status: "ready",
      createdAt: now,
      updatedAt: now,
      version: 1,
      width: null,
      height: null,
      cssClass: null,
    } as never,
  ]);
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo([
    { id: "transform-1", workspaceId: WORKSPACE, name: "og", version: 1, params: { format: "jpeg" }, createdAt: now } as never,
  ]);
  const assetRenditionRepo = new InMemoryAssetRenditionRepo([
    { id: "rendition-1", workspaceId: WORKSPACE, assetId: "asset-1", transformName: "og", version: 1, storageKey: "k", createdAt: now },
  ]);
  const deps = {
    ...(await makeDeps(
      [seedPost({ seoExtJson: JSON.stringify({ ogImage: "asset-1:og" }) })],
      VERIFIED_ORIGIN
    )),
    media: { mediaRepo, transformDefinitionRepo, assetRenditionRepo },
  };
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.openGraph.image, "https://example.test/m/asset-1/og.v1/image.jpg");
});

test("getEntryMeta: a draft with no explicit noindex override and no site default defaults to noindex:true (EC-11)", async () => {
  const deps = await makeDeps([seedPost({ status: "draft" })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, true);
});

test("getEntryMeta: a draft with an explicit noindex:false override still wins over the draft-safety default", async () => {
  const deps = await makeDeps([seedPost({ status: "draft", seoExtJson: JSON.stringify({ noindex: false }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, false);
});

test("getEntryMeta: entry override noindex:false beats a workspace default noindex:true (EC-02)", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ noindex: false }) })]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { defaultRobots: { noindex: true, nofollow: false } },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, false);
});

test("getEntryMeta: a published entry's noindex derives false when nothing else is set", async () => {
  const deps = await makeDeps([seedPost({ status: "published" })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, false);
});

test("getEntryMeta: openGraph.image is omitted when no override and no site default exist", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.openGraph.image, undefined);
});

test("getEntryMeta: openGraph.image resolves from the entry override (absolute URL passthrough)", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ ogImage: "https://cdn.example.com/x.jpg" }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.openGraph.image, "https://cdn.example.com/x.jpg");
});

test("getEntryMeta: twitter.site comes only from the site default (no per-entry override field exists)", async () => {
  const deps = await makeDeps([seedPost()]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { twitterSite: "@example" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.twitter.site, "@example");
});

test("getEntryMeta: jsonLd @type derives from content type — post -> Article, page -> WebPage", async () => {
  const deps = await makeDeps([seedPost({ kind: "post" }), seedPost({ id: "page-1", kind: "page", slug: "about" })]);
  const postMeta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  const pageMeta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "page-1" });
  assert.equal(postMeta.jsonLd[0]!["@type"], "Article");
  assert.equal(pageMeta.jsonLd[0]!["@type"], "WebPage");
});

test("getEntryMeta: schemaType override changes the emitted jsonLd @type", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ schemaType: "NewsArticle" }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.jsonLd[0]!["@type"], "NewsArticle");
});

test("getEntryMeta: explicit site default noindex and nofollow apply when no overrides exist", async () => {
  const deps = await makeDeps([seedPost()]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { defaultRobots: { noindex: true, nofollow: true } },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, true);
  assert.equal(meta.robots.nofollow, true);
});

test("getEntryMeta: nofollow override true wins over site default false", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ nofollow: true }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.nofollow, true);
});

test("getEntryMeta: malformed seoExtJson parses safely into empty overrides", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: "{not-valid-json" })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.title, "Hello World");
});

test("getEntryMeta: decodes numeric hex and decimal html entities, and preserves unknown entities", async () => {
  const deps = await makeDeps([
    seedPost({
      kind: "page",
      bodyFormat: "html",
      bodyHtml: "<p>It&#39;s &#x22;great&#x22; &lt;rock&gt; &amp; &unknown;</p>",
    }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, `It's "great" <rock> & &unknown;`);
});

test("getEntryMeta: all openGraph and twitter field overrides are respected", async () => {
  const deps = await makeDeps([
    seedPost({
      kind: "page",
      seoExtJson: JSON.stringify({
        ogTitle: "Custom OG Title",
        ogDescription: "Custom OG Desc",
        ogType: "profile",
        twitterTitle: "Custom Twitter Title",
        twitterDescription: "Custom Twitter Desc",
        twitterCard: "summary",
        twitterImage: "https://cdn.example.com/tw.png",
      }),
    }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.openGraph.title, "Custom OG Title");
  assert.equal(meta.openGraph.description, "Custom OG Desc");
  assert.equal(meta.openGraph.type, "profile");
  assert.equal(meta.twitter.title, "Custom Twitter Title");
  assert.equal(meta.twitter.description, "Custom Twitter Desc");
  assert.equal(meta.twitter.card, "summary");
  assert.equal(meta.twitter.image, "https://cdn.example.com/tw.png");
  assert.equal(meta.jsonLd[0]!["name"], "Hello World");
});

