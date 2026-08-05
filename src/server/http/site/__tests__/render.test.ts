import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { JsonObject } from "@jini-ai/cms/core";
import type { PostRecord } from "#src/features/post/index";
import { loadTheme, type DiscoveredTheme } from "#src/features/theme/index";
import type { ResolveHtmlPageEmbedsResult, ResolvePageWidgetsResult } from "#src/widgets/resolver-service";
import type { WidgetRenderIR } from "#src/widgets/types";
import { renderDocNode, renderSite } from "../render";

function textDoc(...content: JsonObject[]): JsonObject {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

test("renderDocNode: bold/italic/code marks still render (regression)", () => {
  const html = renderDocNode(
    textDoc(
      { type: "text", text: "b", marks: [{ type: "bold" }] },
      { type: "text", text: "i", marks: [{ type: "italic" }] },
      { type: "text", text: "c", marks: [{ type: "code" }] }
    )
  );
  assert.equal(html, "<p><strong>b</strong><em>i</em><code>c</code></p>");
});

test("C7: a link mark renders an anchor with its href", () => {
  const html = renderDocNode(
    textDoc({ type: "text", text: "plugins", marks: [{ type: "link", attrs: { href: "/how-plugins-work" } }] })
  );
  assert.equal(html, '<p><a href="/how-plugins-work">plugins</a></p>');
});

test("C7: relative, http(s) and mailto hrefs are allowed; text is escaped", () => {
  for (const href of ["/about", "#top", "https://tovu.dev", "http://x.io", "mailto:a@b.co"]) {
    const html = renderDocNode(
      textDoc({ type: "text", text: "<x>", marks: [{ type: "link", attrs: { href } }] })
    );
    assert.equal(html, `<p><a href="${href}">&lt;x&gt;</a></p>`);
  }
});

test("C7: javascript:, data: and non-string hrefs collapse to '#' (no script smuggling)", () => {
  for (const href of ["javascript:alert(1)", "data:text/html,<script>", "  javascript:alert(1)", 42, null, undefined]) {
    const html = renderDocNode(
      textDoc({ type: "text", text: "x", marks: [{ type: "link", attrs: { href } as never }] })
    );
    assert.equal(html, '<p><a href="#">x</a></p>');
  }
});

test("C7: link composes with an emphasis mark on the same text", () => {
  const html = renderDocNode(
    textDoc({ type: "text", text: "here", marks: [{ type: "bold" }, { type: "link", attrs: { href: "/x" } }] })
  );
  assert.equal(html, '<p><a href="/x"><strong>here</strong></a></p>');
});

// ---------------------------------------------------------------------------
// ADR-020 §3 (C6) — end-to-end `renderSite` through the real `themes/dispatch`
// Tier-2 demonstrator, exercising the full path: `loadTheme`'s lint,
// `renderLiquidInSandbox`'s worker isolation, the `render_block` seam into
// the component registry, and `{{ content | raw }}`.
// ---------------------------------------------------------------------------

function fakePost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workspaceId: "workspace-1",
    title: "<Hello> & Welcome",
    slug: "welcome",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi there." }] }] },
    status: "published",
    updatedAt: "2026-07-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test("renderSite renders the live themes/dispatch home page: header/footer components, entry grid, escaped titles, no leftover Liquid tags", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid", `expected dispatch to load valid, got errors: ${JSON.stringify(theme.errors)}`);

  const posts = [fakePost(), fakePost({ id: "2", slug: "second", title: "Second Post", updatedAt: "2026-06-01T00:00:00.000Z" })];
  const html = await renderSite({ theme, route: "home", siteTitle: "Dispatch Demo", posts });

  assert.match(html, /site-header/);
  assert.match(html, /site-footer/);
  assert.match(html, /Dispatch Demo/);
  // Both entries render, in a loop authored in Liquid (not a fixed component).
  assert.match(html, /&lt;Hello&gt; &amp; Welcome/);
  assert.match(html, /Second Post/);
  // No unrendered Liquid syntax leaked into the output.
  assert.doesNotMatch(html, /\{\{|\{%/);
});

test("renderSite renders the live themes/dispatch entry (post) page: content injected raw, title escaped in the shell", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");

  const post = fakePost();
  const html = await renderSite({ theme, route: "post", siteTitle: "Dispatch Demo", posts: [post], post });

  // `{{ post.content | raw }}` — the pre-sanitized TipTap body renders as real HTML, not escaped text.
  assert.match(html, /<p>Hi there\.<\/p>/);
  // The post title inside the Liquid body is autoescaped (no explicit `raw`).
  assert.match(html, /&lt;Hello&gt; &amp; Welcome/);
  // The outer page shell's <title> is also escaped.
  assert.match(html, /<title>&lt;Hello&gt; &amp; Welcome — Dispatch Demo<\/title>/);
  assert.doesNotMatch(html, /\{\{|\{%/);
});

test("renderSite: the ADR-054 visitor-chat mount node + script are absent by default, and every pre-existing caller (no siteAssistantEnabled param) keeps getting no widget", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");

  const html = await renderSite({ theme, route: "home", siteTitle: "Dispatch Demo", posts: [] });
  assert.doesNotMatch(html, /tovu-site-assistant-root/);
  assert.doesNotMatch(html, /site-assistant\.js/);
  assert.doesNotMatch(html, /site-assistant\.css/);
});

test("renderSite: siteAssistantEnabled:false is the same as omitting it — no mount node, no script, no stylesheet", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");

  const html = await renderSite({ theme, route: "home", siteTitle: "Dispatch Demo", posts: [], siteAssistantEnabled: false });
  assert.doesNotMatch(html, /tovu-site-assistant-root/);
  assert.doesNotMatch(html, /site-assistant\.js/);
  assert.doesNotMatch(html, /site-assistant\.css/);
});

test("renderSite: siteAssistantEnabled:true injects the stylesheet link, mount node, and deferred script, once each, in the page shell (not a theme template)", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");

  const html = await renderSite({ theme, route: "home", siteTitle: "Dispatch Demo", posts: [], siteAssistantEnabled: true });
  assert.match(html, /<link rel="stylesheet" href="\/site-chat\/site-assistant\.css"\/>/);
  assert.match(html, /<div id="tovu-site-assistant-root"><\/div>/);
  assert.match(html, /<script defer src="\/site-chat\/site-assistant\.js"><\/script>/);
  // Exactly once each: this is the shell every route funnels through, not per-theme injection.
  assert.equal(html.match(/tovu-site-assistant-root/g)?.length, 1);
  assert.equal((html.match(/site-assistant\.css/g) ?? []).length, 1);
  // The stylesheet link lives in <head> (never render-blocked behind the deferred script), and the
  // deferred script comes after the themed page body — never a blocking script ahead of paintable
  // content.
  const headCloseIndex = html.indexOf("</head>");
  const cssLinkIndex = html.indexOf("site-assistant.css");
  const bodyIndex = html.indexOf('class="site"');
  const scriptIndex = html.indexOf("site-assistant.js");
  assert.ok(cssLinkIndex < headCloseIndex, "the stylesheet link must be in <head>");
  assert.ok(bodyIndex < scriptIndex, "the script tag must come after the themed page body");
});

test("renderSite falls back to the minimal built-in body (never 500s) when a templated theme's source is hostile at render time", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");
  // Simulate a template hot-edited on disk to smuggle a disallowed tag after
  // `loadTheme` already validated it — the worker's defensive re-lint must
  // still catch it, and `renderSite` must degrade instead of throwing.
  theme.liquidTemplates.home = '{% include "leak" %}';

  const html = await renderSite({ theme, route: "home", siteTitle: "Dispatch Demo", posts: [] });
  assert.match(html, /theme render error/);
  // The error message is HTML-escaped (it's injected into an HTML comment).
  assert.match(html, /disallowed tag &quot;include&quot;/);
  // The fallback body still renders (never a 500/empty response).
  assert.match(html, /site-header/);
  assert.match(html, /site-footer/);
});

// ---------------------------------------------------------------------------
// SPEC-043/ADR-047 W-004 — widget region + inline embed rendering
// ---------------------------------------------------------------------------

function declarativeTheme(home: JsonObject): DiscoveredTheme {
  return {
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "declarative", engine: 1, regions: ["footer"] },
    tokens: {},
    templates: { home, entry: { type: "doc", content: [] } },
    liquidTemplates: {},
    handlebarsTemplates: {},
    dir: "/nonexistent/test-theme",
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

function widgetsResult(overrides: Partial<ResolvePageWidgetsResult> = {}): ResolvePageWidgetsResult {
  return { regions: {}, inlineResolved: new Map(), ...overrides };
}

test("renderSite (declarative tier): a {type:'region',key:'footer'} template node renders every resolved widget in that region, wrapped in a widget-region container", async () => {
  const theme = declarativeTheme({
    type: "doc",
    content: [{ type: "region", key: "footer" }],
  });
  const html = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({
      regions: { footer: [{ componentId: "text", props: { body: "Hello from the footer" } }] },
    }),
  });
  assert.match(html, /<div class="widget-region widget-region--footer">/);
  assert.match(html, /Hello from the footer/);
});

test("renderSite (declarative tier): a region with no resolved widgets (or no widgets param at all) renders nothing for that region — not an error state", async () => {
  const theme = declarativeTheme({ type: "doc", content: [{ type: "region", key: "footer" }] });

  const noWidgetsParam = await renderSite({ theme, route: "home", siteTitle: "Widgets Demo", posts: [] });
  assert.doesNotMatch(noWidgetsParam, /widget-region/);

  const emptyRegion = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({ regions: { footer: [] } }),
  });
  assert.doesNotMatch(emptyRegion, /widget-region/);
});

test("renderSite (Liquid tier): {% render_block region: \"footer\" %} resolves the same widget list over the same render_block seam, no new Liquid capability needed (ADR-047 §2a)", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");
  theme.liquidTemplates.home = '<div id="footer-region">{% render_block region: "footer" %}</div>';

  const html = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({
      regions: { footer: [{ componentId: "social-links", props: { links: [{ platform: "GitHub", url: "https://github.com/tovu" }] } }] },
    }),
  });
  assert.match(html, /<div id="footer-region">/);
  assert.match(html, /widget-social-links/);
  assert.match(html, /GitHub/);
  assert.match(html, /https:\/\/github\.com\/tovu/);
});

test("renderDocNode: a widgetEmbed node resolves through inlineResolved to its widget's IR (REQ-21) — the theme never sees a raw widgetEmbed reference", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "widgetEmbed", attrs: { placementId: "p1", widgetEntryId: "w1" } }],
  };
  const inlineResolved = new Map<string, WidgetRenderIR>([
    ["p1", { componentId: "text", props: { body: "Inline widget content" } }],
  ]);
  const html = renderDocNode(doc, inlineResolved);
  assert.match(html, /widget-text/);
  assert.match(html, /Inline widget content/);
  assert.doesNotMatch(html, /widgetEmbed/);
});

test("renderDocNode: a widgetEmbed node with no matching entry in inlineResolved (unresolved/not-yet-wired) degrades to the public-safe placeholder, never a crash or raw attrs dump (REQ-28)", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "widgetEmbed", attrs: { placementId: "missing", widgetEntryId: "w1" } }],
  };
  const html = renderDocNode(doc);
  assert.match(html, /widget-placeholder/);
  assert.doesNotMatch(html, /w1|missing/);
});

// ---------------------------------------------------------------------------
// D7 — TipTap `image` nodes were silently dropped (no `case "image"` in
// `renderDocNode`, so a childless image node fell to the `default` branch,
// which renders `node.content` — undefined for a leaf node). Fixed by
// degrading to the same aspect-ratio placeholder convention `hero`/`section`
// media props already use (`mediaPlaceholder`), rather than emitting a real
// `<img src>`: today's editor writes `data:` URLs, arbitrary external URLs,
// or the authenticated admin media-preview URL into `attrs.src` — none of
// which are safe/correct to embed unescaped on the public site (see D7 recon
// note). `src`/`title` are never read at all, so there is nothing to escape
// or reject there; only `alt` reaches the output, and it is escaped by the
// existing `mediaPlaceholder` helper.
// ---------------------------------------------------------------------------

test("renderDocNode: an image node no longer vanishes — it degrades to the media placeholder using alt text as the label, and never emits src/title (D7)", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "before" }] },
      { type: "image", attrs: { src: "https://evil.example/x.png", alt: '<A> cat & "friend"', title: "ignored" } },
      { type: "paragraph", content: [{ type: "text", text: "after" }] },
    ],
  };
  const html = renderDocNode(doc);
  assert.match(html, /<p>before<\/p>/);
  assert.match(html, /<p>after<\/p>/);
  assert.match(html, /media-ph/);
  assert.match(html, /&lt;A&gt; cat &amp; &quot;friend&quot;/);
  assert.doesNotMatch(html, /evil\.example/);
  assert.doesNotMatch(html, /ignored/);
  assert.doesNotMatch(html, /<img/);
});

test("renderDocNode: an image node with no/non-string alt falls back to a generic 'Image' label, never crashes", () => {
  const noAlt = renderDocNode({ type: "doc", content: [{ type: "image", attrs: { src: "https://x/y.png" } }] });
  assert.match(noAlt, /media-ph__label">Image</);

  const nonStringAlt = renderDocNode({ type: "doc", content: [{ type: "image", attrs: { src: "x", alt: 42 } as never }] });
  assert.match(nonStringAlt, /media-ph__label">Image</);
});

// ---------------------------------------------------------------------------
// ADR-027 §4 — ref-based `{assetId, transformName}` image nodes. Extends D7's
// placeholder default with the ONE case that now emits a real `<img src>`:
// a node whose `transformName` has a resolved entry in `mediaTransformVersions`
// (the caller-supplied map straight off `transform_registry`, per `render.ts`'s
// own `EMPTY_MEDIA_TRANSFORM_VERSIONS` doc). Every OTHER shape — legacy
// `src`-only, an unregistered/unresolved `transformName`, or a malformed id —
// must still degrade to the exact same D7 placeholder; that backward-compat
// guarantee is asserted here as directly as the happy path, not assumed from
// the happy-path test alone.
// ---------------------------------------------------------------------------

test("renderDocNode: a ref-based image node with a resolved transformName renders a real <img> against the public /m/ URL, never a placeholder", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "public", alt: '<A> & "friend"' } }],
  };
  const html = renderDocNode(doc, undefined, new Map([["public", 3]]));
  assert.match(html, /<img src="\/m\/asset-1\/public\.v3\/image\.jpg" alt="&lt;A&gt; &amp; &quot;friend&quot;" loading="lazy">/);
  assert.doesNotMatch(html, /media-ph/);
});

test("renderDocNode: a ref-based image node with NO entry for its transformName in mediaTransformVersions degrades to the placeholder (unregistered/not-yet-resolved), never a guessed or malformed URL", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "unknown-name", alt: "x" } }],
  };
  // Non-empty map, but no key for "unknown-name" — proves the branch checks the SPECIFIC name,
  // not merely "is the map non-empty".
  const html = renderDocNode(doc, undefined, new Map([["public", 3]]));
  assert.match(html, /media-ph/);
  assert.doesNotMatch(html, /<img/);
});

test("renderDocNode: a ref-based image node with an empty mediaTransformVersions map degrades to the placeholder (default param, every pre-existing caller)", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "public", alt: "x" } }],
  };
  const html = renderDocNode(doc); // no 3rd arg at all — exercises the default EMPTY_MEDIA_TRANSFORM_VERSIONS
  assert.match(html, /media-ph/);
  assert.doesNotMatch(html, /<img/);
});

test("renderDocNode: a ref-based image node with a resolved mediaAssetMetadata entry emits width/height/class on the <img> — owner-directed quick-and-dirty sizing fix", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "public", alt: "x" } }],
  };
  const html = renderDocNode(
    doc,
    undefined,
    new Map([["public", 3]]),
    new Map([["asset-1", { width: 800, height: 600, cssClass: "rounded" }]])
  );
  assert.match(html, /<img src="\/m\/asset-1\/public\.v3\/image\.jpg" alt="x" width="800" height="600" class="rounded" loading="lazy">/);
});

test("renderDocNode: a resolved image with only width set omits height/class entirely — both are independently optional, neither defaults to a computed value", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "public", alt: "x" } }],
  };
  const html = renderDocNode(
    doc,
    undefined,
    new Map([["public", 3]]),
    new Map([["asset-1", { width: 800, height: null, cssClass: null }]])
  );
  assert.match(html, /<img src="\/m\/asset-1\/public\.v3\/image\.jpg" alt="x" width="800" loading="lazy">/);
  assert.doesNotMatch(html, /height=/);
  assert.doesNotMatch(html, /class=/);
});

test("renderDocNode: an asset absent from mediaAssetMetadata (never uploaded through the sizing UI, or the default empty map) renders without width/height/class — no regression on the pre-existing <img> shape", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "public", alt: "x" } }],
  };
  const html = renderDocNode(doc, undefined, new Map([["public", 3]])); // no 4th arg — default EMPTY_MEDIA_ASSET_METADATA
  assert.equal(html, '<img src="/m/asset-1/public.v3/image.jpg" alt="x" loading="lazy">');
});

test("renderDocNode: a hostile stored cssClass is HTML-escaped, same as alt — public HTML never trusts a stored string raw", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { assetId: "asset-1", transformName: "public", alt: "x" } }],
  };
  const html = renderDocNode(
    doc,
    undefined,
    new Map([["public", 3]]),
    new Map([["asset-1", { width: null, height: null, cssClass: '"><script>alert(1)</script>' }]])
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /class="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
});

test("renderDocNode: a malformed assetId/transformName (embedded '/', empty, or over-length) degrades to the placeholder even when the name would otherwise resolve — never a malformed /m/ URL", () => {
  const resolved = new Map([["public", 1], ["", 1]]);
  const cases: Array<{ assetId: string; transformName: string }> = [
    { assetId: "asset/1", transformName: "public" }, // '/' in assetId would smuggle an extra path segment
    { assetId: "asset 1", transformName: "public" }, // whitespace
    { assetId: "asset-1", transformName: "" }, // empty transformName, even though "" is (adversarially) a map key
    { assetId: "", transformName: "public" }, // empty assetId
    { assetId: "a".repeat(201), transformName: "public" }, // over MAX_MEDIA_REF_ID_LENGTH
  ];
  for (const attrs of cases) {
    const doc: JsonObject = { type: "doc", content: [{ type: "image", attrs: { ...attrs, alt: "x" } }] };
    const html = renderDocNode(doc, undefined, resolved);
    assert.match(html, /media-ph/, `expected placeholder for ${JSON.stringify(attrs)}`);
    assert.doesNotMatch(html, /<img/, `expected no <img> for ${JSON.stringify(attrs)}`);
  }
});

test("renderDocNode: a legacy src-only node still degrades to the placeholder even when mediaTransformVersions is non-empty — the ref path only activates on assetId+transformName, never on src", () => {
  const doc: JsonObject = {
    type: "doc",
    content: [{ type: "image", attrs: { src: "https://evil.example/x.png", alt: "legacy" } }],
  };
  const html = renderDocNode(doc, undefined, new Map([["public", 1]]));
  assert.match(html, /media-ph/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /evil\.example/);
});

test("renderSite: a ref-based image node embedded in a real post body renders a real <img> end-to-end through the declarative slot path, when the caller resolves mediaTransformVersions", async () => {
  const post = fakePost({
    bodyJson: {
      type: "doc",
      content: [{ type: "image", attrs: { assetId: "asset-42", transformName: "public", alt: "Team photo" } }],
    },
  });
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");
  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "Dispatch Demo",
    posts: [post],
    post,
    mediaTransformVersions: new Map([["public", 5]]),
  });
  assert.match(html, /<img src="\/m\/asset-42\/public\.v5\/image\.jpg" alt="Team photo" loading="lazy">/);
  assert.doesNotMatch(html, /media-ph/);
});

test("renderSite: an image node embedded in a real post body renders the placeholder end-to-end through both the declarative slot path and the shared Liquid/Handlebars `post.content` builder", async () => {
  const post = fakePost({
    bodyJson: {
      type: "doc",
      content: [{ type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "Team photo" } }],
    },
  });
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");
  const html = await renderSite({ theme, route: "post", siteTitle: "Dispatch Demo", posts: [post], post });
  assert.match(html, /media-ph/);
  assert.match(html, /Team photo/);
  assert.doesNotMatch(html, /base64,AAAA/);
});

test("renderSite: every v1 widget componentId renders correctly and escapes untrusted props (text/social-links/recent-entries+entry-summary/menu/contact-form/unknown->placeholder)", async () => {
  const theme = declarativeTheme({ type: "doc", content: [{ type: "region", key: "footer" }] });
  const ir: WidgetRenderIR[] = [
    { componentId: "text", props: { body: "<script>alert(1)</script>" } },
    { componentId: "social-links", props: { links: [{ platform: "<X>", url: "javascript:alert(1)" }] } },
    {
      componentId: "recent-entries",
      props: {},
      children: [{ componentId: "entry-summary", props: { id: "e1", title: "<Post>", slug: "post-1" } }],
    },
    { componentId: "menu", props: { title: "Main", items: [{ label: "Home", href: "/", available: true }, { label: "Hidden", available: false }] } },
    { componentId: "contact-form", props: { slug: "contact", fields: [{ id: "email", label: "Email", type: "email", required: true }], successMessage: null } },
    { componentId: "unknown-future-type", props: { secret: "leak-me" } },
  ];
  const html = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({ regions: { footer: ir } }),
  });

  // text: escaped, no script execution surface
  assert.match(html, /widget-text/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);

  // social-links: escaped label, javascript: href collapsed to '#' (C7 safeHref discipline)
  assert.match(html, /widget-social-links/);
  assert.match(html, /&lt;X&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);

  // recent-entries -> entry-summary child, escaped title, real slug link
  assert.match(html, /widget-recent-entries/);
  assert.match(html, /&lt;Post&gt;/);
  assert.match(html, /href="\/post-1"/);

  // menu: available item links, unavailable item renders as inert text (mirrors siteNav's own rule)
  assert.match(html, /widget-menu/);
  assert.match(html, /<a href="\/">Home<\/a>/);
  assert.match(html, /widget-menu-item--unavailable">Hidden</);

  // contact-form: posts to Forms' existing public route unmodified (REQ-37/39), field vocabulary rendered
  assert.match(html, /widget-contact-form/);
  assert.match(html, /action="\/forms\/contact\/submit"/);
  assert.match(html, /type="email"/);

  // unknown componentId -> the same public-safe placeholder, no secret leaked
  assert.match(html, /widget-placeholder/);
  assert.doesNotMatch(html, /leak-me/);
});

// ---------------------------------------------------------------------------
// contact-form field className/attributes — the admin "field attributes" modal's data reaching
// this public render path. `forms.ts`'s `validateFieldDescriptors` is the real gate (see that
// file's own tests); these pin what THIS renderer does with the two new properties once they've
// arrived here, including the defensive re-check `renderExtraFieldAttrs` does on the attribute
// NAME (see that function's own header for why a value's escaping is not enough for a name).
// ---------------------------------------------------------------------------

test("contact-form widget: a Tailwind-style className survives intact on the rendered input", async () => {
  const theme = declarativeTheme({ type: "doc", content: [{ type: "region", key: "footer" }] });
  const html = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({
      regions: {
        footer: [
          {
            componentId: "contact-form",
            props: {
              slug: "contact",
              fields: [{ id: "email", label: "Email", type: "email", required: true, className: "md:col-span-2 w-1/2 focus:ring-2" }],
              successMessage: null,
            },
          },
        ],
      },
    }),
  });
  assert.match(html, /class="md:col-span-2 w-1\/2 focus:ring-2"/);
});

test("contact-form widget: an allowlisted attribute renders, its value escaped (\" and < cannot break out of the attribute)", async () => {
  const theme = declarativeTheme({ type: "doc", content: [{ type: "region", key: "footer" }] });
  const html = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({
      regions: {
        footer: [
          {
            componentId: "contact-form",
            props: {
              slug: "contact",
              fields: [
                {
                  id: "email",
                  label: "Email",
                  type: "email",
                  required: true,
                  attributes: { "aria-label": 'Say "<hi>"', "data-testid": "email-field" },
                },
              ],
              successMessage: null,
            },
          },
        ],
      },
    }),
  });
  assert.match(html, /aria-label="Say &quot;&lt;hi&gt;&quot;"/);
  assert.match(html, /data-testid="email-field"/);
  assert.doesNotMatch(html, /Say "<hi>"/);
});

test("contact-form widget: a non-allowlisted attribute name (e.g. an 'onclick' that reached storage some other way) is never emitted, even though its value would otherwise escape safely", async () => {
  const theme = declarativeTheme({ type: "doc", content: [{ type: "region", key: "footer" }] });
  const html = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({
      regions: {
        footer: [
          {
            componentId: "contact-form",
            props: {
              slug: "contact",
              fields: [
                { id: "email", label: "Email", type: "email", required: true, attributes: { onclick: "alert(1)", style: "x" } },
              ],
              successMessage: null,
            },
          },
        ],
      },
    }),
  });
  assert.doesNotMatch(html, /onclick=/);
  assert.doesNotMatch(html, /style=/);
});

// ---------------------------------------------------------------------------
// SPEC-047 Slice 1/2 — "html"-format Page rendering, and `data-widget-embed`/`data-form-embed`
// ---------------------------------------------------------------------------

function htmlPage(overrides: Partial<PostRecord> = {}): PostRecord {
  return fakePost({
    kind: "page",
    bodyFormat: "html",
    bodyHtml: "<p>hello</p>",
    ...overrides,
  });
}

function emptyHtmlEmbeds(overrides: Partial<ResolveHtmlPageEmbedsResult> = {}): ResolveHtmlPageEmbedsResult {
  return { widgetResolved: new Map(), formResolved: new Map(), ...overrides };
}

test("renderSite (Slice 1): an 'html'-format post's body_html renders raw through the live dispatch theme's post.content — its bodyJson is never walked", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "themes", "liquidjs", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");

  const post = htmlPage({
    bodyHtml: '<section class="hero"><h1>Bespoke</h1></section>',
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "SHOULD NOT APPEAR" }] }] },
  });
  const html = await renderSite({ theme, route: "post", siteTitle: "Dispatch Demo", posts: [post], post });

  assert.match(html, /<section class="hero"><h1>Bespoke<\/h1><\/section>/);
  assert.doesNotMatch(html, /SHOULD NOT APPEAR/);
});

test("renderSite (Slice 1, declarative tier): the 'content' slot renders an html Page's bodyHtml raw", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: "<p>Slice 1 via slot</p>" });

  const html = await renderSite({ theme, route: "post", siteTitle: "T", posts: [post], post });
  assert.match(html, /<div class="prose"><p>Slice 1 via slot<\/p><\/div>/);
});

test("renderSite (Slice 2): data-widget-embed substitutes to its resolved widget IR; an id with no matching entry in the resolved map degrades to the REQ-28 placeholder", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({
    bodyHtml: '<div data-widget-embed="widget-1"></div><div data-widget-embed="widget-missing"></div>',
  });

  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "T",
    posts: [post],
    post,
    pageHtmlEmbeds: emptyHtmlEmbeds({
      widgetResolved: new Map([["widget-1", { componentId: "text", props: { body: "Embedded!" } }]]),
    }),
  });

  assert.match(html, /widget-text">Embedded!/);
  assert.equal((html.match(/widget-placeholder/g) ?? []).length, 1, "only the unresolved id degrades to the placeholder");
});

test("renderSite (Slice 2): data-form-embed substitutes to its resolved contact-form IR — the same renderer a real contact-form widget instance uses", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: '<div data-form-embed="form-1"></div>' });

  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "T",
    posts: [post],
    post,
    pageHtmlEmbeds: emptyHtmlEmbeds({
      formResolved: new Map([["form-1", { componentId: "contact-form", props: { slug: "contact-us", fields: [], successMessage: null } }]]),
    }),
  });

  assert.match(html, /widget-contact-form/);
  assert.match(html, /action="\/forms\/contact-us\/submit"/);
});

test("renderSite (Slice 2): an html Page's embed placeholders degrade safely when pageHtmlEmbeds is omitted entirely — never leaks the raw data-widget-embed markup", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: '<div data-widget-embed="widget-1"></div>' });

  const html = await renderSite({ theme, route: "post", siteTitle: "T", posts: [post], post });

  assert.doesNotMatch(html, /data-widget-embed/);
  assert.match(html, /widget-placeholder/);
});
