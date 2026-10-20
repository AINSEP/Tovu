import assert from "node:assert/strict";
import test from "node:test";
import { collectBodyReferences, collectPlacementReferences } from "../content-references.js";

test("L061 body references preserve order, deduplication and ignored values", () => {
  assert.deepEqual(collectBodyReferences({ bodyHtml: 1, termIds: "term", bodyJson: "invalid" }), []);
  assert.deepEqual(collectBodyReferences({
    bodyJson: { type: "doc", content: [
      { type: "image", attrs: { assetId: "m1" } },
      { type: "widgetEmbed", attrs: { widgetEntryId: "w1" } },
    ] },
    bodyHtml: `<div data-embed-config='{"type":"widget","id":"w1","slug":"ignored"}'></div><div data-embed-config='{"type":"WIDGET","slug":"w2"}'></div><div data-embed-config='{"type":"widget"}'></div><div data-embed-config='{"type":"post","id":"p1"}'></div>`,
    termIds: ["t1", null, 1, "", "t1", "t2"],
  }), [
    { entityType: "media", key: "m1" }, { entityType: "widget", key: "w1" },
    { entityType: "widget", key: "w2" }, { entityType: "term", key: "t1" }, { entityType: "term", key: "t2" },
  ]);
});

test("L061 placements keep disabled widget refs and authored media while ignoring non-objects", () => {
  assert.deepEqual(collectPlacementReferences({ placements: "invalid" }), []);
  assert.deepEqual(collectPlacementReferences({ placements: [null, 1, "placement", {
    placementId: "p1", widgetEntryId: "w1", enabled: false, content: { html: "/m/m1/original/file.png" },
  }, { placementId: "p2", widgetEntryId: "w1", content: { html: "/m/m1/original/file.png" } }, {}] }), [
    { entityType: "widget", key: "w1" }, { entityType: "media", key: "m1" },
  ]);
});
