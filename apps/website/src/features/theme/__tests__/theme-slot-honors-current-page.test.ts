import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderStaticPage } from "../static-render.js";
import { loadTheme } from "../theme.js";

/**
 * @file `ThemeSlotDescriptor.honorsCurrentPage`'s additive legacy fallback (see `theme.ts`'s
 * `parseSlots`): a `theme.json` that still writes the pre-2026-08-10 `"activeAttr": "<string>"`
 * spelling instead of the current `"honorsCurrentPage": true` must keep wiring `aria-current`
 * exactly as it always did. This repo's slots migration is additive/nullable, never a breaking
 * swap — an out-of-tree theme that never migrates its `theme.json` cannot be allowed to silently
 * stop marking its current nav link.
 *
 * Deliberately its own file, not an addition to `static-render.test.ts`: that file currently
 * hangs (fixtures still on the retired two-attribute marker vocabulary feeding the current
 * parser) and is off-limits pending its own investigation — see the embed-marker migration
 * progress notes. Every fixture below uses the CURRENT `data-embed-config` marker spine, the
 * same vocabulary `theme-pages-render.canary.test.ts` already exercises safely against real
 * theme files, specifically to stay clear of whatever triggers that hang.
 */

/** Minimal on-disk static theme: caller supplies the manifest body and any files beyond it. */
function makeStaticThemeDir(manifest: Record<string, unknown>, files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-slot-legacy-"));
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify(manifest), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  return dir;
}

test("a theme.json with only the legacy activeAttr string still wires aria-current on the current nav link", () => {
  const dir = makeStaticThemeDir(
    {
      id: "t",
      name: "T",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      slots: {
        nav: { source: "nav.html", activeAttr: "data-nav-current" },
        footer: { source: "footer.html" },
      },
    },
    {
      "nav.html": '<nav class="main-nav"><a href="pricing.html" data-nav-id="pricing">Pricing</a></nav>',
      "footer.html": "<footer>legacy theme footer</footer>",
      "pages/index.html": [
        "<html><body>",
        '<div data-embed-config=\'{"type":"partial","id":"nav","current":"pricing"}\'></div>',
        '<div data-embed-config=\'{"type":"partial","id":"footer"}\'></div>',
        "</body></html>",
      ].join(""),
    }
  );

  const theme = loadTheme({ themeDir: dir, id: "t", source: "site" });
  assert.equal(theme.status, "valid");
  assert.equal(
    theme.manifest.slots?.nav?.honorsCurrentPage,
    true,
    "legacy activeAttr normalizes onto honorsCurrentPage"
  );
  assert.equal(
    theme.manifest.slots?.footer?.honorsCurrentPage,
    undefined,
    "a slot declaring neither spelling stays unset"
  );

  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes('data-nav-id="pricing" aria-current="page"'), "the legacy spelling still wires aria-current");
  assert.ok(html?.includes("legacy theme footer"), "the footer slot still resolves");
});

test("a theme.json with the current honorsCurrentPage boolean wires aria-current the same way", () => {
  const dir = makeStaticThemeDir(
    {
      id: "t2",
      name: "T2",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      slots: {
        nav: { source: "nav.html", honorsCurrentPage: true },
      },
    },
    {
      "nav.html": '<nav><a href="docs.html" data-nav-id="docs">Docs</a></nav>',
      "pages/index.html":
        '<html><body><div data-embed-config=\'{"type":"partial","id":"nav","current":"docs"}\'></div></body></html>',
    }
  );

  const theme = loadTheme({ themeDir: dir, id: "t2", source: "site" });
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes('data-nav-id="docs" aria-current="page"'));
});

test("honorsCurrentPage: false behaves the same as absent — no aria-current wiring even with a current key", () => {
  const dir = makeStaticThemeDir(
    {
      id: "t3",
      name: "T3",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      slots: {
        nav: { source: "nav.html", honorsCurrentPage: false },
      },
    },
    {
      "nav.html": '<nav><a href="docs.html" data-nav-id="docs">Docs</a></nav>',
      "pages/index.html":
        '<html><body><div data-embed-config=\'{"type":"partial","id":"nav","current":"docs"}\'></div></body></html>',
    }
  );

  const theme = loadTheme({ themeDir: dir, id: "t3", source: "site" });
  const html = renderStaticPage({ theme, pageId: "index" });
  assert.ok(html?.includes('data-nav-id="docs">Docs'), "nav still resolves");
  assert.ok(!html?.includes("aria-current"), "explicit false opts out, same as never declaring the field");
});
