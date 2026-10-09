import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";

import { buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { type RegistryDepsWithoutLimiter, toAssistantRegistryDeps } from "#src/assistant/__tests__/fixtures/registry-deps";
import { describeHardcodedLinkList, findHardcodedLinks, MIN_HARDCODED_LINK_LIST } from "../hardcoded-link-lists.js";
import { discoverAllBuiltInThemes } from "../index.js";
import { contributeThemesTools } from "../tool-registrations.js";

/**
 * @file A header, nav or footer partial that hard-codes a list of links (Luvira import, 2026-10-08:
 * `editorial-rose/render/partials/footer.html` baked its "Explore" and "Legal" columns into markup)
 * hides those links from Admin → Menus. The theme write tools still write the file — a partial may
 * deliberately carry plain links — and return a `warning` telling the model to use a menu and a
 * menu marker, the same warn-don't-refuse shape as `pages_write_html`'s hidden-until-script warning.
 */

const FOOTER_HARDCODED =
  `<footer><div class="footer-col"><h4>Explore</h4>` +
  `<a href="/services">Services</a><a href="/pricing">Pricing</a><a href="/about-us">About</a></div></footer>`;
const FOOTER_WITH_MARKERS =
  `<footer><a href="/" class="brand">Luvira</a>` +
  `<div class="footer-col"><h4>Explore</h4><div data-embed-config='{"type":"menu","id":"footer-explore"}'>` +
  `<a href="/services">Services</a><a href="/pricing">Pricing</a><a href="/about-us">About</a></div></div>` +
  `<a href="mailto:hi@example.com">hi@example.com</a><a href="https://www.linkedin.com/in/x">LinkedIn</a></footer>`;

test("internal links outside any menu marker are found, in document order", () => {
  assert.deepEqual(findHardcodedLinks({ html: FOOTER_HARDCODED }), ["/services", "/pricing", "/about-us"]);
});

test("links inside a menu marker are its fallback, and external, mailto, tel, fragment and templated hrefs are not internal links", () => {
  assert.deepEqual(findHardcodedLinks({ html: FOOTER_WITH_MARKERS }), ["/"]);
  assert.deepEqual(
    findHardcodedLinks({ html: `<a href="#top">Top</a><a href="tel:+1">Call</a><a href="//cdn.example.com/x">x</a><a href="{{ url }}">x</a><a href="{{url}}">y</a>` }),
    [],
  );
});

test("links in a comment are not markup; links inside a marker of another type still count", () => {
  assert.deepEqual(findHardcodedLinks({ html: `<!-- <a href="/a">a</a><a href="/b">b</a><a href="/c">c</a> -->` }), []);
  assert.deepEqual(
    findHardcodedLinks({ html: `<div data-embed-config='{"type":"partial","id":"x"}'><a href="/a">a</a></div>` }),
    ["/a"],
  );
});

test("a footer partial with a hard-coded link list gets a warning naming the links and the menu marker to use", () => {
  const warning = describeHardcodedLinkList({ path: "render/partials/footer.html", content: FOOTER_HARDCODED });
  assert.equal(typeof warning, "string");
  assert.match(warning!, /hard-codes 3 links \(\/services, \/pricing, \/about-us\)/);
  assert.match(warning!, /Admin → Menus/);
  assert.match(warning!, /menus_create_menu/);
  assert.match(warning!, /data-embed-config='\{"type":"menu","id":"<menu slug>"\}'/);
});

test("header, nav and footer partials are checked under any name variant; other files are not", () => {
  for (const partial of ["render/partials/nav.html", "render/partials/header.html", "render/partials/site-header.html", "render/partials/footer-minimal.html", "partials/navbar.hbs", "footer.liquid"]) {
    assert.equal(typeof describeHardcodedLinkList({ path: partial, content: FOOTER_HARDCODED }), "string", partial);
  }
  for (const other of ["render/pages/index.html", "render/partials/hero.html", "css/footer.css", "scripts/nav.js", "render/partials/navigation-notes.md"]) {
    assert.equal(describeHardcodedLinkList({ path: other, content: FOOTER_HARDCODED }), undefined, other);
  }
});

test("fewer links than a list (a brand link, a single CTA) and menu-rendered partials carry no warning", () => {
  const twoLinks = `<header><a href="/" class="brand">Brand</a><a href="/contact" class="btn">Contact</a></header>`;
  assert.equal(findHardcodedLinks({ html: twoLinks }).length, MIN_HARDCODED_LINK_LIST - 1);
  assert.equal(describeHardcodedLinkList({ path: "render/partials/nav.html", content: twoLinks }), undefined);
  assert.equal(describeHardcodedLinkList({ path: "render/partials/footer.html", content: FOOTER_WITH_MARKERS }), undefined);
});

test("the shipped starter's nav and footer partials (menu-rendered) carry no warning", () => {
  const starter = path.resolve(import.meta.dirname, "../../../../../../content/themes/static/tovu-starter/render/partials");
  for (const name of ["nav.html", "footer.html"]) {
    const content = fs.readFileSync(path.join(starter, name), "utf8");
    assert.equal(describeHardcodedLinkList({ path: `render/partials/${name}`, content }), undefined, name);
  }
});

// --- wired into theme_write_file / theme_edit_file ----------------------------------------------

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};
contributions.contributors.clear({});
contributions.contributors.register({ contribution: contributeThemesTools() });

function harness() {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-hardcoded-links-"));
  const dir = path.join(themesDir, "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "footer.html"), FOOTER_WITH_MARKERS, "utf8");
  const deps = {
    workspaceId: "ws-hardcoded-links",
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as RegistryDepsWithoutLimiter;
  const registrations = buildAssistantToolRegistrations(toAssistantRegistryDeps({ routeDeps: deps }), undefined, { contributions });
  async function call(toolId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const found = registrations.find((r) => r.descriptor.id === toolId);
    assert.ok(found, `expected '${toolId}' to be wired`);
    const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal };
    return (await found.handler(ctx)) as Record<string, unknown>;
  }
  return { call, footerPath: path.join(dir, "footer.html"), cleanup: () => fs.rmSync(themesDir, { recursive: true, force: true }) };
}

test("theme_write_file still writes a hard-coded footer but returns the warning", async () => {
  const { call, footerPath, cleanup } = harness();
  try {
    const result = await call("theme_write_file", { themeId: "plain", path: "footer.html", content: FOOTER_HARDCODED });
    assert.equal(fs.readFileSync(footerPath, "utf8"), FOOTER_HARDCODED);
    assert.match(result.warning as string, /hard-codes 3 links/);
  } finally {
    cleanup();
  }
});

test("theme_write_file on a menu-rendered footer carries no warning", async () => {
  const { call, cleanup } = harness();
  try {
    const result = await call("theme_write_file", { themeId: "plain", path: "footer.html", content: FOOTER_WITH_MARKERS });
    assert.equal("warning" in result, false);
  } finally {
    cleanup();
  }
});

test("theme_edit_file warns when the edited footer ends up hard-coding a link list", async () => {
  const { call, footerPath, cleanup } = harness();
  try {
    const marker = `<div data-embed-config='{"type":"menu","id":"footer-explore"}'>`;
    const result = await call("theme_edit_file", { themeId: "plain", path: "footer.html", oldString: marker, newString: "<div>" });
    assert.ok(!fs.readFileSync(footerPath, "utf8").includes("data-embed-config"));
    assert.match(result.warning as string, /hard-codes 4 links/);
  } finally {
    cleanup();
  }
});
