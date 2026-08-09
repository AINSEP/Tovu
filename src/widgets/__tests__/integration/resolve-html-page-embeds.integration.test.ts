import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/repo.memory";
import { InMemoryFormDefinitionRepo } from "#src/forms/repo.memory";
import type { FormDefinitionRecord } from "#src/forms/types";
import { CORE_PUBLIC_TRANSFORM_NAME } from "#src/media/bootstrap";
import { InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "#src/media/index";
import type { MediaRecord, TransformDefinitionRecord } from "#src/media/index";
import { MAX_HTML_EMBEDS_PER_PAGE } from "../../html-embeds";
import { WIDGET_PAYLOAD_FIELD } from "../../entry-payload";
import { resolveHtmlPageEmbeds } from "../../resolver-service";
import { registerCoreResolver } from "../../resolvers/index";
import { createContactFormResolver } from "../../resolvers/contact-form";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "../../types";

/**
 * @file SPEC-047 Slice 2 (registry-restructured 2026-08-07) — `resolveHtmlPageEmbeds`, the
 * `data-embed-type` resolution entry point for `"html"`-format Pages.
 *
 * Mirrors `resolver-service.integration.test.ts`'s own real-repo, no-test-double-repo style: a real
 * `InMemoryEntryRepo` for widget instances, a real `InMemoryFormDefinitionRepo` for the
 * `data-embed-type="form"` sugar path, wired through the SAME `resolveWidgetType`/`CORE_RESOLVERS`
 * machinery `resolvePageWidgets` already uses — proving the "reuse, don't duplicate" requirement
 * this slice was dispatched under, not just asserting against a hand-rolled test double.
 *
 * `resolveHtmlPageEmbeds`'s result is now keyed by TYPE then by id (`result.get("widget")?.get(id)`)
 * rather than by two fixed named fields — see `resolver-service.ts`'s own doc for why.
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

function mediaRecord(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: "asset-1",
    workspaceId: WORKSPACE_ID,
    title: "A photo",
    alt: "A scenic photo",
    caption: "",
    credit: "",
    source: { sha256: "a".repeat(64) },
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    ...overrides,
  };
}

function transformDefinition(overrides: Partial<TransformDefinitionRecord> = {}): TransformDefinitionRecord {
  return {
    id: "transform-1",
    workspaceId: WORKSPACE_ID,
    name: CORE_PUBLIC_TRANSFORM_NAME,
    version: 1,
    params: { format: "webp" },
    owner: "core",
    createdAt: NOW,
    ...overrides,
  };
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

test("resolveHtmlPageEmbeds: a data-embed-type=\"widget\" embed resolves to the referenced widget's real IR, batched through the same resolveWidgetInstances resolvePageWidgets uses", async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Hello from a Page embed");

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: '<p>intro</p><div data-embed-type="widget" data-embed-id="widget-1"></div>',
    },
  });

  assert.deepEqual(resolved.get("widget")?.get("widget-1"), {
    componentId: "text",
    props: { body: "Hello from a Page embed" },
  });
  assert.equal(resolved.get("form"), undefined);
});

test("resolveHtmlPageEmbeds: a data-embed-type=\"widget\" embed referencing a nonexistent id never throws — it is simply absent from the resolved map (the caller degrades it to the REQ-28 placeholder)", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="widget" data-embed-id="does-not-exist"></div>' },
  });

  assert.equal(resolved.get("widget")?.has("does-not-exist"), false);
});

test("resolveHtmlPageEmbeds: a data-embed-type=\"form\" embed resolves through the REAL contact-form resolver via a synthetic instance — no throwaway widget instance needed", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="form" data-embed-id="form-1"></div>' },
  });

  const ir = resolved.get("form")?.get("form-1");
  assert.ok(ir);
  assert.equal(ir?.componentId, "contact-form");
  assert.equal(ir?.props.slug, "contact-us");
  assert.equal(resolved.get("widget"), undefined);
});

test("resolveHtmlPageEmbeds: a data-embed-type=\"form\" embed referencing a disabled form definition degrades to the REQ-28 placeholder IR (REQ-38's EC-05 taxonomy), never throws", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition({ id: "form-disabled", slug: "disabled-form", status: "disabled" }));
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="form" data-embed-id="form-disabled"></div>' },
  });

  // Present in the map (a form definition WAS found, matching how a found-but-broken widget stays
  // present in the widget-type map too — see `resolveWidgetInstances`'s own doc) — its VALUE is the
  // REQ-28 placeholder, not the real contact-form markup.
  assert.deepEqual(resolved.get("form")?.get("form-disabled"), { componentId: "widget-placeholder", props: {} });
});

test("resolveHtmlPageEmbeds: widget and form embeds on the same page resolve independently, keyed by type", async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Widget body");
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: '<div data-embed-type="widget" data-embed-id="widget-1"></div><div data-embed-type="form" data-embed-id="form-1"></div>',
    },
  });

  assert.equal(resolved.get("widget")?.size, 1);
  assert.equal(resolved.get("form")?.size, 1);
});

test("resolveHtmlPageEmbeds: a page with more than MAX_HTML_EMBEDS_PER_PAGE distinct widget refs only resolves the first cap-worth (resource bound, REQ-25-style)", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const total = MAX_HTML_EMBEDS_PER_PAGE + 10;
  let html = "";
  for (let i = 0; i < total; i += 1) {
    await seedTextWidget(entryRepo, `widget-${i}`, `body ${i}`);
    html += `<div data-embed-type="widget" data-embed-id="widget-${i}"></div>`;
  }

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html },
  });

  assert.equal(resolved.get("widget")?.size, MAX_HTML_EMBEDS_PER_PAGE, "only the first MAX_HTML_EMBEDS_PER_PAGE distinct refs are resolved");
});

test("resolveHtmlPageEmbeds: no embeds in the html resolves to an empty result, no repo calls beyond what an empty referencedIds set needs", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: "<p>just a paragraph, no embeds</p>" },
  });

  assert.equal(resolved.size, 0);
});

test("resolveHtmlPageEmbeds: an unregistered/future embed type produces no entry in the result at all — HTML_EMBED_RESOLVERS has no arm for it, so the caller (render.ts) degrades every occurrence to the REQ-28 placeholder", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="some-future-type" data-embed-id="x1"></div>' },
  });

  assert.equal(resolved.get("some-future-type"), undefined);
  assert.equal(resolved.size, 0);
});

test("resolveHtmlPageEmbeds: a data-embed-type=\"widget\" embed with no data-embed-id (missing attribute) never throws and resolves nothing for that occurrence", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="widget"></div>' },
  });

  assert.equal(resolved.get("widget")?.size, 0);
});

// ---------------------------------------------------------------------------
// SPEC-047 Slice 3 (2026-08-07) — data-embed-type="media", the NEW resolver (not adapted from
// resolveWidgetType). Real InMemoryMediaRepo/InMemoryTransformDefinitionRepo, same "real repo, no
// hand-rolled test double" style as the widget/form coverage above.
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: a data-embed-type="media" embed with no data-embed-variant resolves against CORE_PUBLIC_TRANSFORM_NAME ("public") by default', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ alt: "A scenic photo", width: 640, height: 480, cssClass: "rounded" })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ name: CORE_PUBLIC_TRANSFORM_NAME, version: 2 })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="media" data-embed-id="asset-1"></div>' },
  });

  assert.deepEqual(resolved.get("media")?.get("asset-1"), {
    componentId: "media-image",
    props: {
      assetId: "asset-1",
      transformName: CORE_PUBLIC_TRANSFORM_NAME,
      version: 2,
      alt: "A scenic photo",
      width: 640,
      height: 480,
      cssClass: "rounded",
    },
  });
});

test('resolveHtmlPageEmbeds: a data-embed-type="media" embed with an explicit data-embed-variant resolves against that transform name, not the default', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord()]);
  const transformRepo = new InMemoryTransformDefinitionRepo([
    transformDefinition({ id: "t-public", name: CORE_PUBLIC_TRANSFORM_NAME, version: 1 }),
    transformDefinition({ id: "t-thumb", name: "thumb", version: 5, params: { width: 100, height: 100, format: "jpeg" } }),
  ]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="media" data-embed-id="asset-1" data-embed-variant="thumb"></div>' },
  });

  const ir = resolved.get("media")?.get("asset-1");
  assert.equal(ir?.props.transformName, "thumb");
  assert.equal(ir?.props.version, 5);
});

test('resolveHtmlPageEmbeds: a data-embed-type="media" embed referencing a nonexistent asset never throws — absent from the resolved map, degrades to the REQ-28 placeholder', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition()]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="media" data-embed-id="does-not-exist"></div>' },
  });

  assert.equal(resolved.get("media")?.has("does-not-exist"), false);
});

test('resolveHtmlPageEmbeds: a data-embed-type="media" embed whose asset exists but whose transform was never registered never throws — absent from the resolved map', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord()]);
  const transformRepo = new InMemoryTransformDefinitionRepo([]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="media" data-embed-id="asset-1"></div>' },
  });

  assert.equal(resolved.get("media")?.has("asset-1"), false);
});

test('resolveHtmlPageEmbeds: a data-embed-type="media" embed with a slash-smuggling data-embed-variant never reaches the transform lookup — shape-rejected before becoming a /m/ URL path segment', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord()]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ name: "evil/../../escape" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: '<div data-embed-type="media" data-embed-id="asset-1" data-embed-variant="evil/../../escape"></div>' },
  });

  assert.equal(resolved.get("media")?.has("asset-1"), false);
});

test('resolveHtmlPageEmbeds: with NO mediaRepo/transformRepo dependency supplied, a "media" embed never throws and simply cannot resolve — widget/form embeds on the same page are unaffected', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "still works");

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo }, // no mediaRepo/transformRepo — mirrors every pre-existing widget/form-only call site
    input: {
      workspaceId: WORKSPACE_ID,
      html: '<div data-embed-type="media" data-embed-id="asset-1"></div><div data-embed-type="widget" data-embed-id="widget-1"></div>',
    },
  });

  assert.equal(resolved.get("media")?.size, 0);
  assert.deepEqual(resolved.get("widget")?.get("widget-1"), { componentId: "text", props: { body: "still works" } });
});

test('resolveHtmlPageEmbeds: media, widget, and form embeds on the same page all resolve independently, keyed by type', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Widget body");
  const mediaRepo = new InMemoryMediaRepo([mediaRecord()]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition()]);
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html:
        '<div data-embed-type="widget" data-embed-id="widget-1"></div>' +
        '<div data-embed-type="form" data-embed-id="form-1"></div>' +
        '<div data-embed-type="media" data-embed-id="asset-1"></div>',
    },
  });

  assert.equal(resolved.get("widget")?.size, 1);
  assert.equal(resolved.get("form")?.size, 1);
  assert.equal(resolved.get("media")?.size, 1);
});
