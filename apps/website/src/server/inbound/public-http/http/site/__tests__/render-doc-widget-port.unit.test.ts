import assert from "node:assert/strict";
import test from "node:test";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import { renderDocNodeWith } from "../render/doc/doc-nodes.js";
import { WIDGET_PLACEHOLDER_IR } from "@jini-ai/cms/public-http/http/site/render/widgets/placeholder";
import { renderDocNode } from "../render/content-html.js";

/**
 * @file The doc renderer reaches the widget renderer only through the injected `renderWidget` port
 * (`DocNodeRenderDeps.renderWidget`), so `render/doc/doc-nodes.ts` never imports the widget renderer.
 * These tests pin what the port receives and that `renderDocNode` binds the real renderer.
 */

/** A fake port that records every IR it is asked to render. */
function recordingWidgetRenderer(): { seen: WidgetRenderIR[]; renderWidget: (ir: WidgetRenderIR) => string } {
  const seen: WidgetRenderIR[] = [];
  return { seen, renderWidget: (ir) => { seen.push(ir); return `<fake-widget n="${seen.length}"/>`; } };
}

const RESOLVED_IR: WidgetRenderIR = { componentId: "text", props: { body: "hello" } };

test("a widgetEmbed node renders through the injected port with its resolved IR", () => {
  const { seen, renderWidget } = recordingWidgetRenderer();
  const html = renderDocNodeWith(
    { node: { type: "widgetEmbed", attrs: { placementId: "p1" } }, renderWidget },
    { inlineResolved: new Map([["p1", RESOLVED_IR]]) },
  );
  assert.equal(html, `<fake-widget n="1"/>`);
  assert.deepEqual(seen, [RESOLVED_IR]);
});

test("an unresolved widgetEmbed passes the placeholder IR to the port", () => {
  const { seen, renderWidget } = recordingWidgetRenderer();
  renderDocNodeWith({ node: { type: "widgetEmbed", attrs: { placementId: "missing" } }, renderWidget });
  renderDocNodeWith({ node: { type: "widgetEmbed", attrs: {} }, renderWidget });
  assert.deepEqual(seen, [WIDGET_PLACEHOLDER_IR, WIDGET_PLACEHOLDER_IR]);
});
test("the port reaches a widgetEmbed nested under other nodes, and wraps with the node's own class", () => {
  const { seen, renderWidget } = recordingWidgetRenderer();
  const doc = {
    type: "doc",
    content: [{ type: "bulletList", content: [{ type: "listItem", content: [
      { type: "widgetEmbed", attrs: { placementId: "p1", cssClass: "wide" } },
    ] }] }],
  };
  const html = renderDocNodeWith({ node: doc, renderWidget }, { inlineResolved: new Map([["p1", RESOLVED_IR]]) });
  assert.equal(html, `<ul><li><div class="widget-embed wide"><fake-widget n="1"/></div></li></ul>`);
  assert.deepEqual(seen, [RESOLVED_IR]);
});

test("renderDocNode binds the real widget renderer to the port", () => {
  const html = renderDocNode(
    { node: { type: "widgetEmbed", attrs: { placementId: "p1" } } },
    { inlineResolved: new Map([["p1", RESOLVED_IR]]) },
  );
  assert.equal(html, `<div class="widget widget-text">hello</div>`);
});
