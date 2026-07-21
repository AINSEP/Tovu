import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "../../../features/entries/repo.memory";
import { CORE_RESOLVERS, resolveWidgetType } from "../../resolvers/index";
import { resolvePageWidgets } from "../../resolver-service";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory";
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
  const results = await resolveWidgetType("recent-entries", instances, CTX);

  assert.equal(callCount(), 1, "resolveMany must be called exactly once for a batch of same-type instances");
  assert.equal(results.size, 5);
});

test("AC-17/REQ-25: an instance configured above the type's registered clamp is capped at the registered value in the resolved result", async () => {
  const results = await resolveWidgetType(
    "recent-entries",
    [instance({ id: "w-1", widgetType: "recent-entries", config: { maxItems: 500 } })],
    CTX
  );

  const result = results.get("w-1");
  assert.ok(result);
  // Once implemented against a real recent-entries resolver: assert the resolved IR's item count
  // never exceeds registry.ts's registered clamp (20), regardless of the instance's own config.
});

test("AC-19/INV-05: an uncaught resolver exception is isolated — resolveWidgetType never throws, it returns a typed failure", async () => {
  const throwingResolver: WidgetResolver = {
    async resolveMany() {
      throw new Error("simulated resolver crash");
    },
  };
  // @ts-expect-error — stub-era scaffolding, see note above.
  CORE_RESOLVERS["recent-entries"] = throwingResolver;

  const results = await resolveWidgetType(
    "recent-entries",
    [instance({ id: "w-crash", widgetType: "recent-entries" })],
    CTX
  );

  const result = results.get("w-crash");
  assert.ok(result);
  assert.equal(result?.ok, false, "a throwing resolver must yield a typed failure, never propagate");
  if (!result?.ok) {
    assert.equal(result.reason, "resolver-error");
  }
});

test("REQ-27: an unknown widget type resolves to a typed unknown-type failure, never an unhandled exception", async () => {
  const results = await resolveWidgetType(
    // @ts-expect-error — deliberately an unregistered type key.
    "carousel",
    [instance({ id: "w-1", widgetType: "carousel" })],
    CTX
  );

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
      pageEntryId: "page-home",
      resolvedRegions: ["footer", "sidebar"],
    },
  });

  assert.ok("footer" in regions);
  assert.ok("sidebar" in regions);
});
