import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { JsonObject } from "@jini-ai/cms/core";
import type { PostRecord } from "#src/features/post/index";
import { loadTheme, type DiscoveredTheme } from "#src/features/theme/index";
import type { ResolveHtmlPageEmbedsResult, ResolvePageWidgetsResult } from "#src/widgets/resolver-service";
import type { WidgetRenderIR } from "#src/widgets/types";
import { renderDocNode, renderSite, renderWidgetIr } from "../render";

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

test("renderDocNode: underline and strike marks render (Posts toolbar, 2026-08-11 — underline was silently dropped before this fix, strike had never rendered)", () => {
  const html = renderDocNode(
    textDoc(
      { type: "text", text: "u", marks: [{ type: "underline" }] },
      { type: "text", text: "s", marks: [{ type: "strike" }] }
    )
  );
  assert.equal(html, "<p><u>u</u><s>s</s></p>");
});

test("underline/strike compose with bold and with each other — the mark loop wraps progressively, so nesting order must match the marks array", () => {
  const html = renderDocNode(
    textDoc(
      { type: "text", text: "bu", marks: [{ type: "bold" }, { type: "underline" }] },
      { type: "text", text: "us", marks: [{ type: "underline" }, { type: "strike" }] }
    )
  );
  assert.equal(html, "<p><u><strong>bu</strong></u><s><u>us</u></s></p>");
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

test("renderDocNode: subscript and superscript marks render (Posts toolbar, 2026-08-11)", () => {
  const html = renderDocNode(
    textDoc(
      { type: "text", text: "2", marks: [{ type: "subscript" }] },
      { type: "text", text: "2", marks: [{ type: "superscript" }] }
    )
  );
  assert.equal(html, "<p><sub>2</sub><sup>2</sup></p>");
});

test("renderDocNode: hardBreak renders <br/> (Shift-Enter, 2026-08-11) — before this case existed, an unrecognized hardBreak fell through to `default`'s `renderNodes(content, ...)`, and since a leaf node's `content` is always undefined, that resolved to \"\": the line break silently vanished on the public site with no error", () => {
  const html = renderDocNode(
    textDoc({ type: "text", text: "line one" }, { type: "hardBreak" }, { type: "text", text: "line two" })
  );
  assert.equal(html, "<p>line one<br/>line two</p>");
});

test("renderDocNode: a highlight mark with no color attr renders a bare <mark> (the admin toolbar's plain toggle button)", () => {
  const html = renderDocNode(textDoc({ type: "text", text: "hi", marks: [{ type: "highlight" }] }));
  assert.equal(html, "<p><mark>hi</mark></p>");
});

test("a highlight mark with an allowlisted color attr renders an inline background-color style", () => {
  for (const color of ["#f0a", "#ff00aa", "red", "rgb(255, 0, 170)", "oklch(88.5% 0.062 18.334)"]) {
    const html = renderDocNode(textDoc({ type: "text", text: "hi", marks: [{ type: "highlight", attrs: { color } }] }));
    assert.equal(html, `<p><mark style="background-color:${color}">hi</mark></p>`);
  }
});

test("a highlight mark with an unsafe/malformed color attr degrades to a bare <mark> (no CSS injection)", () => {
  for (const color of ["red; } body { display:none", "url(javascript:alert(1))", "expression(alert(1))", "red;color:blue", 42, null]) {
    const html = renderDocNode(textDoc({ type: "text", text: "hi", marks: [{ type: "highlight", attrs: { color } as never }] }));
    assert.equal(html, "<p><mark>hi</mark></p>");
  }
});

test("hardBreak composes with surrounding marked text and can appear more than once", () => {
  const html = renderDocNode(
    textDoc(
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
      { type: "hardBreak" },
      { type: "hardBreak" },
      { type: "text", text: "plain" }
    )
  );
  assert.equal(html, "<p><strong>bold</strong><br/><br/>plain</p>");
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
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");

  const html = await renderSite({ theme, route: "home", siteTitle: "Dispatch Demo", posts: [] });
  assert.doesNotMatch(html, /tovu-site-assistant-root/);
  assert.doesNotMatch(html, /site-assistant\.js/);
  assert.doesNotMatch(html, /site-assistant\.css/);
});

test("renderSite: siteAssistantEnabled:false is the same as omitting it — no mount node, no script, no stylesheet", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(theme.status, "valid");

  const html = await renderSite({ theme, route: "home", siteTitle: "Dispatch Demo", posts: [], siteAssistantEnabled: false });
  assert.doesNotMatch(html, /tovu-site-assistant-root/);
  assert.doesNotMatch(html, /site-assistant\.js/);
  assert.doesNotMatch(html, /site-assistant\.css/);
});

test("renderSite: siteAssistantEnabled:true injects the stylesheet link, mount node, and deferred script, once each, in the page shell (not a theme template)", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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
// SPEC-047 Slice 1/2 — "html"-format Page rendering, and `data-embed-type` embeds
// ---------------------------------------------------------------------------

function htmlPage(overrides: Partial<PostRecord> = {}): PostRecord {
  return fakePost({
    kind: "page",
    bodyFormat: "html",
    bodyHtml: "<p>hello</p>",
    ...overrides,
  });
}

function htmlEmbeds(byType: Readonly<Record<string, ReadonlyMap<string, WidgetRenderIR>>> = {}): ResolveHtmlPageEmbedsResult {
  return new Map(Object.entries(byType));
}

test("renderSite (Slice 1): an 'html'-format post's body_html renders raw through the live dispatch theme's post.content — its bodyJson is never walked", async () => {
  const theme = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
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

test("renderSite (Slice 2): a data-embed-type=\"widget\" embed substitutes to its resolved widget IR; an id with no matching entry in the resolved map degrades to the REQ-28 placeholder", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({
    bodyHtml:
      '<div data-embed-type="widget" data-embed-id="widget-1"></div>' +
      '<div data-embed-type="widget" data-embed-id="widget-missing"></div>',
  });

  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "T",
    posts: [post],
    post,
    pageHtmlEmbeds: htmlEmbeds({
      widget: new Map([["widget-1", { componentId: "text", props: { body: "Embedded!" } }]]),
    }),
  });

  assert.match(html, /widget-text">Embedded!/);
  assert.equal((html.match(/widget-placeholder/g) ?? []).length, 1, "only the unresolved id degrades to the placeholder");
});

test("renderSite (Slice 2): a contact-form WIDGET embed substitutes to its resolved contact-form IR — since `form` was removed as an embed type (2026-08-10) this is the ONE way a Page embeds a form, and it goes through the widget renderer unchanged", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: `<div data-embed-config='{"type":"widget","id":"cf-widget-1"}'></div>` });

  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "T",
    posts: [post],
    post,
    pageHtmlEmbeds: htmlEmbeds({
      widget: new Map([
        ["cf-widget-1", { componentId: "contact-form", props: { slug: "contact-us", fields: [], successMessage: null } }],
      ]),
    }),
  });

  assert.match(html, /widget-contact-form/);
  assert.match(html, /action="\/forms\/contact-us\/submit"/);
});

test("renderSite (Slice 2): an html Page's embed placeholders degrade safely when pageHtmlEmbeds is omitted entirely — never leaks the raw data-embed-type markup", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: '<div data-embed-type="widget" data-embed-id="widget-1"></div>' });

  const html = await renderSite({ theme, route: "post", siteTitle: "T", posts: [post], post });

  assert.doesNotMatch(html, /data-embed-type/);
  assert.match(html, /widget-placeholder/);
});

test("renderSite (Slice 2): an unknown embed type degrades to the REQ-28 placeholder exactly like a known-type resolution failure — render.ts never distinguishes the two externally", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: '<div data-embed-type="media" data-embed-id="asset-1"></div>' });

  const html = await renderSite({ theme, route: "post", siteTitle: "T", posts: [post], post, pageHtmlEmbeds: htmlEmbeds() });

  assert.doesNotMatch(html, /data-embed-type/);
  assert.match(html, /widget-placeholder/);
});

// ---------------------------------------------------------------------------
// SPEC-047 Slice 3 (2026-08-07) — "media-image" widget IR: the render side of a
// data-embed-type="media" Page embed, resolved by resolver-service.ts's resolveMediaTypeEmbeds.
// ---------------------------------------------------------------------------

test("renderSite (Slice 2, media): a resolved data-embed-type=\"media\" embed renders a real <img> through the same /m/ URL contract the TipTap ref-image case uses", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: '<div data-embed-type="media" data-embed-id="asset-1" data-embed-variant="public"></div>' });

  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "T",
    posts: [post],
    post,
    pageHtmlEmbeds: htmlEmbeds({
      media: new Map([
        [
          "asset-1",
          { componentId: "media-image", props: { assetId: "asset-1", transformName: "public", version: 3, alt: "A photo", width: 640, height: 480, cssClass: "rounded" } },
        ],
      ]),
    }),
  });

  assert.match(html, /<img src="\/m\/asset-1\/public\.v3\/image\.jpg" alt="A photo" width="640" height="480" class="rounded" loading="lazy">/);
});

test("renderSite (Slice 2, media): width/height/class are each omitted independently when null, never a zeroed/empty attribute", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: '<div data-embed-type="media" data-embed-id="asset-1"></div>' });

  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "T",
    posts: [post],
    post,
    pageHtmlEmbeds: htmlEmbeds({
      media: new Map([
        ["asset-1", { componentId: "media-image", props: { assetId: "asset-1", transformName: "public", version: 1, alt: "", width: null, height: null, cssClass: null } }],
      ]),
    }),
  });

  const imgMatch = html.match(/<img[^>]*>/);
  assert.ok(imgMatch, "expected exactly one <img> tag in the rendered page");
  assert.equal(imgMatch![0], '<img src="/m/asset-1/public.v1/image.jpg" alt="" loading="lazy">', "no width/height/class attribute on the <img> itself — the page shell's own <meta viewport>/wrapper <div class> must not be mistaken for these");
});

test("renderSite (Slice 2, media): a malformed media-image IR (missing assetId — should never happen from this codebase's own resolver, defense-in-depth only) degrades to the ordinary widget placeholder rather than a malformed <img>", async () => {
  const theme = declarativeTheme({ type: "doc", content: [] });
  theme.templates.entry = { type: "doc", content: [{ type: "slot", name: "content" }] };
  const post = htmlPage({ bodyHtml: '<div data-embed-type="media" data-embed-id="asset-1"></div>' });

  const html = await renderSite({
    theme,
    route: "post",
    siteTitle: "T",
    posts: [post],
    post,
    pageHtmlEmbeds: htmlEmbeds({
      media: new Map([["asset-1", { componentId: "media-image", props: { transformName: "public", version: 1 } }]]),
    }),
  });

  assert.doesNotMatch(html, /<img/);
  assert.match(html, /widget-placeholder/);
});

/**
 * Heading anchors (docs sidebar, 2026-08-10). A menu of `#anchor` links is inert unless the rendered
 * headings carry matching ids, and until now `renderDocNode` emitted a bare `<hN>` — so every
 * in-page anchor on the site pointed at nothing. Additive: an `id` changes no rendering, only what
 * a link can target.
 */

function headingDoc(...headings: Array<[string, number]>): JsonObject {
  return {
    type: "doc",
    content: headings.map(([text, level]) => ({
      type: "heading",
      attrs: { level },
      content: [{ type: "text", text }],
    })),
  };
}

test("renderDocNode: headings get a slugified id an in-page anchor can target", () => {
  const html = renderDocNode(headingDoc(["Getting Started", 2], ["What is a theme?", 3]));
  assert.ok(html.includes('<h2 id="getting-started">Getting Started</h2>'));
  assert.ok(html.includes('<h3 id="what-is-a-theme">What is a theme?</h3>'));
});

test("renderDocNode: the anchor slug matches post.ts's slugify dialect, not a second one", () => {
  // Same rule: lowercase, every non-alphanumeric run collapses to one dash, edges trimmed.
  const html = renderDocNode(headingDoc(["C++ & Rust — a Comparison!", 2]));
  assert.ok(html.includes('id="c-rust-a-comparison"'), html);
});

test("renderDocNode: repeated headings are suffixed within one document, first one unsuffixed", () => {
  const html = renderDocNode(headingDoc(["Overview", 2], ["Overview", 2], ["Overview", 3]));
  assert.ok(html.includes('<h2 id="overview">'));
  assert.ok(html.includes('<h2 id="overview-2">'));
  assert.ok(html.includes('<h3 id="overview-3">'));
});

test("renderDocNode: dedupe is per-document — two documents may each own the same anchor", () => {
  const a = renderDocNode(headingDoc(["Overview", 2]));
  const b = renderDocNode(headingDoc(["Overview", 2]));
  assert.equal(a, b, "a second post's #overview must not inherit the first post's suffix");
  assert.ok(a.includes('id="overview"'));
});

test("renderDocNode: a heading whose text slugifies to nothing gets no id, never id=\"\"", () => {
  const html = renderDocNode(headingDoc(["🎉", 2], ["...", 2]));
  assert.ok(!html.includes('id=""'));
  assert.ok(html.includes("<h2>🎉</h2>"));
});

test("renderDocNode: the slug comes from the heading's text, ignoring inline marks", () => {
  const html = renderDocNode({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          { type: "text", text: "Design ", marks: [{ type: "bold" }] },
          { type: "text", text: "tokens" },
        ],
      },
    ],
  });
  assert.ok(html.includes('<h2 id="design-tokens">'), html);
  assert.ok(html.includes("<strong>Design </strong>"), "the visible markup is untouched");
});

// ---------------------------------------------------------------------------
// TextAlign (@tiptap/extension-text-align, admin PostEditor.tsx Toolbar, 2026-08-11)
// ---------------------------------------------------------------------------

test("renderDocNode: a paragraph's textAlign attr renders as an inline style", () => {
  const html = renderDocNode({
    type: "doc",
    content: [{ type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Hi" }] }],
  });
  assert.ok(html.includes('<p style="text-align:center">Hi</p>'), html);
});

test("renderDocNode: a heading's textAlign attr renders alongside its own id attribute, id first", () => {
  const html = renderDocNode({
    type: "doc",
    content: [{ type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "Overview" }] }],
  });
  assert.ok(html.includes('<h2 id="overview" style="text-align:right">Overview</h2>'), html);
});

test("renderDocNode: textAlign 'left' (the CSS default) never emits an explicit style attribute", () => {
  const html = renderDocNode({
    type: "doc",
    content: [{ type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Hi" }] }],
  });
  assert.equal(html, "<p>Hi</p>");
});

test("renderDocNode: no textAlign attr at all renders exactly as before this feature (regression)", () => {
  const html = renderDocNode({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] });
  assert.equal(html, "<p>Hi</p>");
});

// ---------------------------------------------------------------------------
// Post-title-in-document (apps/admin/src/lib/post-title-extension.ts, 2026-08-11)
// ---------------------------------------------------------------------------

test("renderDocNode: a 'title' node contributes nothing to a generic doc walk — every OTHER render path prints post.title separately, so this node rendering text too would duplicate it", () => {
  const html = renderDocNode({
    type: "doc",
    content: [
      { type: "title", content: [{ type: "text", text: "My Post" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body." }] },
    ],
  });
  assert.equal(html, "<p>Body.</p>", "the title node's own text must not leak into the generic body render");
});

test("renderWidgetIr('post-content'): a body with NO title node falls back to props.title exactly as before this feature (back-compat for every pre-existing post)", () => {
  const html = renderWidgetIr({
    componentId: "post-content",
    props: { title: "Legacy Post", bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] } },
  });
  assert.ok(html.includes("<h1>Legacy Post</h1>"), html);
  assert.equal((html.match(/<h1/g) ?? []).length, 1, "exactly one <h1>, never two");
  assert.ok(html.includes("<p>Body.</p>"));
});

test("renderWidgetIr('post-content'): a body WITH a title node renders the node's own text/marks as the <h1>, not props.title", () => {
  const html = renderWidgetIr({
    componentId: "post-content",
    props: {
      // Deliberately a STALE props.title, proving the title node — not this field — drives the <h1>
      // once one is present (props.title still feeds the admin list/slug/search elsewhere; it just
      // isn't what renders here anymore).
      title: "Stale Title",
      bodyJson: {
        type: "doc",
        content: [
          { type: "title", content: [{ type: "text", text: "Fresh " }, { type: "text", text: "Title", marks: [{ type: "bold" }] }] },
          { type: "paragraph", content: [{ type: "text", text: "Body." }] },
        ],
      },
    },
  });
  assert.ok(html.includes("<h1>Fresh <strong>Title</strong></h1>"), html);
  assert.ok(!html.includes("Stale Title"));
  assert.equal((html.match(/<h1/g) ?? []).length, 1, "exactly one <h1>, never two");
});

test("renderWidgetIr('post-content'): the title node's textAlign attr renders on the <h1> — centering it in the editor must center it here", () => {
  const html = renderWidgetIr({
    componentId: "post-content",
    props: {
      title: "Ignored",
      bodyJson: {
        type: "doc",
        content: [
          { type: "title", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Centered" }] },
          { type: "paragraph", content: [{ type: "text", text: "Body." }] },
        ],
      },
    },
  });
  assert.ok(html.includes('<h1 style="text-align:center">Centered</h1>'), html);
});

test("renderWidgetIr('post-content'): an empty title node (freshly synthesized, not yet typed into) renders a real but empty <h1>, never the placeholder or a crash", () => {
  const html = renderWidgetIr({
    componentId: "post-content",
    props: {
      title: "",
      bodyJson: { type: "doc", content: [{ type: "title", content: [] }, { type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
    },
  });
  assert.ok(html.includes("<h1></h1>"), html);
  assert.ok(!html.includes("widget-placeholder"));
});
