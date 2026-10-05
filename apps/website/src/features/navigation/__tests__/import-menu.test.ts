import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo, MenuConflictError, MenuNotFoundError, type NavMenuEntry } from "../index.js";
import { importMenuEntity } from "../import-menu.js";
import type { DomainEvent, OutboxPort } from "@jini-ai/cms/core";

const NOW = "2026-10-01T12:00:00.000Z";
function menu(overrides: Partial<NavMenuEntry> = {}): NavMenuEntry {
  return { id: "incoming", workspaceId: "destination", slug: "nav", title: "Incoming", status: "published",
    doc: { type: "menu", version: 1, items: [] }, locations: [], updatedAt: "2026-09-01T00:00:00.000Z", version: 4, ...overrides };
}
function harness() {
  const repo = new InMemoryMenuRepo({});
  const bindingRepo = new InMemoryNavLocationBindingRepo({});
  const events: DomainEvent[] = [];
  let seq = 0;
  const deps = { repo, bindingRepo, clock: { nowIso: () => NOW, nowMs() { return Date.parse(this.nowIso()); } }, idGen: { newId: () => `event-${++seq}` },
    outbox: { enqueue: async (event: DomainEvent) => { events.push(structuredClone(event)); } } as OutboxPort };
  return { deps, events };
}

// F4.4/F6.3: each OCC guard alone can reject; deleting it would overwrite or create a row.
for (const scenario of ["create-existing", "update-missing", "stale-update", "slug-collision"] as const) {
  test(`import refuses ${scenario} before any row, binding or event changes`, async () => {
    const { deps, events } = harness();
    if (scenario !== "update-missing") await deps.repo.save(menu());
    if (scenario === "slug-collision") await deps.repo.save(menu({ id: "holder", slug: "occupied" }));
    await deps.bindingRepo.upsert({ workspaceId: "destination", locationKey: "header", menuId: "neighbor", boundAt: NOW });
    const before = await deps.repo.list({ workspaceId: "destination" });
    const record = menu({ workspaceId: "source", title: "Overwritten", slug: scenario === "slug-collision" ? "occupied" : "nav", locations: ["header"] });
    const expectedVersion = scenario === "create-existing" ? undefined : scenario === "stale-update" ? 3 : 4;
    await assert.rejects(importMenuEntity({ deps, input: { workspaceId: "destination", record, expectedVersion } }),
      scenario === "update-missing" ? MenuNotFoundError : MenuConflictError);
    assert.deepEqual(await deps.repo.list({ workspaceId: "destination" }), before);
    assert.deepEqual(await deps.bindingRepo.findByLocation({ workspaceId: "destination", locationKey: "header" }),
      { workspaceId: "destination", locationKey: "header", menuId: "neighbor", boundAt: NOW });
    assert.deepEqual(events, []);
  });
}

test("import drops only its own old bindings, retaining another menu's reassigned location", async () => {
  const { deps, events } = harness();
  await deps.repo.save(menu({ locations: ["footer", "sidebar", "header"] }));
  for (const [locationKey, menuId] of [["footer", "incoming"], ["sidebar", "neighbor"], ["header", "incoming"]]) {
    await deps.bindingRepo.upsert({ workspaceId: "destination", locationKey, menuId, boundAt: "old-time" });
  }
  const result = await importMenuEntity({ deps, input: { workspaceId: "destination", record: menu({ workspaceId: "source", version: 99, locations: ["header"] }), expectedVersion: 4 } });
  assert.deepEqual(result.menu, menu({ updatedAt: NOW, version: 5, locations: ["header"] }));
  assert.deepEqual(await deps.repo.findById({ workspaceId: "destination", id: "incoming" }), result.menu);
  assert.equal(await deps.bindingRepo.findByLocation({ workspaceId: "destination", locationKey: "footer" }), null);
  assert.deepEqual(await deps.bindingRepo.findByLocation({ workspaceId: "destination", locationKey: "sidebar" }),
    { workspaceId: "destination", locationKey: "sidebar", menuId: "neighbor", boundAt: "old-time" });
  assert.deepEqual(events, [
    { id: "event-1", name: "navigation.menu.updated", occurredAt: NOW, aggregateId: "incoming", workspaceId: "destination", payload: { menuId: "incoming", slug: "nav" } },
    { id: "event-2", name: "navigation.location.assigned", occurredAt: NOW, aggregateId: "incoming", workspaceId: "destination", payload: { locationKey: "header", menuId: "incoming" } },
  ]);
});

test("import repairs an orphan binding and clones the incoming tree before saving", async () => {
  const { deps, events } = harness();
  await deps.bindingRepo.upsert({ workspaceId: "destination", locationKey: "header", menuId: "missing", boundAt: NOW });
  const record = menu({ workspaceId: "source", locations: ["header"], doc: { type: "menu", version: 1,
    items: [{ id: "home", label: "Home", target: { kind: "url", href: "https://example.test/" } }] } });
  const result = await importMenuEntity({ deps, input: { workspaceId: "destination", record } });
  assert.deepEqual(result.displacedMenus, []);
  record.doc.items[0].label = "Source changed";
  assert.equal(result.menu.doc.items[0].label, "Home");
  const stored = await deps.repo.findById({ workspaceId: "destination", id: "incoming" });
  assert.equal(stored?.doc.items[0].label, "Home");
  assert.equal(stored?.version, 1);
  assert.equal(stored?.workspaceId, "destination");
  assert.equal((await deps.bindingRepo.findByLocation({ workspaceId: "destination", locationKey: "header" }))?.menuId, "incoming");
  assert.deepEqual(events.map(({ name, payload }) => ({ name, payload })), [
    { name: "navigation.menu.created", payload: { menuId: "incoming", slug: "nav" } },
    { name: "navigation.location.assigned", payload: { locationKey: "header", menuId: "incoming" } },
  ]);
});

test("import rejects an invalid tree before saving rows or changing bindings and events", async () => {
  const { deps, events } = harness();
  await deps.bindingRepo.upsert({ workspaceId: "destination", locationKey: "header", menuId: "neighbor", boundAt: NOW });
  const record = menu({ locations: ["header"], doc: { type: "menu", version: 1,
    items: [{ id: "broken-link", label: "Link", target: { kind: "url", href: "" } }] } });
  await assert.rejects(importMenuEntity({ deps, input: { workspaceId: "destination", record } }),
    { message: "url target requires a non-empty href" });
  assert.deepEqual(await deps.repo.list({ workspaceId: "destination" }), []);
  assert.deepEqual(await deps.bindingRepo.findByLocation({ workspaceId: "destination", locationKey: "header" }),
    { workspaceId: "destination", locationKey: "header", menuId: "neighbor", boundAt: NOW });
  assert.deepEqual(events, []);
});

// F1.2/F6.3: returning displacedMenus: [] (or only the last displacement) must fail,
// even when the existing integration tests still observe correct binding changes.
test("import returns every displaced menu with its new version and retained locations", async () => {
  const { deps } = harness();
  const header = menu({ id: "former-header", slug: "old-header", title: "Header", version: 7, locations: ["header", "sidebar"] });
  const footer = menu({ id: "former-footer", slug: "old-footer", title: "Footer", version: 11, locations: ["footer", "utility"] });
  await deps.repo.save(header);
  await deps.repo.save(footer);
  for (const [locationKey, menuId] of [["header", "former-header"], ["sidebar", "former-header"], ["footer", "former-footer"], ["utility", "former-footer"]]) {
    await deps.bindingRepo.upsert({ workspaceId: "destination", locationKey, menuId, boundAt: "old-time" });
  }

  const result = await importMenuEntity({ deps, input: {
    workspaceId: "destination", record: menu({ workspaceId: "source", locations: ["header", "footer"] }),
  } });

  assert.deepEqual(result.displacedMenus, [
    menu({ id: "former-header", slug: "old-header", title: "Header", version: 8, updatedAt: NOW, locations: ["sidebar"] }),
    menu({ id: "former-footer", slug: "old-footer", title: "Footer", version: 12, updatedAt: NOW, locations: ["utility"] }),
  ]);
  assert.deepEqual(await deps.repo.findById({ workspaceId: "destination", id: "former-header" }),
    menu({ id: "former-header", slug: "old-header", title: "Header", version: 8, updatedAt: NOW, locations: ["sidebar"] }));
  assert.deepEqual(await deps.repo.findById({ workspaceId: "destination", id: "former-footer" }),
    menu({ id: "former-footer", slug: "old-footer", title: "Footer", version: 12, updatedAt: NOW, locations: ["utility"] }));
  for (const locationKey of ["header", "footer"]) {
    assert.deepEqual(await deps.bindingRepo.findByLocation({ workspaceId: "destination", locationKey }),
      { workspaceId: "destination", locationKey, menuId: "incoming", boundAt: NOW });
  }
  for (const [locationKey, menuId] of [["sidebar", "former-header"], ["utility", "former-footer"]]) {
    assert.deepEqual(await deps.bindingRepo.findByLocation({ workspaceId: "destination", locationKey }),
      { workspaceId: "destination", locationKey, menuId, boundAt: "old-time" });
  }
});
