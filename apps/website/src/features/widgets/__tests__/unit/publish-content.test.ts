import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "#src/contracts/core/entry-refs/repo.memory";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { InMemoryFormDefinitionRepo } from "@jini-ai/cms/forms";
import { TrashAwareInMemoryEntryRepo } from "#src/features/entries/trash-aware-memory-repo";
import { applyReport, makeSite, packAll, plan, registerOnly, roundTrip, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import { contributeWidgetAreaPublish, contributeWidgetPublish } from "../../publish-content.js";
import { bindWidgetArea, mutateWidgetAreaPlacements } from "@jini-ai/cms/widgets";
import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import { createWidgetInstance } from "@jini-ai/cms/widgets";
import { parseWidgetAreaPayload } from "@jini-ai/cms/widgets";

function instance(name: string) {
  const ports = {
    entries: new TrashAwareInMemoryEntryRepo(),
    contentTypes: new InMemoryContentTypeRepo(),
    entryRefs: new InMemoryEntryRefsRepo(),
    bindings: new InMemoryWidgetRegionBindingRepo(),
    forms: new InMemoryFormDefinitionRepo(),
  };
  let n = 0;
  const service = {
    entryRepo: ports.entries,
    contentTypeRepo: ports.contentTypes,
    entryRefsRepo: ports.entryRefs,
    bindingRepo: ports.bindings,
    clock: { nowMs: () => Date.parse("2026-09-01T00:00:00.000Z") },
    ids: { newId: () => `${name}-${++n}-0000-0000` },
    authorize: async () => ({ allowed: true, reason: "test" }),
    outbox: new InMemoryOutbox(),
  };
  return { ports, service, site: makeSite({ widget: ports, "widget-area": ports }, name) };
}

async function sites() {
  registerOnly([contributeWidgetAreaPublish(), contributeWidgetPublish()]);
  const src = instance("src");
  const dst = instance("dst");
  const actor = { principalId: "owner" };
  const text = (title: string, body: string) =>
    createWidgetInstance({ deps: { host: buildWidgetHostPorts({}, {}), ...src.service }, input: { workspaceId: WORKSPACE_ID, actor, widgetType: "text", title, config: { body }, slug: title.toLowerCase() } });
  const a = (await text("About", "Hello")).instance;
  const b = (await text("Hours", "9-5")).instance;
  const { areaEntry } = await bindWidgetArea({ deps: { host: buildWidgetHostPorts({}, {}), ...src.service }, input: { workspaceId: WORKSPACE_ID, regionKey: "sidebar" } });
  const placements = [
    { placementId: "p-1", widgetEntryId: b.id, enabled: true },
    { placementId: "p-2", widgetEntryId: a.id, enabled: false },
  ];
  await mutateWidgetAreaPlacements({ deps: { host: buildWidgetHostPorts({}, {}), ...src.service }, input: { workspaceId: WORKSPACE_ID, actor, areaEntryId: areaEntry.id, baseVersion: areaEntry.version, placements } });
  return { src, dst, a, b, placements };
}

test("widget + widget-area round trip: widgets first with their ids, the region's placements land and bind, then unchanged", async () => {
  const { dst, a, b, placements, src } = await sites();
  const { first, second } = await roundTrip(src.site, dst.site);

  assert.deepEqual(first.applyOrder.filter((t) => t.startsWith("widget")), ["widget", "widget-area"]);
  assert.deepEqual(first.rows.map((r) => [r.entityType, r.entityId, r.outcome]).sort(), [
    ["widget", a.id, "created"],
    ["widget", b.id, "created"],
    ["widget-area", "sidebar", "created"],
  ].sort());
  assert.deepEqual(second.rows.map((r) => r.outcome), ["unchanged", "unchanged", "unchanged"]);

  const binding = await dst.ports.bindings.findByRegion({ workspaceId: WORKSPACE_ID, regionKey: "sidebar" });
  assert.ok(binding, "the destination region is bound");
  const area = await dst.ports.entries.findById({ workspaceId: WORKSPACE_ID, id: binding.areaEntryId });
    assert.match(JSON.stringify(area?.fieldsJson), new RegExp(placements.map((p) => p.placementId).join(".*")));
    assert.ok(area);
    assert.deepEqual(parseWidgetAreaPayload({ fieldsJson: area.fieldsJson }).doc.placements, placements);
  assert.equal((await dst.ports.entries.findById({ workspaceId: WORKSPACE_ID, id: a.id }))?.slug, "about");
});

test("widget: a config edit on the source updates the destination widget in place (forced)", async () => {
  const { src, dst, a } = await sites();
  await roundTrip(src.site, dst.site);
  const row = await src.ports.entries.findById({ workspaceId: WORKSPACE_ID, id: a.id });
  assert.ok(row);
  await src.ports.entries.save({ ...row, fieldsJson: { ext: { widget: { payload: JSON.stringify({ widgetType: "text", config: { body: "Changed" }, status: "active" }) } } } });

  const entities = await packAll(src.site);
  await applyReport(await plan(entities, dst.site, [`widget:${a.id}`]), entities, dst.site);

  assert.match(JSON.stringify((await dst.ports.entries.findById({ workspaceId: WORKSPACE_ID, id: a.id }))?.fieldsJson), /Changed/);
  assert.deepEqual((await plan(await packAll(src.site), dst.site)).rows.map((r) => r.outcome), ["unchanged", "unchanged", "unchanged"]);
});

test("widget: a trashed destination widget with the same id is refused at precheck", async () => {
  const { src, dst, a } = await sites();
  await roundTrip(src.site, dst.site);
  const row = await dst.ports.entries.findAnyById({ workspaceId: WORKSPACE_ID, id: a.id });
  assert.ok(row);
  await dst.ports.entries.saveAny({ ...row, deletedAt: "2026-09-02T00:00:00.000Z" });

  const report = await plan(await packAll(src.site), dst.site);
  const refused = report.rows.find((r) => r.entityId === a.id);
  assert.equal(refused?.outcome, "blocked");
  assert.match(refused?.reason ?? "", /trash/i);
});

test("widget: a trashed destination widget holding the same slug under another id is refused at precheck", async () => {
  const { src, dst, a } = await sites();
  const { instance: old } = await createWidgetInstance({
    deps: { host: buildWidgetHostPorts({}, {}), ...dst.service },
    input: { workspaceId: WORKSPACE_ID, actor: { principalId: "owner" }, widgetType: "text", title: "Old", config: { body: "x" }, slug: "about" },
  });
  const row = await dst.ports.entries.findAnyById({ workspaceId: WORKSPACE_ID, id: old.id });
  assert.ok(row);
  await dst.ports.entries.saveAny({ ...row, deletedAt: "2026-09-02T00:00:00.000Z" });

  const refused = (await plan(await packAll(src.site), dst.site)).rows.find((r) => r.entityId === a.id);
  assert.equal(refused?.outcome, "blocked");
  assert.match(refused?.reason ?? "", new RegExp(`^widget '${old.id}' is in the trash at this destination and still holds slug 'about'`));
});

test("widget-area: a region the destination binds after the plan is a conflict", async () => {
  const { src, dst } = await sites();
  const entities = await packAll(src.site);
  const report = await plan(entities, dst.site);
  await bindWidgetArea({ deps: { host: buildWidgetHostPorts({}, {}), ...dst.service }, input: { workspaceId: WORKSPACE_ID, regionKey: "sidebar" } });
  await assert.rejects(applyReport(report, entities, dst.site), (err: Error & { rowOutcome?: string }) => err.rowOutcome === "conflict");
});

test("widget-area: a placement naming a widget the destination lacks is blocked and leaves no empty area bound behind", async () => {
  const { src, dst } = await sites();
  const entities = (await packAll(src.site)).filter((e) => e.entityType === "widget-area");
  const report = await plan(entities, dst.site);

  await assert.rejects(applyReport(report, entities, dst.site), (err: Error & { rowOutcome?: string }) => err.rowOutcome === "blocked");
  assert.equal(await dst.ports.bindings.findByRegion({ workspaceId: WORKSPACE_ID, regionKey: "sidebar" }), null);
  assert.deepEqual(await dst.ports.entries.listByWorkspace({ workspaceId: WORKSPACE_ID }, { type: "widget_area" }), []);
  assert.deepEqual(await dst.ports.entries.listByWorkspace({ workspaceId: WORKSPACE_ID }), [], "a blocked apply must leave no entries of any type");
});

test("widget: a contact-form widget's form reference travels as the form's slug and lands as the destination form's id", async () => {
  const { src, dst, a } = await sites();
  const form = (id: string) => ({ id, workspaceId: WORKSPACE_ID, name: "Contact", slug: "contact", fields: [], notify: { enabled: false, recipients: [] }, status: "active",
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", version: 1 }) as unknown as Parameters<InMemoryFormDefinitionRepo["create"]>[0];
  await src.ports.forms.create(form("form-src"));
  await dst.ports.forms.create(form("form-dst"));
  const row = await src.ports.entries.findById({ workspaceId: WORKSPACE_ID, id: a.id });
  assert.ok(row);
  const payload = (config: Record<string, unknown>) => ({ ext: { widget: { payload: JSON.stringify({ widgetType: "contact-form", config, status: "active" }) } } });
  await src.ports.entries.save({ ...row, fieldsJson: payload({ formDefinitionId: "form-src" }) });

  const packed = (await packAll(src.site)).find((e) => e.entityType === "widget" && e.id === a.id);
  assert.match(JSON.stringify(packed?.state), /"formDefinitionId":"contact"/, "the packed reference is the portable slug");
  await roundTrip(src.site, dst.site);
  assert.match(JSON.stringify((await dst.ports.entries.findById({ workspaceId: WORKSPACE_ID, id: a.id }))?.fieldsJson), /\\"formDefinitionId\\":\\"form-dst\\"/);
});

test("widget/widget-area references: a widget names the media its config uses; an area names the widgets it places", async () => {
  const { src, a, b } = await sites();
  const row = await src.ports.entries.findById({ workspaceId: WORKSPACE_ID, id: a.id });
  assert.ok(row);
  await src.ports.entries.save({ ...row, fieldsJson: { ext: { widget: { payload: JSON.stringify({ widgetType: "text", config: { body: '<img src="/media/hero-key/original">' }, status: "active" }) } } } });
  const entities = await packAll(src.site);
  const byType = new Map([["widget", contributeWidgetPublish().build(src.site)], ["widget-area", contributeWidgetAreaPublish().build(src.site)]] as const);
  const widget = entities.find((e) => e.entityType === "widget" && e.id === a.id)!;
  const area = entities.find((e) => e.entityType === "widget-area")!;
  const unknownType = { ...widget, state: { ...widget.state, widgetType: "no-such-widget-type" } };
  assert.deepEqual(await byType.get("widget")!.references!(unknownType), [], "an unregistered widget type references nothing");
  assert.deepEqual(await byType.get("widget")!.references!(widget), [{ entityType: "media", key: "hero-key" }]);
  const areaRefs = (await byType.get("widget-area")!.references!(area)).map((r) => JSON.stringify(r));
  assert.ok(areaRefs.some((r) => r.includes(a.id)) && areaRefs.some((r) => r.includes(b.id)), `area references name both placed widgets: ${areaRefs.join(" ")}`);
});

test("widget precheck refuses a widget type the destination lacks, and settings its schema rejects", async () => {
  const { src, dst, a } = await sites();
  const entities = await packAll(src.site);
  const widget = entities.find((e) => e.entityType === "widget" && e.id === a.id)!;
  const others = entities.filter((e) => e !== widget && e.entityType === "widget");
  const reasonFor = async (state: Record<string, unknown>) =>
    (await plan([...others, { ...widget, state: { ...widget.state, ...state } }], dst.site)).rows.find((r) => r.entityId === a.id);

  const unknown = await reasonFor({ widgetType: "no-such-widget-type" });
  assert.equal(unknown?.outcome, "blocked");
  assert.equal(unknown?.reason, `widget '${a.id}': widget type 'no-such-widget-type' is not installed on the destination`);
  const invalid = await reasonFor({ config: { body: 42 } });
  assert.equal(invalid?.outcome, "blocked");
  assert.equal(invalid?.reason, `widget '${a.id}': its settings do not fit the destination's 'text' widget`);
});
