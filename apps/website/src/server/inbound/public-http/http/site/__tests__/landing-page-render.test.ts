/** Owner report 2026-10-12 (tovu.dev): the landing carousel's play button did nothing. The page's own
 * inline scripts and its button SVG icons were removed on the way to the public page, so render the
 * REAL landing body through the full public render paths and pin that both survive byte-exact. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { renderViaTemplate } from "#src/server/inbound/public-http/routes/site/pages";
import { renderSite } from "../render.js";

// The Landing body the admin Interactive editor's locked script blocks (d6b6bbce6) are pinned against.
const body = readFileSync(new URL("../../../../../../../../admin/src/features/pages/__tests__/fixtures/landing-scriptblocks.html", import.meta.url), "utf8");
const scripts = body.match(/<script>[\s\S]*?<\/script>/g) ?? [];
const svgs = body.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
const playButtons = body.match(/<button type="button" class="reel-play"[\s\S]*?<\/button>/g) ?? [];

function assertPageScriptsAndIcons(html: string, label: string): void {
  for (const script of scripts) assert.ok(html.includes(script), `${label}: inline script lost: ${script.slice(0, 120)}`);
  for (const button of playButtons) assert.ok(html.includes(button), `${label}: play button or its icon lost: ${button}`);
  for (const svg of svgs) assert.ok(html.includes(svg), `${label}: SVG icon lost: ${svg}`);
}

test("fixture carries the page scripts and button icons this file pins", () => {
  // Guards against a fixture edit silently emptying the assertions below.
  assert.equal(scripts.length, 3);
  assert.equal(playButtons.length, 4);
  assert.ok(svgs.length >= playButtons.length + 2);
  assert.ok(scripts.some(script => script.includes("setAttribute('data-playing'")));
});

test("no-theme public render keeps the landing page scripts and button SVGs", async () => {
  const post = buildPostRecord({ workspaceId: "ws-landing", kind: "page", bodyFormat: "html", bodyHtml: body });
  assertPageScriptsAndIcons(await renderSite({ theme: null, route: "post", siteTitle: "Tovu", posts: [], post }), "renderSite");
});

test("static-tier template render keeps the landing page scripts and button SVGs, saved and pending", async () => {
  const deps = createRouteDeps();
  const post = buildPostRecord({ workspaceId: deps.workspaceId, kind: "page", bodyFormat: "html", bodyHtml: body });
  deps.postRepo = new InMemoryPostRepo([post]);
  const theme = {
    manifest: { id: "landing-test", name: "Landing test", version: "1.0.0", tier: "static", engine: 1, templates: ["post.html"] },
    dir: "/nonexistent/landing-test", tokens: {}, tokensLight: {}, templates: {}, liquidTemplates: {}, handlebarsTemplates: {},
    pages: { post: `<html><head><title>{{title}}</title></head><body><main data-embed-config='{"type":"content"}'></main></body></html>` },
    partials: {}, css: "", source: "site", status: "valid", errors: [],
  } as unknown as DiscoveredTheme;
  assertPageScriptsAndIcons(await renderViaTemplate(deps, theme, post, undefined), "saved");
  assertPageScriptsAndIcons(await renderViaTemplate(deps, theme, post, undefined, undefined, body), "pending");
});
