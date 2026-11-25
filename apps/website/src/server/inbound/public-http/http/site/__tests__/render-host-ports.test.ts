import assert from "node:assert/strict";
import test from "node:test";
import type { SiteRenderContext } from "@jini-ai/cms/public-http/http/site/render-context";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { TOVU_DOC_RENDER_CLASSES } from "#src/server/runtime/composition/doc-render-host";
import { renderBlock, renderBlockSeam } from "../render/blocks.js";
import { buildTemplateRenderData } from "../render/template-render-data.js";
import { entryContent } from "../render/post-body.js";

function context(post: ReturnType<typeof buildPostRecord>): SiteRenderContext {
  return { siteTitle: "Site", route: "post", posts: [], post: post as NonNullable<SiteRenderContext["post"]>, products: [], themeName: null, widgetRegions: {}, widgetInlineResolved: new Map(), mediaTransformVersions: new Map(), mediaAssetMetadata: new Map(), assignedTerms: [] };
}

test("declarative and both logic-tier bindings see the same resolved body and use the host media placeholder classes", () => {
  const post = buildPostRecord({ title: "Hello", bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "same body" }] }] } });
  const ctx = context(post);
  const body = "<p>same body</p>";
  // Declarative tier: the `content` slot. Logic tiers (Liquid and Handlebars share one data builder).
  assert.equal(renderBlock({ node: { type: "slot", name: "content" }, ctx }), `<div class="prose">${body}</div>`);
  assert.equal((buildTemplateRenderData(ctx).post as { content: string }).content, body);
  assert.ok(entryContent(ctx).includes(`<div class="prose">${body}</div>`));
  // Component seam: the hero's media placeholder takes Tovu's own class names.
  const hero = renderBlockSeam({ ctx, props: { component: "tovu/hero", title: "T", media: { label: "Pic" } } });
  assert.ok(hero.includes(`class="${TOVU_DOC_RENDER_CLASSES.mediaPlaceholder.box}"`));
  assert.ok(hero.includes(`class="${TOVU_DOC_RENDER_CLASSES.mediaPlaceholder.label}"`));
  const html = buildPostRecord({ bodyFormat: "html", bodyHtml: "<b>raw</b>", bodyJson: {} });
  assert.equal((buildTemplateRenderData(context(html)).post as { content: string }).content, "<b>raw</b>");
});
