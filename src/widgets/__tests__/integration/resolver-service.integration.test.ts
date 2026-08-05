import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "#src/features/entries/repo.memory";
import { buildWidgetInstanceFieldsJson } from "../../entry-payload";
import { CORE_RESOLVERS, resolveWidgetType } from "../../resolvers/index";
import { resolvePageWidgets } from "../../resolver-service";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "../../types";
import type { WidgetInstanceView, WidgetResolveContext, WidgetResolveResult, WidgetResolver } from "../../types";

/**
 * @file C-003/C-004 the resolution pipeline — SPEC-043 REQ-23..28, AC-16..20, INV-05.
 * TDD-certified against the stubs in `resolvers/index.ts`/`resolver-service.ts`; currently RED —
 * these assertions describe the real contract, not current behavior. These are the tests the
 * ADR-047 debate's convergence on batch-first resolution (answering agy's Round 1 N+1 blind-spot
 * question) and failure isolation (the Primary's pre-dispatch structural-gap flag, corroborated
 * by Codex) exist specifically to prove.
 */

const WORKSPACE_ID = "ws-1";
const CTX: WidgetResolveContext = { workspaceId: WORKSPACE_ID, preview: false };

function instance(overrides: Partial<WidgetInstanceView> & Pick<WidgetInstanceView, "id" | "widgetType">): WidgetInstanceView {
  return { config: {}, ...overrides };
}

/** A resolver test double that counts how many times resolveMany is called, for the batching assertion. */
function countingResolver(result: WidgetResolveResult): { resolver: WidgetResolver; callCount: () => number } {
  let calls = 0;
  return {
    resolver: {
      async resolveMany(instances) {
        calls += 1;
        return new Map(instances.map((i) => [i.id, result]));
      },
    },
    callCount: () => calls,
  };
}

test("AC-16/REQ-24: resolving 5 instances of the same type via resolveWidgetType invokes the registered resolver's resolveMany exactly once, not 5 times", async () => {
  const { resolver, callCount } = countingResolver({
    ok: true,
    ir: { componentId: "recent-entries", props: {} },
    dependencyKeys: [],
  });
  // @ts-expect-error — CORE_RESOLVERS is a frozen closed map in the real implementation; tests
  // exercise it through resolveWidgetType, not by mutating it directly once implemented. This
  // stub-era assignment is scaffolding only.
  CORE_RESOLVERS["recent-entries"] = resolver;

  const instances = Array.from({ length: 5 }, (_, i) => instance({ id: `w-${i}`, widgetType: "recent-entries" }));
  const results = await resolveWidgetType({ typeKey: "recent-entries", instances, context: CTX });

  assert.equal(callCount(), 1, "resolveMany must be called exactly once for a batch of same-type instances");
  assert.equal(results.size, 5);
});

test("AC-17/REQ-25: an instance configured above the type's registered clamp is capped at the registered value in the resolved result — defense-in-depth at the orchestration layer, independent of the resolver's own discipline (Round-2 external-audit fix, 2026-07-21, Opus 4.8 finding WIDGETS-R2-L1: this assertion was previously a no-op stub)", async () => {
  // A rogue resolver that deliberately ignores REQ-25's clamp itself — proves clampResolveResult
  // (resolvers/index.ts) enforces the registered maxItems (20) regardless, not just the resolver's
  // own well-behaved implementation (recent-entries.ts already clamps correctly; this test would not
  // catch a regression there being masked by the orchestration layer, which is exactly the gap).
  const rogueResolver: WidgetResolver = {
    async resolveMany(instances) {
      return new Map(
        instances.map((i) => [
          i.id,
          {
            ok: true as const,
            ir: { componentId: "recent-entries", props: {}, children: Array.from({ length: 30 }, (_, n) => ({ componentId: "entry-summary", props: { title: `E${n}` } })) },
            dependencyKeys: [],
          },
        ])
      );
    },
  };
  // @ts-expect-error — see the identical scaffolding note on the AC-16 test above.
  CORE_RESOLVERS["recent-entries"] = rogueResolver;

  const results = await resolveWidgetType({
    typeKey: "recent-entries",
    instances: [instance({ id: "w-1", widgetType: "recent-entries", config: { maxItems: 500 } })],
    context: CTX,
  });

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (result.ok) {
    assert.equal(result.ir.children?.length, 20, "clampResolveResult must cap at the registered clamp (20) even when the resolver itself returns 30 and the instance config asks for 500");
  }
});

test("AC-19/INV-05: an uncaught resolver exception is isolated — resolveWidgetType never throws, it returns a typed failure", async () => {
  const throwingResolver: WidgetResolver = {
    async resolveMany() {
      throw new Error("simulated resolver crash");
    },
  };
  // @ts-expect-error — stub-era scaffolding, see note above.
  CORE_RESOLVERS["recent-entries"] = throwingResolver;

  const results = await resolveWidgetType({
    typeKey: "recent-entries",
    instances: [instance({ id: "w-crash", widgetType: "recent-entries" })],
    context: CTX,
  });

  const result = results.get("w-crash");
  assert.ok(result);
  assert.equal(result?.ok, false, "a throwing resolver must yield a typed failure, never propagate");
  if (!result?.ok) {
    assert.equal(result.reason, "resolver-error");
  }
});

test("REQ-27: an unknown widget type resolves to a typed unknown-type failure, never an unhandled exception", async () => {
  const results = await resolveWidgetType({
    // @ts-expect-error — deliberately an unregistered type key.
    typeKey: "carousel",
    instances: [instance({ id: "w-1", widgetType: "carousel" })],
    context: CTX,
  });

  const result = results.get("w-1");
  assert.equal(result?.ok, false);
  if (!result?.ok) {
    assert.equal(result.reason, "unknown-type");
  }
});

test("AC-16/REQ-23: resolvePageWidgets assembles resolved IR for every declared region on a page", async () => {
  // Call-site note (Programmer stage): `resolvePageWidgets` needs real repo access to do its job
  // for real (region -> widget_area -> placements, page -> inline embeds), so — unlike
  // `resolveWidgetType` above, which stays a pure dispatch call with no injected deps — this one
  // stub-era signature grew a `{ deps, input }` split, mirroring `write-service.ts`'s/
  // `region-area-service.ts`'s identical restructuring. No area/page data is seeded here (this
  // test only asserts the per-region key structure), so both repos are fresh, empty adapters.
  const { regions } = await resolvePageWidgets({
    deps: { bindingRepo: new InMemoryWidgetRegionBindingRepo(), entryRepo: new InMemoryEntryRepo() },
    input: {
      workspaceId: WORKSPACE_ID,
      // No `pageBodyJson` — this test only asserts per-region key structure, not inline-embed
      // resolution (see the dedicated 2026-08-05-fix test below for that).
      resolvedRegions: ["footer", "sidebar"],
    },
  });

  assert.ok("footer" in regions);
  assert.ok("sidebar" in regions);
});

test("2026-08-05 fix: a widgetEmbed node in a real page's pageBodyJson resolves to the widget's real IR, not the REQ-28 placeholder forever (the pageEntryId->EntryRepoPort.findById path this replaces could never reach a PostRecord's bodyJson)", async () => {
  const bindingRepo = new InMemoryWidgetRegionBindingRepo();
  const entryRepo = new InMemoryEntryRepo();

  await entryRepo.save({
    id: "text-widget-1",
    workspaceId: WORKSPACE_ID,
    type: WIDGET_CONTENT_TYPE,
    slug: "text-widget-1",
    status: "published",
    title: "Inline text widget",
    bodyJson: null,
    fieldsJson: buildWidgetInstanceFieldsJson({ widgetType: "text", config: { text: "Hello from inline widget" }, status: "active" }),
    publishedAt: "2026-08-05T00:00:00.000Z",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    version: 1,
  });

  const pageBodyJson = {
    type: "doc",
    content: [{ type: "widgetEmbed", attrs: { placementId: "p1", widgetEntryId: "text-widget-1" } }],
  };

  const { inlineResolved } = await resolvePageWidgets({
    deps: { bindingRepo, entryRepo },
    input: { workspaceId: WORKSPACE_ID, pageBodyJson, resolvedRegions: [] },
  });

  assert.deepEqual(inlineResolved.get("p1"), { componentId: "text", props: { text: "Hello from inline widget" } });
});

test("Fable adversarial-review fix (2026-07-21, Finding B): a malformed widget_area payload degrades that region to empty, resolvePageWidgets never throws (REQ-27)", async () => {
  const bindingRepo = new InMemoryWidgetRegionBindingRepo();
  const entryRepo = new InMemoryEntryRepo();

  await bindingRepo.upsert({ workspaceId: WORKSPACE_ID, regionKey: "footer", areaEntryId: "area-1", updatedAt: "2026-07-21T00:00:00.000Z" });
  await entryRepo.save({
    id: "area-1",
    workspaceId: WORKSPACE_ID,
    type: WIDGET_AREA_CONTENT_TYPE,
    slug: "widget-area-footer",
    status: "published",
    title: "Footer area",
    bodyJson: null,
    // Deliberately NOT the real `ext.widgets.payload` envelope — simulates a row wiped by an
    // unrelated write path, exactly the reachable case Fable's review flagged.
    fieldsJson: { ext: { site: {} } },
    publishedAt: "2026-07-21T00:00:00.000Z",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    version: 1,
  });

  const { regions } = await resolvePageWidgets({
    deps: { bindingRepo, entryRepo },
    input: { workspaceId: WORKSPACE_ID, resolvedRegions: ["footer"] },
  });

  assert.deepEqual(regions.footer, []);
});

test("Fable adversarial-review fix (2026-07-21, Finding B): a malformed widget-instance row referenced by a real placement degrades to the placeholder IR, resolvePageWidgets never throws (REQ-27/28)", async () => {
  const bindingRepo = new InMemoryWidgetRegionBindingRepo();
  const entryRepo = new InMemoryEntryRepo();

  await bindingRepo.upsert({ workspaceId: WORKSPACE_ID, regionKey: "footer", areaEntryId: "area-1", updatedAt: "2026-07-21T00:00:00.000Z" });
  await entryRepo.save({
    id: "area-1",
    workspaceId: WORKSPACE_ID,
    type: WIDGET_AREA_CONTENT_TYPE,
    slug: "widget-area-footer",
    status: "published",
    title: "Footer area",
    bodyJson: null,
    fieldsJson: { ext: { widgets: { payload: JSON.stringify({ regionKey: "footer", doc: { schemaVersion: 1, placements: [{ placementId: "p1", widgetEntryId: "corrupted-widget", enabled: true }] } }) } } },
    publishedAt: "2026-07-21T00:00:00.000Z",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    version: 1,
  });
  await entryRepo.save({
    id: "corrupted-widget",
    workspaceId: WORKSPACE_ID,
    type: WIDGET_CONTENT_TYPE,
    slug: "corrupted-widget",
    status: "published",
    title: "Corrupted widget",
    bodyJson: null,
    // Malformed on purpose: not the real `ext.widget.payload` envelope.
    fieldsJson: { ext: { site: {} } },
    publishedAt: "2026-07-21T00:00:00.000Z",
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
    version: 1,
  });

  const { regions } = await resolvePageWidgets({
    deps: { bindingRepo, entryRepo },
    input: { workspaceId: WORKSPACE_ID, resolvedRegions: ["footer"] },
  });

  assert.deepEqual(regions.footer, [{ componentId: "widget-placeholder", props: {} }]);
});
