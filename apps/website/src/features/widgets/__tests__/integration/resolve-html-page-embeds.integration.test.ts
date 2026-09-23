import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import type { PostRecord } from "#src/features/post/index";
import { InMemoryFormDefinitionRepo } from "#src/features/forms/repo.memory";
import type { FormDefinitionRecord } from "#src/features/forms/index";
import { CORE_PUBLIC_TRANSFORM_NAME, InMemoryMediaContentTypeStore, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "#src/features/media/index";
import type { MediaRecord, TransformDefinitionRecord } from "#src/features/media/index";
import { MAX_HTML_EMBEDS_PER_PAGE } from "../../html-embeds.js";
import { WIDGET_PAYLOAD_FIELD } from "../../entry-payload.js";
import { resolveHtmlPageEmbeds } from "../../resolver-service.js";
import { registerCoreResolver, createContactFormResolver } from "../../resolvers/index.js";
// Deliberately reaches across the widgets/ -> server/ layering line this file's other imports never
// cross: `resolver-service.ts`'s own production code must never import `render.ts` (see that file's
// header), but a __tests__/ file proving the FULL round trip — real resolver output piped into the
// real renderer — is exempt (`.dependency-cruiser.mjs`'s "feature/domain code" rule already carves
// out `__tests__/` for exactly this shape of cross-layer integration test). Used below to prove a
// `media` node's resolved `contentType` actually reaches a `<video>` tag, not just that the resolved
// JSON prop looks right.
import { renderWidgetIr } from "#src/server/inbound/public-http/http/site/render";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "../../types.js";

/**
 * @file SPEC-047 Slice 2 — `resolveHtmlPageEmbeds`, the embed-marker resolution entry point for
 * `"html"`-format Pages.
 *
 * Mirrors `resolver-service.integration.test.ts`'s own real-repo, no-test-double-repo style: a real
 * `InMemoryEntryRepo` for widget instances, a real `InMemoryFormDefinitionRepo` behind the
 * `contact-form` widget resolver, wired through the SAME `resolveWidgetType`/`CORE_RESOLVERS`
 * machinery `resolvePageWidgets` already uses — proving the "reuse, don't duplicate" requirement this
 * slice was dispatched under, not just asserting against a hand-rolled test double.
 *
 * `resolveHtmlPageEmbeds`'s result is keyed by TYPE then by id (`result.get("widget")?.get(id)`)
 * rather than by two fixed named fields — see `resolver-service.ts`'s own doc for why.
 *
 * **Rewritten 2026-08-10, on two counts.** Every fixture spoke the retired `data-embed-type` triple,
 * which `scanEmbedMarkers` does not read, so the suite had been failing wholesale since `b7acc21`.
 * And the `form` embed type it covered is gone (`embed-type-inventory.md`): those tests now exercise
 * the mechanism that replaced it — a real, persisted `contact-form` WIDGET instance — plus one
 * regression test pinning that `form` itself is now an unregistered token.
 */

const WORKSPACE_ID = "ws-html-embeds";
const NOW = "2026-08-05T00:00:00.000Z";

function seedWidget(entryRepo: InMemoryEntryRepo, id: string, payload: Record<string, unknown>, workspaceId: string = WORKSPACE_ID): Promise<void> {
  return entryRepo.save({
    id,
    workspaceId,
    type: WIDGET_CONTENT_TYPE,
    slug: id,
    status: "published",
    title: "A widget",
    bodyJson: null,
    fieldsJson: {
      ext: {
        [WIDGET_FIELD_NAMESPACE]: { [WIDGET_PAYLOAD_FIELD]: JSON.stringify({ status: "active", ...payload }) },
      },
    },
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  });
}

function seedTextWidget(entryRepo: InMemoryEntryRepo, id: string, body: string): Promise<void> {
  return seedWidget(entryRepo, id, { widgetType: "text", config: { body } });
}

/**
 * The replacement for the removed `form` embed type: a real `contact-form` widget instance whose
 * `config.formDefinitionId` names the Forms definition. This is what a `{"type":"widget"}` marker
 * points at when a page embeds a form.
 */
function seedContactFormWidget(entryRepo: InMemoryEntryRepo, id: string, formDefinitionId: string): Promise<void> {
  return seedWidget(entryRepo, id, { widgetType: "contact-form", config: { formDefinitionId } });
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
    htmlAttributes: null,
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

test('resolveHtmlPageEmbeds: a "widget" embed resolves to the referenced widget\'s real IR, batched through the same resolveWidgetInstances resolvePageWidgets uses', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Hello from a Page embed");

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: `<p>intro</p><div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`,
    },
  });

  assert.deepEqual(resolved.get("widget")?.get("widget-1"), {
    componentId: "text",
    props: { body: "Hello from a Page embed" },
  });
  assert.equal(resolved.size, 1, "only the one type present on the page appears in the result");
});

test('resolveHtmlPageEmbeds: a "widget" embed referencing a nonexistent id never throws — it is simply absent from the resolved map (the caller degrades it to the REQ-28 placeholder)', async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widget","id":"does-not-exist"}'></div>` },
  });

  assert.equal(resolved.get("widget")?.has("does-not-exist"), false);
});

test('resolveHtmlPageEmbeds: a contact-form WIDGET instance resolves through the REAL contact-form resolver — the mechanism that replaced the removed "form" embed type, producing the identical contact-form IR', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedContactFormWidget(entryRepo, "cf-widget-1", "form-1");
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widget","id":"cf-widget-1"}'></div>` },
  });

  const ir = resolved.get("widget")?.get("cf-widget-1");
  assert.ok(ir);
  assert.equal(ir?.componentId, "contact-form");
  assert.equal(ir?.props.slug, "contact-us");
  assert.equal(ir?.props.formDefinitionId, "form-1");
});

test('resolveHtmlPageEmbeds: the RETIRED "form" embed type has no resolver — every occurrence is absent from the result, exactly like any unregistered token, and nothing throws', async () => {
  // The regression this pins: a stored Page written before 2026-08-10 may still carry a `form`
  // marker. Removing the type must make it inert-and-degraded, never a crash and never a silent
  // resolution through some surviving code path. Note this is a DIFFERENT outcome from "unresolved":
  // `isPageEmbedType("form")` is now false, so `render.ts` leaves the marker's own markup untouched
  // rather than substituting a REQ-28 placeholder over it.
  const entryRepo = new InMemoryEntryRepo();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"form","id":"form-1"}'></div>` },
  });

  assert.equal(resolved.get("form"), undefined);
  assert.equal(resolved.size, 0);
});

test('resolveHtmlPageEmbeds: a contact-form widget referencing a DISABLED form definition degrades to the REQ-28 placeholder IR (REQ-38\'s EC-05 taxonomy), never throws', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedContactFormWidget(entryRepo, "cf-widget-disabled", "form-disabled");
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition({ id: "form-disabled", slug: "disabled-form", status: "disabled" }));
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widget","id":"cf-widget-disabled"}'></div>` },
  });

  // Present in the map (the widget instance WAS found) — its VALUE is the REQ-28 placeholder, not
  // the real contact-form markup. See `resolveWidgetInstances`'s own doc for that convention.
  assert.deepEqual(resolved.get("widget")?.get("cf-widget-disabled"), { componentId: "widget-placeholder", props: {} });
});

test("resolveHtmlPageEmbeds: a text widget and a contact-form widget on the same page each resolve to their own type's IR in ONE batched pass", async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Widget body");
  await seedContactFormWidget(entryRepo, "cf-widget-1", "form-1");
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html:
        `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>` +
        `<div data-embed-config='{"type":"widget","id":"cf-widget-1"}'></div>`,
    },
  });

  // Both live under the single `widget` key now — which is the whole point of removing `form`: one
  // marker type, one resolver, and the widget's own `widgetType` decides what it renders as.
  assert.equal(resolved.get("widget")?.size, 2);
  assert.equal(resolved.get("widget")?.get("widget-1")?.componentId, "text");
  assert.equal(resolved.get("widget")?.get("cf-widget-1")?.componentId, "contact-form");
});

test("resolveHtmlPageEmbeds: a page with more than MAX_HTML_EMBEDS_PER_PAGE distinct widget refs only resolves the first cap-worth (resource bound, REQ-25-style)", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const total = MAX_HTML_EMBEDS_PER_PAGE + 10;
  let html = "";
  for (let i = 0; i < total; i += 1) {
    await seedTextWidget(entryRepo, `widget-${i}`, `body ${i}`);
    html += `<div data-embed-config='{"type":"widget","id":"widget-${i}"}'></div>`;
  }

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html },
  });

  assert.equal(
    resolved.get("widget")?.size,
    MAX_HTML_EMBEDS_PER_PAGE,
    "only the first MAX_HTML_EMBEDS_PER_PAGE distinct refs are resolved"
  );
});

test("resolveHtmlPageEmbeds: no embeds in the html resolves to an empty result, no repo calls beyond what an empty referencedIds set needs", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: "<p>just a paragraph, no embeds</p>" },
  });

  assert.equal(resolved.size, 0);
});

test("resolveHtmlPageEmbeds: an unregistered/future embed type produces no entry in the result at all — HTML_EMBED_RESOLVERS has no arm for it, so the caller (render.ts) leaves every occurrence as authored", async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"some-future-type","id":"x1"}'></div>` },
  });

  assert.equal(resolved.get("some-future-type"), undefined);
  assert.equal(resolved.size, 0);
});

// ---------------------------------------------------------------------------
// Owner-reported log noise (2026-08-16 GitHub Pages export): `resolveHtmlPageEmbeds` logged
// "unknown embed type, every occurrence degrades to the placeholder" ~17 times for a real, live
// export that published successfully — https://leonaburime-ucla.github.io/tovu-demo/, `gh-pages`
// commit `c0e52de2`. Curling the live output showed the opposite of what the log claimed: the
// `menu`/`partial` markers it warned about were NOT placeholders — they carried real, resolved
// `<a href="...">` links, because `features/theme/static-render.ts`'s `resolveSlots`/
// `injectMenuEmbeds` (a LATER stage in `routes/site/pages.ts`'s `renderViaTemplate`) had already
// filled them in correctly, exactly as `isPageEmbedType`'s own doc in `resolver-service.ts`
// describes. These two tests pin that: a theme-structural type this stage never owned must not be
// reported as if this stage failed to resolve it, while a REAL unregistered/typo type must still be
// loud (see the "unregistered/future embed type" test above for that half, unchanged).
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: "menu"/"partial" markers — theme-structural types resolved by a LATER stage (features/theme/static-render.ts), never by this registry — do not log the "unknown embed type" warning, even though HTML_EMBED_RESOLVERS has no entry for either', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const resolved = await resolveHtmlPageEmbeds({
      deps: { entryRepo },
      input: {
        workspaceId: WORKSPACE_ID,
        html:
          `<nav data-embed-config='{"type":"menu","id":"menu-header-nav"}'>fallback</nav>` +
          `<div data-embed-config='{"type":"partial","id":"footer"}'></div>`,
      },
    });

    assert.equal(resolved.size, 0, "still nothing to resolve at THIS stage — ownership is unchanged, only the log changes");
    assert.deepEqual(warnings, [], 'no "unknown embed type" warning for a type this stage deliberately defers, not one it failed to resolve');
  } finally {
    console.warn = originalWarn;
  }
});

test('resolveHtmlPageEmbeds: a genuinely unregistered/typo embed type still logs the "unknown embed type" warning — the menu/partial carve-out must not silence a real author mistake', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    const resolved = await resolveHtmlPageEmbeds({
      deps: { entryRepo },
      input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widgt","id":"x1"}'></div>` },
    });

    assert.equal(resolved.size, 0);
    assert.equal(warnings.length, 1, "an actual unknown type must still warn exactly once");
    assert.equal(warnings[0]?.[0], "[widgets] resolveHtmlPageEmbeds: unknown embed type, every occurrence degrades to the placeholder");
    assert.equal((warnings[0][1] as { type: string }).type, "widgt");
  } finally {
    console.warn = originalWarn;
  }
});

test('resolveHtmlPageEmbeds: a "widget" embed with no id key never throws and resolves nothing for that occurrence', async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widget"}'></div>` },
  });

  assert.equal(resolved.get("widget")?.size, 0);
});

// ---------------------------------------------------------------------------
// `slug` (2026-08-31) — the owner-requested, human-memorable alternative to `id`, for `"widget"`
// markers only in this pass (`entries.slug` is unique per `(workspaceId, type)`; see
// `resolveWidgetTypeEmbeds`'s own doc). This directly exercises the form/contact-form use case that
// motivated the feature: an author writes `{"type":"widget","slug":"contact-form"}` instead of
// having to copy a UUID out of the widget's own edit screen.
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: a "widget" embed addressed by SLUG resolves to the same real IR an id-addressed embed would — the concrete form/contact-form use case this feature exists for', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedContactFormWidget(entryRepo, "cf-widget-1", "form-1");
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  await formDefinitionRepo.create(formDefinition());
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widget","slug":"cf-widget-1"}'></div>` },
  });

  // seedWidget stores the entry under `slug: id` (see this file's fixture helper) — so the marker's
  // slug and the seeded widget's id are literally the same string here, which is realistic: an
  // author picks a memorable slug when they CREATE the widget, they don't reuse its opaque id as one.
  const ir = resolved.get("widget")?.get("cf-widget-1");
  assert.ok(ir, "resolved under the SLUG the marker carried, not the widget's underlying id");
  assert.equal(ir?.componentId, "contact-form");
  assert.equal(ir?.props.slug, "contact-us");
});

test('resolveHtmlPageEmbeds: a "widget" embed referencing an UNKNOWN slug never throws — absent from the resolved map, degrading exactly like a dangling id (render.ts substitutes the REQ-28 placeholder)', async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widget","slug":"does-not-exist"}'></div>` },
  });

  assert.equal(resolved.get("widget")?.has("does-not-exist"), false);
});

test('resolveHtmlPageEmbeds: "id" is authoritative over "slug" when a marker carries both — the slug is not even looked up', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "resolved via id");
  // No widget exists under this slug at all — if the resolver fell back to it, findBySlug would
  // simply miss; asserting the RIGHT value resolves (not just "no crash") proves id truly wins.

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: `<div data-embed-config='{"type":"widget","id":"widget-1","slug":"nonexistent-slug"}'></div>`,
    },
  });

  assert.deepEqual(resolved.get("widget")?.get("widget-1"), { componentId: "text", props: { body: "resolved via id" } });
});

test('resolveHtmlPageEmbeds: slug lookups are workspace+type scoped — a same-slug widget in a DIFFERENT workspace never resolves across the boundary', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "other-ws-widget", "should never leak");
  // Re-save the same widget under a different workspace id but the SAME slug, proving the lookup is
  // scoped to (workspaceId, type, slug), not merely (type, slug).
  await entryRepo.save({
    id: "other-ws-widget",
    workspaceId: "a-completely-different-workspace",
    type: WIDGET_CONTENT_TYPE,
    slug: "shared-slug-name",
    status: "published",
    title: "A widget",
    bodyJson: null,
    fieldsJson: {
      ext: { [WIDGET_FIELD_NAMESPACE]: { [WIDGET_PAYLOAD_FIELD]: JSON.stringify({ status: "active", widgetType: "text", config: { body: "wrong workspace" } }) } },
    },
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
  });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"widget","slug":"shared-slug-name"}'></div>` },
  });

  assert.equal(resolved.get("widget")?.has("shared-slug-name"), false, "the other workspace's widget must not leak across the boundary");
});

test('resolveHtmlPageEmbeds: two DIFFERENT slug-addressed widgets on the same page each resolve independently in ONE batched pass (mirrors the pre-existing multi-id coverage above)', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-a", "A body");
  await seedTextWidget(entryRepo, "widget-b", "B body");

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html:
        `<div data-embed-config='{"type":"widget","slug":"widget-a"}'></div>` +
        `<div data-embed-config='{"type":"widget","slug":"widget-b"}'></div>`,
    },
  });

  assert.equal(resolved.get("widget")?.size, 2);
  assert.deepEqual(resolved.get("widget")?.get("widget-a"), { componentId: "text", props: { body: "A body" } });
  assert.deepEqual(resolved.get("widget")?.get("widget-b"), { componentId: "text", props: { body: "B body" } });
});

// ---------------------------------------------------------------------------
// SPEC-047 Slice 3 (2026-08-07) — the `media` type, a NEW resolver (not adapted from
// resolveWidgetType). Real InMemoryMediaRepo/InMemoryTransformDefinitionRepo, same "real repo, no
// hand-rolled test double" style as the widget coverage above.
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: a "media" embed with no variant resolves against CORE_PUBLIC_TRANSFORM_NAME ("public") by default', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([
    mediaRecord({ alt: "A scenic photo", width: 640, height: 480, cssClass: "rounded" }),
  ]);
  const transformRepo = new InMemoryTransformDefinitionRepo([
    transformDefinition({ name: CORE_PUBLIC_TRANSFORM_NAME, version: 2 }),
  ]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>` },
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
      htmlAttributes: null,
    },
  });
});

test('resolveHtmlPageEmbeds: a "media" embed whose asset is a recorded VIDEO resolves to a video IR — contentType present, no transformName/version, and no transform needs to be registered at all', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const sha256 = "b".repeat(64);
  const mediaRepo = new InMemoryMediaRepo([
    mediaRecord({ alt: "A hero clip", width: 1920, height: 1080, cssClass: "hero-video", source: { sha256 } }),
  ]);
  const transformRepo = new InMemoryTransformDefinitionRepo([]); // deliberately empty — video must never reach this
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID, sha256, contentType: "video/mp4" });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo, mediaContentTypeStore },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>` },
  });

  assert.deepEqual(resolved.get("media")?.get("asset-1"), {
    componentId: "media-image",
    props: {
      assetId: "asset-1",
      contentType: "video/mp4",
      alt: "A hero clip",
      width: 1920,
      height: 1080,
      cssClass: "hero-video",
      htmlAttributes: null,
    },
  });
});

test('resolveHtmlPageEmbeds: a "media" embed with mediaContentTypeStore supplied but no recorded type for this asset\'s sha256 falls through to the ordinary image path unchanged', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ alt: "A scenic photo", width: 640, height: 480, cssClass: "rounded" })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ name: CORE_PUBLIC_TRANSFORM_NAME, version: 2 })]);
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore(); // never `.set()` — a real "not sniffed yet" miss

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo, mediaContentTypeStore },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>` },
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
      htmlAttributes: null,
    },
  });
});

test('resolveHtmlPageEmbeds: a "media" embed with an explicit variant resolves against that transform name, not the default', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord()]);
  const transformRepo = new InMemoryTransformDefinitionRepo([
    transformDefinition({ id: "t-public", name: CORE_PUBLIC_TRANSFORM_NAME, version: 1 }),
    transformDefinition({ id: "t-thumb", name: "thumb", version: 5, params: { width: 100, height: 100, format: "jpeg" } }),
  ]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: `<div data-embed-config='{"type":"media","id":"asset-1","variant":"thumb"}'></div>`,
    },
  });

  const ir = resolved.get("media")?.get("asset-1");
  assert.equal(ir?.props.transformName, "thumb");
  assert.equal(ir?.props.version, 5);
});

test('resolveHtmlPageEmbeds: a "media" embed referencing a nonexistent asset never throws — absent from the resolved map, degrades to the REQ-28 placeholder', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition()]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"media","id":"does-not-exist"}'></div>` },
  });

  assert.equal(resolved.get("media")?.has("does-not-exist"), false);
});

test('resolveHtmlPageEmbeds: a "media" embed whose asset exists but whose transform was never registered never throws — absent from the resolved map', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord()]);
  const transformRepo = new InMemoryTransformDefinitionRepo([]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>` },
  });

  assert.equal(resolved.get("media")?.has("asset-1"), false);
});

test('resolveHtmlPageEmbeds: a "media" embed with a slash-smuggling variant never reaches the transform lookup — shape-rejected before becoming a /m/ URL path segment', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord()]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ name: "evil/../../escape" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: `<div data-embed-config='{"type":"media","id":"asset-1","variant":"evil/../../escape"}'></div>`,
    },
  });

  assert.equal(resolved.get("media")?.has("asset-1"), false);
});

test('resolveHtmlPageEmbeds: with NO mediaRepo/transformRepo dependency supplied, a "media" embed never throws and simply cannot resolve — widget embeds on the same page are unaffected', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "still works");

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo }, // no mediaRepo/transformRepo — mirrors every pre-existing widget-only call site
    input: {
      workspaceId: WORKSPACE_ID,
      html:
        `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>` +
        `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>`,
    },
  });

  assert.equal(resolved.get("media")?.size, 0);
  assert.deepEqual(resolved.get("widget")?.get("widget-1"), { componentId: "text", props: { body: "still works" } });
});

test("resolveHtmlPageEmbeds: media and widget embeds on the same page all resolve independently, keyed by type", async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedTextWidget(entryRepo, "widget-1", "Widget body");
  await seedContactFormWidget(entryRepo, "cf-widget-1", "form-1");
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
        `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div>` +
        `<div data-embed-config='{"type":"widget","id":"cf-widget-1"}'></div>` +
        `<div data-embed-config='{"type":"media","id":"asset-1"}'></div>`,
    },
  });

  assert.equal(resolved.get("widget")?.size, 2);
  assert.equal(resolved.get("media")?.size, 1);
});

// ---------------------------------------------------------------------------
// T10, 2026-09-16 embed-attributes plan — a "media" marker accepts "slug" the same way "widget"
// already does (2026-08-31, the block above): `{"type":"media","slug":"hero-video"}` resolves to that
// asset. `parseMediaEmbedRef` (resolver-service.ts) previously read `ref.id` ONLY, so a slug-only
// media marker silently degraded to the REQ-28 placeholder even though `findMediaByIdOrSlug` (the
// lookup it already called) has always accepted either. `id` still wins when both are present, and
// the returned map is keyed by whichever the marker itself typed (`ref.id ?? ref.slug`), matching
// render.ts's own lookup and the identical widget-slug precedent's doc.
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: a media marker with only "slug" resolves to that asset, keyed by the slug', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([
    mediaRecord({ id: "asset-1", slug: "hero-video", alt: "A scenic photo", width: 640, height: 480, cssClass: "rounded" }),
  ]);
  const transformRepo = new InMemoryTransformDefinitionRepo([
    transformDefinition({ name: CORE_PUBLIC_TRANSFORM_NAME, version: 2 }),
  ]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"media","slug":"hero-video"}'></div>` },
  });

  assert.equal(resolved.get("media")?.has("asset-1"), false, "must not be keyed by the resolved canonical id — the marker never typed it");
  const ir = resolved.get("media")?.get("hero-video");
  assert.equal(ir?.componentId, "media-image");
  assert.equal(ir?.props.assetId, "asset-1", "the served URL must still use the canonical id, not the slug");
  assert.equal(ir?.props.alt, "A scenic photo");
});

test("resolveHtmlPageEmbeds: a media marker with both id and slug uses id and never consults slug", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([
    mediaRecord({ id: "asset-a", slug: "asset-a-slug", alt: "Asset A" }),
    mediaRecord({ id: "asset-b", slug: "asset-b-slug", alt: "Asset B" }),
  ]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ name: CORE_PUBLIC_TRANSFORM_NAME, version: 1 })]);

  // Only asset-a's own id key is populated; if this fell back to slug for a marker carrying both, it
  // would surface asset-b's data instead of asset-a's.
  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: {
      workspaceId: WORKSPACE_ID,
      html: `<div data-embed-config='{"type":"media","id":"asset-a","slug":"asset-b-slug"}'></div>`,
    },
  });

  const ir = resolved.get("media")?.get("asset-a");
  assert.equal(ir?.props.assetId, "asset-a");
  assert.equal(ir?.props.alt, "Asset A", "id must win — asset-b's slug is never even consulted");
});

test("resolveHtmlPageEmbeds: an unknown media slug degrades to no entry (placeholder), never a throw", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition()]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID, html: `<div data-embed-config='{"type":"media","slug":"does-not-exist"}'></div>` },
  });

  assert.equal(resolved.get("media")?.has("does-not-exist"), false);
});

// ---------------------------------------------------------------------------
// `content`/`post` types (2026-08-11 unification) — guard 2 (visibility) at the resolver layer.
// `content` is the unified id-addressable marker's "doc"-format half; `post` is the legacy generic
// reference, retrofitted with the SAME visibility fix alongside it. Both resolve via
// `findPublishedPostById` (`features/post/post.ts`), not `PostRepoPort.findById` directly — these
// tests prove that filter is load-bearing at THIS seam, not just at `findPublishedPostById`'s own
// unit tests (`features/post/__tests__/post.test.ts`).
// ---------------------------------------------------------------------------

const WORKSPACE_ID_POST = "ws-content-embeds";

function postRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "entity-1",
    workspaceId: WORKSPACE_ID_POST,
    title: "A published entity",
    slug: "a-published-entity",
    bodyJson: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] }] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-08-11T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

test('resolveHtmlPageEmbeds: a "content" embed resolves a published, "doc"-format row (Post OR Page) to real data', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ kind: "page" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: {
      workspaceId: WORKSPACE_ID_POST,
      html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>`,
    },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir);
  assert.equal(ir?.componentId, "post-content");
  assert.equal(ir?.props.title, "A published entity");
});

// ---------------------------------------------------------------------------
// `header` (2026-09-04) — a "content" marker's own `header:false` opt-out of the
// `.post-detail-header` wrapper, threaded from the scanned `PageHtmlEmbedRef` into the
// "post-content" IR's `props.header`. Both `resolveContentTypeEmbeds` branches (the DB lookup here,
// and `pendingContentOverride` below) must agree — html-embeds.ts's own file header on
// `WRAPPER_PRESERVING_EMBED_TYPES` documents an earlier case where this exact pair of branches
// disagreed with each other.
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: a "content" embed with NO header key in its marker resolves props.header: true — the no-silent-behavior-change default', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ kind: "page" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  assert.equal(resolved.get("content")?.get("entity-1")?.props.header, true);
});

test('resolveHtmlPageEmbeds: a "content" embed with "header":false in its marker resolves props.header: false', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ kind: "page" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1","header":false}'></div>` },
  });

  assert.equal(resolved.get("content")?.get("entity-1")?.props.header, false);
});

test('GUARD 2: resolveHtmlPageEmbeds — a "content" embed referencing a DRAFT row never resolves, regardless of kind', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ id: "draft-1", status: "draft" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"draft-1"}'></div>` },
  });

  assert.equal(resolved.get("content")?.has("draft-1"), false, "a draft must not leak onto a public page via its id");
});

test('GUARD 2: resolveHtmlPageEmbeds — a "content" embed referencing a TRASHED row never resolves', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([
    postRecord({ id: "trashed-1", status: "published", deletedAt: "2026-08-11T00:00:00.000Z" }),
  ]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"trashed-1"}'></div>` },
  });

  assert.equal(resolved.get("content")?.has("trashed-1"), false);
});

test('resolveHtmlPageEmbeds: a "content" embed referencing an "html"-format row does not resolve at the registry stage — it is the recursive pre-splice pass\'s target, not this one\'s', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ id: "html-1", bodyFormat: "html", bodyHtml: "<p>hi</p>", kind: "page" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"html-1"}'></div>` },
  });

  assert.equal(resolved.get("content")?.has("html-1"), false);
});

test('resolveHtmlPageEmbeds: with NO postRepo dependency supplied, a "content" embed never throws and simply cannot resolve', async () => {
  const entryRepo = new InMemoryEntryRepo();

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  assert.equal(resolved.get("content")?.size, 0);
});

test('GUARD 2: resolveHtmlPageEmbeds — the legacy "post" embed type also refuses a DRAFT (retrofitted alongside "content", same hazard)', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ id: "draft-2", status: "draft" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"post","id":"draft-2"}'></div>` },
  });

  assert.equal(resolved.get("post")?.has("draft-2"), false);
});

test('GUARD 2 NEGATIVE VERIFICATION: a published row DOES resolve via "content" and "post" — proves the guard filters on status, not merely "postRepo present"', async () => {
  // Paired with the draft/trashed cases above: if the guard were vestigial (e.g. accidentally
  // checking `postRepo` truthiness instead of the row's own status), both the published and the
  // draft case would resolve identically. This pins the published case succeeding as the control.
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ id: "published-1" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: {
      workspaceId: WORKSPACE_ID_POST,
      html:
        `<div data-embed-config='{"type":"content","id":"published-1"}'></div>` +
        `<div data-embed-config='{"type":"post","id":"published-1"}'></div>`,
    },
  });

  assert.ok(resolved.get("content")?.has("published-1"));
  assert.ok(resolved.get("post")?.has("published-1"));
});

// ---------------------------------------------------------------------------
// `slug` (S3, 2026-09-23 widget-attrs plan) — `content`/`post` markers accept "slug" the same way
// `widget`/`media` already do (2026-08-31/2026-09-16 precedents above): `id` stays authoritative when
// a marker carries both, and a slug that resolves to a DRAFT or TRASHED row must refuse identically to
// guard 2's id-based check — the visibility guard is on the ROW `findPublishedPostBySlug` returns, not
// on which key was used to find it.
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: a "content" embed addressed by SLUG resolves the same published row an id-addressed embed would, keyed by the slug', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ kind: "page" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","slug":"a-published-entity"}'></div>` },
  });

  assert.equal(resolved.get("content")?.has("entity-1"), false, "must not be keyed by the resolved id — the marker never typed it");
  const ir = resolved.get("content")?.get("a-published-entity");
  assert.equal(ir?.componentId, "post-content");
  assert.equal(ir?.props.title, "A published entity");
});

test('resolveHtmlPageEmbeds: a "post" embed addressed by SLUG resolves the same way "content" does', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord()]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"post","slug":"a-published-entity"}'></div>` },
  });

  const ir = resolved.get("post")?.get("a-published-entity");
  assert.equal(ir?.componentId, "post-content");
  assert.equal(ir?.props.title, "A published entity");
});

test('GUARD 2 (slug twin): resolveHtmlPageEmbeds — a "content" embed addressed by a slug naming a DRAFT row never resolves', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecord({ id: "draft-1", slug: "draft-slug", status: "draft" })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","slug":"draft-slug"}'></div>` },
  });

  assert.equal(resolved.get("content")?.has("draft-slug"), false, "a draft must not leak onto a public page via its slug either");
});

test('GUARD 2 (slug twin): resolveHtmlPageEmbeds — a "content" embed addressed by a slug naming a TRASHED row never resolves', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([
    postRecord({ id: "trashed-1", slug: "trashed-slug", status: "published", deletedAt: "2026-08-11T00:00:00.000Z" }),
  ]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","slug":"trashed-slug"}'></div>` },
  });

  assert.equal(resolved.get("content")?.has("trashed-slug"), false);
});

test('resolveHtmlPageEmbeds: a "content" embed with both id and slug uses id and never consults slug — same precedent as the media/widget resolvers', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([
    postRecord({ id: "entity-1", slug: "entity-one-slug", title: "Entity One" }),
    postRecord({ id: "entity-2", slug: "entity-two-slug", title: "Entity Two" }),
  ]);

  // Only entity-1's own id key is populated; if this fell back to slug for a marker carrying both, it
  // would surface entity-2's data instead of entity-1's.
  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: {
      workspaceId: WORKSPACE_ID_POST,
      html: `<div data-embed-config='{"type":"content","id":"entity-1","slug":"entity-two-slug"}'></div>`,
    },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.equal(ir?.props.title, "Entity One", "id must win — entity-2's slug is never even consulted");
});

test("resolveHtmlPageEmbeds: pendingContentOverride matches a slug-only ref by override.slug, the same way it already matches an id-only ref by override.id", async () => {
  const entryRepo = new InMemoryEntryRepo();
  const pending = {
    id: "entity-1",
    title: "Unsaved Title",
    slug: "a-published-entity",
    updatedAt: "2026-09-23T00:00:00.000Z",
    bodyJson: { type: "doc" as const, content: [] },
  };

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, pendingContentOverride: pending },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","slug":"a-published-entity"}'></div>` },
  });

  const ir = resolved.get("content")?.get("a-published-entity");
  assert.equal(ir?.props.title, "Unsaved Title", "the override's unsaved data must win, matched by slug just like the id branch already does");
});

// ---------------------------------------------------------------------------
// Owner-reported bug (2026-08-12): a ref-based `image` node inside a "content"/"post" embed's own
// bodyJson rendered as a filename-labelled placeholder — everywhere this IR reaches (the editor's
// own "Preview" tab AND the published public page), even with the referenced asset, its "public"
// transform registration, and the `/m/` rendition route all confirmed live and working. Root cause:
// `resolvePostTypeEmbeds`/`resolveContentTypeEmbeds` built `"post-content"` IR `props` with only
// `title`/`slug`/`updatedAt`/`bodyJson` — `render.ts`'s `renderWidgetPostContent` then called
// `renderDocNode(bodyJson)` with no media context, which silently defaults `mediaTransformVersions`/
// `mediaAssetMetadata` to EMPTY MAPS, so every ref-based image's transform lookup was
// UNCONDITIONALLY a miss regardless of whether the asset/transform genuinely existed. These tests
// pin the fix at the seam that was actually missing the data — `resolvePostContentMediaContext`
// populating `props.mediaTransformVersions`/`props.mediaAssetMetadata` — not the (separately,
// already correctly tested) `renderDocNode` `image` case that consumes it.
// ---------------------------------------------------------------------------

function postRecordWithImage(overrides: Partial<PostRecord> = {}): PostRecord {
  return postRecord({
    bodyJson: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "before" }] },
        { type: "image", attrs: { assetId: "asset-1", transformName: CORE_PUBLIC_TRANSFORM_NAME, alt: "ref probe" } },
      ],
    },
    ...overrides,
  });
}

test('resolveHtmlPageEmbeds: a "content" embed\'s bodyJson containing a ref-based image resolves mediaTransformVersions/mediaAssetMetadata into its IR props — the exact data renderWidgetPostContent needs to render a real <img> instead of the placeholder', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecordWithImage()]);
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ workspaceId: WORKSPACE_ID_POST, width: 900, height: 600, cssClass: "hero" })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ workspaceId: WORKSPACE_ID_POST, version: 3 })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir);
  assert.deepEqual(ir?.props.mediaTransformVersions, { [CORE_PUBLIC_TRANSFORM_NAME]: 3 });
  // contentType: null — no mediaContentTypeStore supplied by this test, so it degrades to "not
  // known" the same way every other absent optional dep on this path does (2026-09-11 widening,
  // see resolvePostContentMediaContext's own doc).
  assert.deepEqual(ir?.props.mediaAssetMetadata, {
    "asset-1": { width: 900, height: 600, cssClass: "hero", htmlAttributes: null, contentType: null },
  });
});

test('resolveHtmlPageEmbeds: the legacy "post" embed type resolves the SAME mediaTransformVersions/mediaAssetMetadata for its bodyJson\'s ref-based images (both "post-content" IR builders shared the same gap, not just "content")', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecordWithImage()]);
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ workspaceId: WORKSPACE_ID_POST })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ workspaceId: WORKSPACE_ID_POST, version: 1 })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"post","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("post")?.get("entity-1");
  assert.ok(ir);
  assert.deepEqual(ir?.props.mediaTransformVersions, { [CORE_PUBLIC_TRANSFORM_NAME]: 1 });
});

test('resolveHtmlPageEmbeds: a "content" embed\'s bodyJson with a ref-based image, but NO mediaRepo/transformRepo supplied, still resolves the post data — mediaTransformVersions/mediaAssetMetadata degrade to empty rather than the whole embed failing (REQ-27, same never-throws discipline every resolver here follows)', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecordWithImage()]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo }, // no mediaRepo/transformRepo
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir, "the post itself must still resolve — only the media context degrades");
  assert.deepEqual(ir?.props.mediaTransformVersions, {});
  assert.deepEqual(ir?.props.mediaAssetMetadata, {});
});

test('resolveHtmlPageEmbeds: the "content" embed\'s pendingContentOverride branch (template-preview\'s unsaved-edit path) ALSO resolves mediaTransformVersions/mediaAssetMetadata for its override bodyJson — this is the editor\'s own "Preview" tab, the other surface the owner reported as broken alongside the published page', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ workspaceId: WORKSPACE_ID_POST })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ workspaceId: WORKSPACE_ID_POST, version: 2 })]);
  const pending = postRecordWithImage({ id: "entity-1" });

  const resolved = await resolveHtmlPageEmbeds({
    deps: {
      entryRepo,
      mediaRepo,
      transformRepo,
      pendingContentOverride: { id: "entity-1", title: pending.title, slug: pending.slug, updatedAt: pending.updatedAt, bodyJson: pending.bodyJson },
    },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir);
  assert.deepEqual(ir?.props.mediaTransformVersions, { [CORE_PUBLIC_TRANSFORM_NAME]: 2 });
});

// ---------------------------------------------------------------------------
// Owner-reported bug (2026-09-11, discovered verifying "the preview should always show the css and
// template" — see `PostEditor.tsx`'s `PostPreview` doc for the admin-side half of this fix): the
// generic `media` doc node (`lib/media-embed-extension.tsx`'s own file header — the node the admin
// editor now inserts for every dropped/pasted/picked asset, alongside the pre-existing `image` node)
// was never taught to this file's OWN asset-id collector. `isRefBasedImageNode`/`collectImageAssetIds`
// (above `resolvePostContentMediaContext`) still check `obj.type === "image"` only, so a `media` node
// embedded in a post/page body resolves NEITHER `mediaTransformVersions` NOR `mediaAssetMetadata` on
// this "post-content" IR path — the exact path both the admin template-preview route AND any live
// post rendered through a static-tier theme's own template go through. `render.ts`'s `renderDocMedia`
// then has an empty `mediaTransformVersions` map, so `tryRenderRefImage` inside it always returns
// `null` and the node degrades to the placeholder — regardless of whether the asset/transform is
// perfectly fine. `routes/site/pages.ts`'s OWN, separate collector (`collectMediaRefAssetIds`) was
// already widened to recognize `"media"` the same day; this file's copy was the missed call site.
// ---------------------------------------------------------------------------

function postRecordWithMediaNode(overrides: Partial<PostRecord> = {}): PostRecord {
  return postRecord({
    bodyJson: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "before" }] },
        { type: "media", attrs: { assetId: "asset-1", transformName: CORE_PUBLIC_TRANSFORM_NAME, alt: "media probe" } },
      ],
    },
    ...overrides,
  });
}

test('resolveHtmlPageEmbeds: the "content" embed\'s pendingContentOverride branch (the admin Preview tab\'s own path) resolves mediaTransformVersions/mediaAssetMetadata for a GENERIC "media" node too, not just the legacy "image" node — otherwise a real image/video referenced through `media` renders as a placeholder in Preview even though the asset is fine', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ workspaceId: WORKSPACE_ID_POST, width: 800, height: 500 })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ workspaceId: WORKSPACE_ID_POST, version: 5 })]);
  const pending = postRecordWithMediaNode({ id: "entity-1" });

  const resolved = await resolveHtmlPageEmbeds({
    deps: {
      entryRepo,
      mediaRepo,
      transformRepo,
      pendingContentOverride: { id: "entity-1", title: pending.title, slug: pending.slug, updatedAt: pending.updatedAt, bodyJson: pending.bodyJson },
    },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir);
  assert.deepEqual(
    ir?.props.mediaTransformVersions,
    { [CORE_PUBLIC_TRANSFORM_NAME]: 5 },
    "a 'media' node's own assetId must be collected the same way an 'image' node's is"
  );
  // contentType: null — no mediaContentTypeStore supplied by this test (2026-09-11 widening, see
  // resolvePostContentMediaContext's own doc).
  assert.deepEqual(ir?.props.mediaAssetMetadata, {
    "asset-1": { width: 800, height: 500, cssClass: null, htmlAttributes: null, contentType: null },
  });
});

test('resolveHtmlPageEmbeds: the legacy "post" embed type resolves the SAME mediaTransformVersions for a "media" node in its own bodyJson (both "post-content" IR builders share the one collector, so both share the fix)', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecordWithMediaNode()]);
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ workspaceId: WORKSPACE_ID_POST })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ workspaceId: WORKSPACE_ID_POST, version: 1 })]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo, mediaRepo, transformRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"post","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("post")?.get("entity-1");
  assert.ok(ir);
  assert.deepEqual(ir?.props.mediaTransformVersions, { [CORE_PUBLIC_TRANSFORM_NAME]: 1 });
});

// ---------------------------------------------------------------------------
// Owner-reported bug, widened 2026-09-11 past "preview only": `resolvePostContentMediaContext`
// (the function backing both `"post-content"` IR builders above) resolves `mediaAssetMetadata`
// WITHOUT `contentType` — unlike its sibling `pages.ts`'s `resolveMediaAssetMetadataForRender`,
// which DOES resolve it (see that function's own 2026-09-11 doc addendum). `render.ts`'s
// `renderDocMedia` dispatches a `media` node to `<video>` only when
// `mediaAssetMetadata.get(assetId)?.contentType` starts with `"video/"` — with the field always
// missing on this path, a video asset embedded in a post's OWN body renders through the `<img>`
// fallback instead, pointed at a video byte stream. This is NOT scoped to "a page embeds this
// post" — `renderViaTemplate` (`routes/site/pages.ts`) resolves a post's OWN public-URL render
// through `injectCurrentEntityContentId` -> `resolveContentTypeEmbeds`'s DB branch (line ~995),
// the exact branch under test below, so the live static-tier template render path for ANY post's
// own page is affected too.
//
// These two tests pipe the REAL resolver output into the REAL `render.ts` renderer (not a
// hand-built IR) so the assertion can't pass vacuously on a prop shape alone: it proves the actual
// emitted tag changes.
// ---------------------------------------------------------------------------

test('resolveHtmlPageEmbeds: a "content" embed\'s DB branch resolves contentType for a "media" node\'s asset, so a VIDEO asset renders a real <video> through render.ts\'s renderWidgetIr — the exact path a live post rendered through a static-tier theme\'s own template takes for its OWN body, not only a page that embeds the post', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecordWithMediaNode()]);
  const sha256 = "c".repeat(64);
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ workspaceId: WORKSPACE_ID_POST, source: { sha256 } })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ workspaceId: WORKSPACE_ID_POST, version: 1 })]);
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID_POST, sha256, contentType: "video/mp4" });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo, mediaRepo, transformRepo, mediaContentTypeStore },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir);
  assert.deepEqual((ir?.props.mediaAssetMetadata as Record<string, unknown>)["asset-1"], {
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    contentType: "video/mp4",
  });

  const html = renderWidgetIr(ir!);
  assert.match(html, /<video[\s>]/, "a video/* asset referenced by a 'media' node must render a real <video> tag through this path");
  assert.doesNotMatch(html, /<img[\s>]/, "a video asset must not fall through to the <img> placeholder/image path");
});

test('resolveHtmlPageEmbeds: CONTROL for the test above — the same "content" DB branch still renders a real <img>, not <video>, for an image/* asset through the identical path (proves the fix does not make everything look like a video)', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const postRepo = new InMemoryPostRepo([postRecordWithMediaNode()]);
  const sha256 = "d".repeat(64);
  const mediaRepo = new InMemoryMediaRepo([mediaRecord({ workspaceId: WORKSPACE_ID_POST, source: { sha256 } })]);
  const transformRepo = new InMemoryTransformDefinitionRepo([transformDefinition({ workspaceId: WORKSPACE_ID_POST, version: 1 })]);
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  await mediaContentTypeStore.set({ workspaceId: WORKSPACE_ID_POST, sha256, contentType: "image/png" });

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo, mediaRepo, transformRepo, mediaContentTypeStore },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir);
  const html = renderWidgetIr(ir!);
  assert.match(html, /<img[\s>]/, "an image/* asset must still render <img> through this path");
  assert.doesNotMatch(html, /<video[\s>]/);
});

test('resolveHtmlPageEmbeds: the "content" embed\'s pendingContentOverride branch resolves props.header from the SAME marker\'s header:false, exactly like the DB branch — the two branches must not disagree (html-embeds.ts\'s own doc names this exact divergence class)', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const pending = postRecord({ id: "entity-1" });

  const resolved = await resolveHtmlPageEmbeds({
    deps: {
      entryRepo,
      pendingContentOverride: { id: "entity-1", title: pending.title, slug: pending.slug, updatedAt: pending.updatedAt, bodyJson: pending.bodyJson },
    },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1","header":false}'></div>` },
  });

  assert.equal(resolved.get("content")?.get("entity-1")?.props.header, false);
});

test('resolveHtmlPageEmbeds: the "content" embed\'s pendingContentOverride branch defaults props.header to true when the marker has no header key, matching the DB branch\'s default', async () => {
  const entryRepo = new InMemoryEntryRepo();
  const pending = postRecord({ id: "entity-1" });

  const resolved = await resolveHtmlPageEmbeds({
    deps: {
      entryRepo,
      pendingContentOverride: { id: "entity-1", title: pending.title, slug: pending.slug, updatedAt: pending.updatedAt, bodyJson: pending.bodyJson },
    },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  assert.equal(resolved.get("content")?.get("entity-1")?.props.header, true);
});

// ---------------------------------------------------------------------------
// Owner-reported bug (2026-09-22): a `widgetEmbed` node inside a post's OWN bodyJson always rendered
// as the widget placeholder when the post went through a static-tier theme template — the
// `"post-content"` IR carried no inline-widget context, so `renderWidgetPostContent` handed
// `renderDocNode` an empty `inlineResolved` map. These tests pipe the real resolver output into the
// real renderer, so they pin the rendered HTML, not just the resolved JSON.
// ---------------------------------------------------------------------------

function postRecordWithWidgetEmbeds(overrides: Partial<PostRecord> = {}): PostRecord {
  return postRecord({
    bodyJson: {
      type: "doc",
      content: [
        { type: "widgetEmbed", attrs: { placementId: "placement-live", widgetEntryId: "inline-text-widget" } },
        { type: "widgetEmbed", attrs: { placementId: "placement-trashed", widgetEntryId: "inline-trashed-widget" } },
        { type: "widgetEmbed", attrs: { placementId: "placement-missing", widgetEntryId: "no-such-widget" } },
      ],
    },
    ...overrides,
  });
}

async function seedInlineWidgets(entryRepo: InMemoryEntryRepo): Promise<void> {
  await seedWidget(entryRepo, "inline-text-widget", { widgetType: "text", config: { body: "Inline hello" } }, WORKSPACE_ID_POST);
  await seedWidget(entryRepo, "inline-trashed-widget", { widgetType: "text", config: { body: "gone" }, status: "trash" }, WORKSPACE_ID_POST);
}

const EXPECTED_INLINE_WIDGET_BODY =
  `<div class="post-detail-body">` +
  `<div class="widget widget-text">Inline hello</div>` +
  `<div class="widget widget-placeholder" aria-hidden="true"></div>` +
  `<div class="widget widget-placeholder" aria-hidden="true"></div>` +
  `</div>`;

test('resolveHtmlPageEmbeds: a "content" embed\'s DB branch resolves the post body\'s inline widgetEmbed nodes, so renderWidgetIr renders the real widget (trashed/missing widgets still degrade to the placeholder) — the path every post rendered through a static-tier theme template takes', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedInlineWidgets(entryRepo);
  const postRepo = new InMemoryPostRepo([postRecordWithWidgetEmbeds()]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const ir = resolved.get("content")?.get("entity-1");
  assert.ok(ir);
  const html = renderWidgetIr(ir!);
  assert.ok(html.endsWith(EXPECTED_INLINE_WIDGET_BODY), `unexpected post body render: ${html}`);
});

test('resolveHtmlPageEmbeds: the "content" embed\'s pendingContentOverride branch (the admin Preview tab) resolves inline widgetEmbed nodes the same way as the DB branch', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedInlineWidgets(entryRepo);
  const pending = postRecordWithWidgetEmbeds();

  const resolved = await resolveHtmlPageEmbeds({
    deps: {
      entryRepo,
      pendingContentOverride: { id: "entity-1", title: pending.title, slug: pending.slug, updatedAt: pending.updatedAt, bodyJson: pending.bodyJson },
    },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"content","id":"entity-1"}'></div>` },
  });

  const html = renderWidgetIr(resolved.get("content")!.get("entity-1")!);
  assert.ok(html.endsWith(EXPECTED_INLINE_WIDGET_BODY), `unexpected post body render: ${html}`);
});

test('resolveHtmlPageEmbeds: the legacy "post" embed type resolves inline widgetEmbed nodes in its bodyJson too (all three "post-content" IR builders share one context helper)', async () => {
  const entryRepo = new InMemoryEntryRepo();
  await seedInlineWidgets(entryRepo);
  const postRepo = new InMemoryPostRepo([postRecordWithWidgetEmbeds()]);

  const resolved = await resolveHtmlPageEmbeds({
    deps: { entryRepo, postRepo },
    input: { workspaceId: WORKSPACE_ID_POST, html: `<div data-embed-config='{"type":"post","id":"entity-1"}'></div>` },
  });

  const html = renderWidgetIr(resolved.get("post")!.get("entity-1")!);
  assert.ok(html.endsWith(EXPECTED_INLINE_WIDGET_BODY), `unexpected post body render: ${html}`);
});
