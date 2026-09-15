import assert from "node:assert/strict";
import test from "node:test";

import { buildWidgetsDeps, buildWidgetsRegionDeps, type WidgetsRouteDeps } from "../../deps.js";

/**
 * @file `buildWidgetsDeps`/`buildWidgetsRegionDeps` — the shared write-path deps composer
 * (`deps.ts`'s own file header documents the ~11-call-site outbox-bridging bug this replaced).
 * These are pure structural mappers with no branches; the risk they guard against is not "does it
 * throw" but "does every field land under the RIGHT name" — `idGen` -> `ids` is a rename, not a
 * passthrough, and that exact class of mismatch (a route's own field shape silently not matching
 * what the domain function destructures) is what caused the outbox bug this file's header cites.
 * So every assertion below pins field IDENTITY (`assert.equal`, same object reference) rather than
 * just "truthy" or "defined".
 */

function makeRouteDeps(): WidgetsRouteDeps {
  return {
    authorize: (() => {}) as unknown as WidgetsRouteDeps["authorize"],
    workspaceId: "ws-1",
    clock: { nowIso: () => "2026-08-20T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    outbox: { publish: () => {} } as unknown as WidgetsRouteDeps["outbox"],
    entryRepo: { marker: "entryRepo" } as unknown as WidgetsRouteDeps["entryRepo"],
    contentTypeRepo: { marker: "contentTypeRepo" } as unknown as WidgetsRouteDeps["contentTypeRepo"],
    entryRefsRepo: { marker: "entryRefsRepo" } as unknown as WidgetsRouteDeps["entryRefsRepo"],
    widgetBindingRepo: { marker: "widgetBindingRepo" } as unknown as WidgetsRouteDeps["widgetBindingRepo"],
    postRepo: { marker: "postRepo" } as unknown as WidgetsRouteDeps["postRepo"],
    changeSets: { marker: "changeSets" } as unknown as WidgetsRouteDeps["changeSets"],
    pluginBeforeSaveHook: { marker: "pluginBeforeSaveHook" } as unknown as WidgetsRouteDeps["pluginBeforeSaveHook"],
  };
}

test("buildWidgetsDeps: maps every field to its write-path name, by identity, including the idGen -> ids rename", () => {
  const routeDeps = makeRouteDeps();
  const result = buildWidgetsDeps(routeDeps);

  assert.equal(result.entryRepo, routeDeps.entryRepo);
  assert.equal(result.contentTypeRepo, routeDeps.contentTypeRepo);
  assert.equal(result.entryRefsRepo, routeDeps.entryRefsRepo);
  assert.equal(result.clock, routeDeps.clock);
  assert.equal(result.authorize, routeDeps.authorize);
  assert.equal(result.outbox, routeDeps.outbox);
  // The one rename in this mapping: `routeDeps.idGen` becomes `result.ids`.
  assert.equal(result.ids, routeDeps.idGen);
});

test("buildWidgetsDeps: does not carry workspaceId or widgetBindingRepo through — those are not part of this shape", () => {
  const routeDeps = makeRouteDeps();
  const result = buildWidgetsDeps(routeDeps);

  assert.equal((result as Record<string, unknown>).workspaceId, undefined);
  assert.equal((result as Record<string, unknown>).widgetBindingRepo, undefined);
  assert.equal((result as Record<string, unknown>).bindingRepo, undefined);
});

test("buildWidgetsRegionDeps: is buildWidgetsDeps' shape plus one extra field, bindingRepo, sourced from widgetBindingRepo", () => {
  const routeDeps = makeRouteDeps();
  const base = buildWidgetsDeps(routeDeps);
  const region = buildWidgetsRegionDeps(routeDeps);

  assert.deepEqual(Object.keys(region).sort(), [...Object.keys(base), "bindingRepo"].sort());
  assert.equal(region.bindingRepo, routeDeps.widgetBindingRepo);
  assert.equal(region.entryRepo, base.entryRepo);
  assert.equal(region.ids, base.ids);
});
