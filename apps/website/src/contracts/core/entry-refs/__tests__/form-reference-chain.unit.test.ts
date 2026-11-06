import assert from "node:assert/strict";
import test from "node:test";
import { scanHtmlEmbeds } from "@jini-ai/cms/widgets/html";
import { extractEntryRefs, extractHtmlEntryRefs } from "../extractor.js";
import { InMemoryEntryRefsRepo } from "../repo.memory.js";

test("supported form placement persists the complete page-to-widget-to-form reference chain", async () => {
  const workspaceId = "site", pageId = "contact-page", widgetId = "contact-widget", formId = "contact-form";
  const html = `<div data-embed-config='{"type":"widget","id":"${widgetId}"}'></div>`;
  assert.equal(scanHtmlEmbeds({ html })[0]?.type, "widget");
  const repo = new InMemoryEntryRefsRepo();
  await repo.replaceForSource({ workspaceId, sourceEntryId: pageId,
    refs: extractHtmlEntryRefs({ workspaceId, sourceEntryId: pageId, html }) });
  await repo.replaceForSource({ workspaceId, sourceEntryId: widgetId, refs: extractEntryRefs({
    workspaceId, sourceEntryId: widgetId, sourceEntryType: "widget", bodyJson: null,
    fieldsExt: { widget: { widgetType: "contact-form", config: { formDefinitionId: formId } } },
  }) });
  const formReferences = await repo.findByTarget({ workspaceId, targetKind: "entry", targetId: formId });
  assert.equal(formReferences.length, 1);
  assert.equal(formReferences[0]!.sourceEntryId, widgetId);
  assert.equal(formReferences[0]!.sourceKind, "config-field");
  const widgetReferences = await repo.findByTarget({ workspaceId, targetKind: "entry", targetId: formReferences[0]!.sourceEntryId });
  assert.equal(widgetReferences.length, 1);
  assert.equal(widgetReferences[0]!.sourceEntryId, pageId);
  assert.equal(widgetReferences[0]!.sourceKind, "page-html-embed");
  assert.deepEqual(await repo.findByTarget({ workspaceId: "other", targetKind: "entry", targetId: formId }), []);
});
