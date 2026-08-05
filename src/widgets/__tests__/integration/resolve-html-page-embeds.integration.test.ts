import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/repo.memory";
import { InMemoryFormDefinitionRepo } from "#src/forms/repo.memory";
import type { FormDefinitionRecord } from "#src/forms/types";
import { MAX_HTML_EMBEDS_PER_PAGE } from "../../html-embeds";
import { WIDGET_PAYLOAD_FIELD } from "../../entry-payload";
import { resolveHtmlPageEmbeds } from "../../resolver-service";
import { registerCoreResolver } from "../../resolvers/index";
import { createContactFormResolver } from "../../resolvers/contact-form";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "../../types";

/**
 * @file SPEC-047 Slice 2 — `resolveHtmlPageEmbeds`, the `data-widget-embed`/`data-form-embed`
 * resolution entry point for `"html"`-format Pages.
 *
 * Mirrors `resolver-service.integration.test.ts`'s own real-repo, no-test-double-repo style: a real
 * `InMemoryEntryRepo` for widget instances, a real `InMemoryFormDefinitionRepo` for the
 * `data-form-embed` sugar path, wired through the SAME `resolveWidgetType`/`CORE_RESOLVERS`
 * machinery `resolvePageWidgets` already uses — proving the "reuse, don't duplicate" requirement
 * this slice was dispatched under, not just asserting against a hand-rolled test double.
 */

const WORKSPACE_ID = "ws-html-embeds";
const NOW = "2026-08-05T00:00:00.000Z";

function seedTextWidget(entryRepo: InMemoryEntryRepo, id: string, body: string): Promise<void> {
  return entryRepo.save({
    id,
    workspaceId: WORKSPACE_ID,
    type: WIDGET_CONTENT_TYPE,
    slug: id,
    status: "published",
    title: "A text widget",
    bodyJson: null,
    fieldsJson: {
      ext: {
        [WIDGET_FIELD_NAMESPACE]: {
          [WIDGET_PAYLOAD_FIELD]: JSON.stringify({ widgetType: "text", config: { body }, status: "active" }),
        },
      },
    },
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  });
}

function formDefinition(overrides: Partial<FormDefinitionRecord> = {}): FormDefinitionRecord {
  return {
    id: "form-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact Us",
    slug: "contact-us",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test("resolveHtmlPageEmbeds: a data-widget-embed resolves to the referenced widget's real IR, batched through the same resolveWidgetInstances resolvePageWidgets uses", async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Hello from a Page embed");

  const { widgetResolved, formResolved } = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<p>intro</p><div data-widget-embed="widget-1"></div>' },
  });

  assert.deepEqual(widgetResolved.get("widget-1"), { componentId: "text", props: { body: "Hello from a Page embed" } });
  assert.equal(formResolved.size, 0);
});

test("resolveHtmlPageEmbeds: a data-widget-embed referencing a nonexistent id never throws — it is simply absent from the resolved map (the caller degrades it to the REQ-28 placeholder)", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const { widgetResolved } = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-widget-embed="does-not-exist"></div>' },
  });

  assert.equal(widgetResolved.has("does-not-exist"), false);
});

test("resolveHtmlPageEmbeds: a data-form-embed resolves through the REAL contact-form resolver via a synthetic instance — no throwaway widget instance needed", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const { formResolved, widgetResolved } = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-form-embed="form-1"></div>' },
  });

  const ir = formResolved.get("form-1");
  assert.ok(ir);
  assert.equal(ir?.componentId, "contact-form");
  assert.equal(ir?.props.slug, "contact-us");
  assert.equal(widgetResolved.size, 0);
});

test("resolveHtmlPageEmbeds: a data-form-embed referencing a disabled form definition degrades to the REQ-28 placeholder IR (REQ-38's EC-05 taxonomy), never throws", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition({ id: "form-disabled", slug: "disabled-form", status: "disabled" }));
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const { formResolved } = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-form-embed="form-disabled"></div>' },
  });

  // Present in the map (a form definition WAS found, matching how a found-but-broken widget stays
  // present in `widgetResolved` too — see `resolveWidgetInstances`'s own doc) — its VALUE is the
  // REQ-28 placeholder, not the real contact-form markup.
  assert.deepEqual(formResolved.get("form-disabled"), { componentId: "widget-placeholder", props: {} });
});

test("resolveHtmlPageEmbeds: widget and form embeds on the same page resolve independently, keyed by kind", async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Widget body");
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const { widgetResolved, formResolved } = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: '<div data-widget-embed="widget-1"></div><div data-form-embed="form-1"></div>',
    },
  });

  assert.equal(widgetResolved.size, 1);
  assert.equal(formResolved.size, 1);
});

test("resolveHtmlPageEmbeds: a page with more than MAX_HTML_EMBEDS_PER_PAGE distinct widget refs only resolves the first cap-worth (resource bound, REQ-25-style)", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const total = MAX_HTML_EMBEDS_PER_PAGE + 10;
  let html = "";
  for (let i = 0; i < total; i += 1) {
    await seedTextWidget(entryRepo, `widget-${i}`, `body ${i}`);
    html += `<div data-widget-embed="widget-${i}"></div>`;
  }

  const { widgetResolved } = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html },
  });

  assert.equal(widgetResolved.size, MAX_HTML_EMBEDS_PER_PAGE, "only the first MAX_HTML_EMBEDS_PER_PAGE distinct refs are resolved");
});

test("resolveHtmlPageEmbeds: no embeds in the html resolves to two empty maps, no repo calls beyond what an empty referencedIds set needs", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const { widgetResolved, formResolved } = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: "<p>just a paragraph, no embeds</p>" },
  });

  assert.equal(widgetResolved.size, 0);
  assert.equal(formResolved.size, 0);
});
