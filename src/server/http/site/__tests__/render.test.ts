import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { JsonObject } from "#src/core/ports";
import type { PostRecord } from "#src/features/post/index";
import { loadTheme, type DiscoveredTheme } from "#src/features/theme/index";
import type { ResolvePageWidgetsResult } from "#src/widgets/resolver-service";
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
