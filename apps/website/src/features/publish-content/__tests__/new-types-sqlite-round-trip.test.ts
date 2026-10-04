import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { NoopContentTypeIndexProvisioner } from "#src/features/content-types/index";
import { contributeContentTypePublish } from "#src/features/content-types/publish-content";
import { SqliteContentTypeRepo } from "#src/features/content-types/repo.sqlite";
import { SqliteEntryRepo } from "#src/features/entries/repo.sqlite";
import { contributeFormPublish } from "#src/features/forms/publish-content";
import { SqliteFormDefinitionRepo } from "#src/features/forms/repo.sqlite";
import { contributeWidgetAreaPublish, contributeWidgetPublish } from "#src/features/widgets/publish-content";
import { bindWidgetArea, mutateWidgetAreaPlacements } from "#src/features/widgets/region-area-service";
import { SqliteWidgetRegionBindingRepo } from "#src/features/widgets/repo.sqlite";
import { createWidgetInstance, updateWidgetInstance } from "#src/features/widgets/write-service";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "#src/features/widgets/entry-payload";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";

import { entityKey } from "../planner.js";
import { applyReport, makeSite, packAll, plan, registerOnly, roundTrip, WORKSPACE_ID } from "./round-trip-harness.js";

/**
 * @file The factory-built types whose own tests run on in-memory repos (`form`, `content-type`,
 * `widget`, `widget-area`), round-tripped here on real SQLite on both sides: every value must read
 * back from the destination exactly as the source packed it, or the second plan is a permanent
 * false `changed`/`conflict`. (`taxonomy`, `term` and `collection-entry` already test on SQLite.)
 */

const at = "2026-09-01T00:00:00.000Z";

function instance(name: string) {
  const db = openContentDb(":memory:");
  const repos = {
    forms: new SqliteFormDefinitionRepo(db),
    contentTypes: new SqliteContentTypeRepo(db),
    entries: new SqliteEntryRepo(db),
    entryRefs: new SqliteEntryRefsRepo(db),
    bindings: new SqliteWidgetRegionBindingRepo(db),
  };
  const widget = { entries: repos.entries, contentTypes: repos.contentTypes, entryRefs: repos.entryRefs, bindings: repos.bindings, forms: repos.forms };
  let n = 0;
  const service = {
    entryRepo: repos.entries,
    contentTypeRepo: repos.contentTypes,
    entryRefsRepo: repos.entryRefs,
    bindingRepo: repos.bindings,
    clock: { nowMs: () => Date.parse(at) },
    ids: { newId: () => `${name}-${++n}-0000-0000` },
    authorize: async () => ({ allowed: true, reason: "test" }),
    outbox: new InMemoryOutbox(),
  };
  const site = makeSite(
    {
      form: { repo: repos.forms },
      "content-type": { repo: repos.contentTypes, indexProvisioner: new NoopContentTypeIndexProvisioner() },
      widget,
      "widget-area": widget,
    },
    name
  );
  return { repos, service, site };
}

test("form, content-type, widget and widget-area round-trip to `unchanged` on SQLite", async () => {
  registerOnly([contributeFormPublish(), contributeContentTypePublish(), contributeWidgetPublish(), contributeWidgetAreaPublish()]);
  const src = instance("src");
  const dst = instance("dst");

  await src.repos.forms.create({
    id: "src-form-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [
      { id: "email", label: "Email", type: "email", required: true },
      { id: "msg", label: "Message", type: "textarea", required: false, maxLength: 500 },
    ],
    notify: { enabled: true, recipients: ["owner@example.com"] },
    status: "active",
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  await src.repos.contentTypes.save({
    workspaceId: WORKSPACE_ID,
    key: "recipe",
    label: "Recipes",
    fields: [{ name: "servings", kind: "integer", required: false, queryable: false }],
    status: "deprecated",
    version: 3,
    tombstonedAt: null,
  });
  const actor = { principalId: "owner" };
  const { instance: about } = await createWidgetInstance({
    deps: src.service,
    input: { workspaceId: WORKSPACE_ID, actor, widgetType: "text", title: "About", config: { body: "Hello" }, slug: "about" },
  });
  const { areaEntry } = await bindWidgetArea({ deps: src.service, input: { workspaceId: WORKSPACE_ID, regionKey: "sidebar" } });
  await mutateWidgetAreaPlacements({
    deps: src.service,
    input: { workspaceId: WORKSPACE_ID, actor, areaEntryId: areaEntry.id, baseVersion: areaEntry.version, placements: [{ placementId: "p-1", widgetEntryId: about.id, enabled: true }] },
  });

  const { first, second, entities, destinationPack } = await roundTrip(src.site, dst.site);

  assert.deepEqual(
    first.rows.map((r) => [r.entityType, r.outcome]).sort(),
    [["content-type", "created"], ["form", "created"], ["widget", "created"], ["widget-area", "created"]].sort()
  );
  assert.deepEqual(second.rows.map((r) => [r.entityType, r.outcome]).filter(([, o]) => o !== "unchanged"), []);
  const hashes = (list: typeof entities) => Object.fromEntries(list.map((e) => [`${e.entityType}:${e.id}`, e.contentHash]));
  assert.deepEqual(hashes(destinationPack), hashes(entities));

  const form = await dst.repos.forms.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" });
  assert.equal(form?.name, "Contact");
  assert.equal(form?.status, "active");
  assert.deepEqual(form?.fields, [
    { id: "email", label: "Email", type: "email", required: true },
    { id: "msg", label: "Message", type: "textarea", required: false, maxLength: 500 },
  ]);
  assert.deepEqual(form?.notify, { enabled: true, recipients: ["owner@example.com"] });

  // Exercise writes into populated SQL destinations, including a deprecated collection becoming active.
  const sourceForm = await src.repos.forms.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" });
  await src.repos.forms.update({ ...sourceForm!, name: "Write to us", status: "disabled", version: 2,
    fields: [{ id: "email", label: "Your email", type: "email", required: true }, { id: "msg", label: "Details", type: "textarea", required: false, maxLength: 1000 }],
    notify: { enabled: true, recipients: ["editor@example.com", "support@example.com"] },
  });
  await src.repos.contentTypes.save({ workspaceId: WORKSPACE_ID, key: "recipe", label: "Dishes",
    fields: [{ name: "servings", kind: "integer", required: true, queryable: false }],
    status: "active", version: 4, tombstonedAt: null,
  });
  await updateWidgetInstance({ deps: src.service, input: { workspaceId: WORKSPACE_ID, actor,
    widgetInstanceId: about.id, baseVersion: about.version, title: "About us", config: { body: "Updated introduction" },
  } });
  const sourceArea = await src.repos.entries.findById({ workspaceId: WORKSPACE_ID, id: areaEntry.id });
  const placements = [{ placementId: "p-2", widgetEntryId: about.id, enabled: false }];
  await mutateWidgetAreaPlacements({ deps: src.service, input: { workspaceId: WORKSPACE_ID, actor,
    areaEntryId: areaEntry.id, baseVersion: sourceArea!.version, placements,
  } });
  const changedEntities = await packAll(src.site);
  const firstUpdate = await plan(changedEntities, dst.site, entities.map((e) => entityKey(e.entityType, e.id)));
  await applyReport(firstUpdate, changedEntities, dst.site);
  const updated = { first: firstUpdate, second: await plan(changedEntities, dst.site) };
  assert.deepEqual(updated.first.rows.map((r) => [r.entityType, r.outcome]).sort(),
    [["content-type", "forced"], ["form", "forced"], ["widget", "forced"], ["widget-area", "forced"]].sort());
  assert.deepEqual(updated.second.rows.map((r) => r.outcome), ["unchanged", "unchanged", "unchanged", "unchanged"]);
  const updatedForm = await dst.repos.forms.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" });
  assert.equal(updatedForm?.id, form?.id);
  assert.equal(updatedForm?.name, "Write to us");
  assert.equal(updatedForm?.status, "disabled");
  assert.deepEqual(updatedForm?.fields, [{ id: "email", label: "Your email", type: "email", required: true }, { id: "msg", label: "Details", type: "textarea", required: false, maxLength: 1000 }]);
  assert.deepEqual(updatedForm?.notify, { enabled: true, recipients: ["editor@example.com", "support@example.com"] });
  const collection = await dst.repos.contentTypes.findByKey({ workspaceId: WORKSPACE_ID, key: "recipe" });
  assert.equal(collection?.label, "Dishes");
  assert.equal(collection?.status, "active");
  assert.deepEqual(collection?.fields, [{ name: "servings", kind: "integer", required: true, queryable: false }]);
  const widget = await dst.repos.entries.findById({ workspaceId: WORKSPACE_ID, id: about.id });
  assert.equal(widget?.title, "About us");
  assert.deepEqual(parseWidgetInstancePayload(widget!.fieldsJson).config, { body: "Updated introduction" });
  const areas = await dst.repos.entries.listByWorkspace({ workspaceId: WORKSPACE_ID }, { type: "widget_area" });
  assert.equal(areas.length, 1);
  assert.deepEqual(parseWidgetAreaPayload(areas[0]!.fieldsJson).doc.placements, placements);
});

test("a contact-form widget lands pointing at the destination's own form (forms get a new id there), then stays unchanged", async () => {
  registerOnly([contributeFormPublish(), contributeWidgetPublish()]);
  const src = instance("src");
  const dst = instance("dst");
  await src.repos.forms.create({
    id: "src-form-1",
    workspaceId: WORKSPACE_ID,
    name: "Contact",
    slug: "contact",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  const { instance: widget } = await createWidgetInstance({
    deps: src.service,
    input: { workspaceId: WORKSPACE_ID, actor: { principalId: "owner" }, widgetType: "contact-form", title: "Talk", config: { formDefinitionId: "src-form-1" }, slug: "talk" },
  });

  const { first, second } = await roundTrip(src.site, dst.site);

  assert.deepEqual(first.applyOrder.indexOf("form") < first.applyOrder.indexOf("widget"), true, "forms apply before the widgets that name them");
  const landedForm = await dst.repos.forms.findBySlug({ workspaceId: WORKSPACE_ID, slug: "contact" });
  assert.ok(landedForm);
  assert.notEqual(landedForm.id, "src-form-1");
  const landed = await dst.repos.entries.findById({ workspaceId: WORKSPACE_ID, id: widget.id });
  assert.match(JSON.stringify(landed?.fieldsJson), new RegExp(`formDefinitionId\\\\":\\\\"${landedForm.id}`));
  assert.deepEqual(second.rows.map((r) => r.outcome), ["unchanged", "unchanged"]);
});
