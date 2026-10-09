import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "@jini-ai/core/primitives";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { renderSite, renderWidgetIr } from "../render.js";

test("a declarative theme region renders an HTML menu widget all the way into the public page", async () => {
  const theme: DiscoveredTheme = {
    manifest: { id: "menu-html", name: "Menu HTML", version: "1.0.0", tier: "declarative", engine: 1, regions: ["footer"] },
    tokens: {}, tokensLight: {}, templates: { home: { type: "doc", content: [{ type: "region", key: "footer" }] } },
    pages: {}, partials: {}, liquidTemplates: {}, handlebarsTemplates: {},
    dir: "/nonexistent/test-theme", css: "", source: "site", status: "valid", errors: [],
  };
  const html = await renderSite({ theme, route: "home", siteTitle: "Menu Demo", posts: [], widgets: {
    regions: { footer: [{ componentId: "menu", props: {
      title: "Footer", mode: "html", html: '<a class="custom" href="/docs">Docs</a>',
    } }] }, inlineResolved: new Map(),
  } });
  assert.ok(html.includes('<div class="widget-region widget-region--footer"><nav class="widget widget-menu"><h3 class="widget-menu-title">Footer</h3><a class="custom" href="/docs">Docs</a></nav></div>'));
});

test("the shared menu widget renderer inserts trusted stored HTML instead of retained items and escapes the title", () => {
  assert.equal(renderWidgetIr({ componentId: "menu", props: {
    title: "Header <&>", mode: "html",
    html: '<ul class="custom"><li><a href="/docs">Docs &amp; guides</a></li></ul><script>window.menuReady=true</script>',
    items: [{ label: "Home", href: "/", available: true }],
  } }), '<nav class="widget widget-menu"><h3 class="widget-menu-title">Header &lt;&amp;&gt;</h3><ul class="custom"><li><a href="/docs">Docs &amp; guides</a></li></ul><script>window.menuReady=true</script></nav>');
});

test("an HTML menu widget without markup or title renders its wrapper without reviving retained items", () => {
  const cases: JsonObject[] = [{ mode: "html", html: "" }, { mode: "html" }];
  for (const props of cases) {
    assert.equal(renderWidgetIr({ componentId: "menu", props: {
      ...props, items: [{ label: "Home", href: "/", available: true }],
    } }), '<nav class="widget widget-menu"></nav>');
  }
});

test("only HTML mode renders retained markup; items and legacy modes keep the item renderer's URL safety", () => {
  assert.equal(renderWidgetIr({ componentId: "menu", props: {
    mode: "html", html: "<p>Custom</p>",
    items: [{ label: "<Home>", href: "javascript:alert(1)", available: true }],
  } }), '<nav class="widget widget-menu"><p>Custom</p></nav>');
  for (const mode of ["items", undefined]) {
    assert.equal(renderWidgetIr({ componentId: "menu", props: {
      ...(mode === undefined ? {} : { mode }), html: "<p>Custom</p>",
      items: [{ label: "<Home>", href: "javascript:alert(1)", available: true }],
    } }), '<nav class="widget widget-menu"><ul><li><a href="#">&lt;Home&gt;</a></li></ul></nav>');
  }
});
