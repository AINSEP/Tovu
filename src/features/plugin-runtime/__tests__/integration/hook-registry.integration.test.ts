import assert from "node:assert/strict";
import test from "node:test";

import { createHookRegistry, PluginHookFailedError } from "../../hook-registry";
import type { ContentEntryDraft } from "../../../../../packages/sdk/src/index";

/**
 * @file C-010 `createHookRegistry()`/`runBeforeSave()` — SPEC-005 REQ-05/REQ-06, BR-04/BR-06/BR-07,
 * TB-01, AC-01/AC-05/AC-06/AC-07, EC-06/EC-10. **CIC U-004 (Binding, no escalation marker):
 * hook-then-single-write fail-closed atomicity.** This is the dedicated, direct coverage the TDD
 * dispatch requires for U-004 — a throwing/denied/invalid filter must reject `runBeforeSave()`
 * entirely (no partial merged patch returned), so `post.ts`'s single `repo.save()` call is never
 * reached on that path.
 *
 * TDD-certified against the stub in `../../hook-registry.ts`; currently RED — `createHookRegistry`
 * throws "not implemented". These assertions describe the contract the Programmer stage must
 * satisfy.
 */

function draft(overrides: Partial<ContentEntryDraft> = {}): ContentEntryDraft {
  return {
    id: "entry-1",
    workspaceId: "ws-1",
    title: "Hello",
    slug: "hello",
    status: "draft",
    bodyJson: { type: "doc", content: [] },
    ext: {},
    ...overrides,
  };
}

test("AC-01/BR-04: a single attached plugin's returned patch is merged into ext.{pluginId}", async () => {
  const registry = createHookRegistry();
  registry.attach("word-count", "built-in", async () => ({ count: 5 }), [
    { path: "ext.word-count.count", type: "integer" },
  ]);

  const result = await registry.runBeforeSave(draft());
  assert.deepEqual(result, { "word-count": { count: 5 } });
});

test("TB-01: composition runs built-ins first (id ascending), then site plugins (id ascending), regardless of attach order", async () => {
  const registry = createHookRegistry();
  const callOrder: string[] = [];

  const makeFilter = (id: string) => async () => {
    callOrder.push(id);
    return { marker: id };
  };

  // Attach in a deliberately scrambled order.
  registry.attach("zeta-site", "site", makeFilter("zeta-site"), [{ path: "ext.zeta-site.marker", type: "string" }]);
  registry.attach("z-built-in", "built-in", makeFilter("z-built-in"), [{ path: "ext.z-built-in.marker", type: "string" }]);
  registry.attach("alpha-site", "site", makeFilter("alpha-site"), [{ path: "ext.alpha-site.marker", type: "string" }]);
  registry.attach("a-built-in", "built-in", makeFilter("a-built-in"), [{ path: "ext.a-built-in.marker", type: "string" }]);

  await registry.runBeforeSave(draft());

  assert.deepEqual(callOrder, ["a-built-in", "z-built-in", "alpha-site", "zeta-site"]);
});

test("BR-04/EC-07: a detached (disabled) plugin's filter does not run and contributes nothing", async () => {
  const registry = createHookRegistry();
  let calls = 0;
  registry.attach("word-count", "built-in", async () => {
    calls += 1;
    return { count: 5 };
  }, [{ path: "ext.word-count.count", type: "integer" }]);

  registry.detach("word-count");
  const result = await registry.runBeforeSave(draft());

  assert.equal(calls, 0);
  assert.deepEqual(result, {});
});

test("behavior.spec.md §10: zero attached plugins is a no-op — runBeforeSave resolves to an empty patch", async () => {
  const registry = createHookRegistry();
  const result = await registry.runBeforeSave(draft());
  assert.deepEqual(result, {});
});

test("CIC U-004-B1/F1 (BR-07/EC-10, fail-closed): a filter that throws rejects runBeforeSave entirely — no partial patch is ever returned", async () => {
  const registry = createHookRegistry();
  registry.attach(
    "good-plugin",
    "site",
    async () => ({ ok: true } as never),
    [{ path: "ext.good-plugin.ok", type: "boolean" }]
  );
  registry.attach(
    "throwing-plugin",
    "site",
    async () => {
      throw new Error("boom");
    },
    []
  );

  await assert.rejects(() => registry.runBeforeSave(draft()), PluginHookFailedError);
});

test("EC-06 (CAPABILITY_DENIED inside a filter is fail-closed the same as a plain throw)", async () => {
  const registry = createHookRegistry();
  registry.attach(
    "denied-plugin",
    "site",
    async () => {
      const err = new Error("capability denied") as Error & { name: string };
      err.name = "CapabilityDeniedError";
      throw err;
    },
    []
  );

  await assert.rejects(() => registry.runBeforeSave(draft()), PluginHookFailedError);
});

test("BR-06/AC-07: a filter returning a value for a field it did NOT declare rejects with FIELD_PATH_INVALID semantics (fail-closed)", async () => {
  const registry = createHookRegistry();
  registry.attach(
    "sneaky-plugin",
    "site",
    async () => ({ undeclaredField: "not declared in manifest.fields" }),
    [{ path: "ext.sneaky-plugin.declaredField", type: "string" }] // does NOT include undeclaredField
  );

  await assert.rejects(() => registry.runBeforeSave(draft()), PluginHookFailedError);
});

test("BR-06/AC-07: a filter returning a value whose type does not match its declared field type rejects (FIELD_TYPE_MISMATCH, fail-closed)", async () => {
  const registry = createHookRegistry();
  registry.attach(
    "type-mismatch-plugin",
    "site",
    async () => ({ count: "not-a-number" as never }),
    [{ path: "ext.type-mismatch-plugin.count", type: "integer" }]
  );

  await assert.rejects(() => registry.runBeforeSave(draft()), PluginHookFailedError);
});

test("REQ-05/RT-001: the filter receives the entry read-only and cannot mutate core fields via its return value — a returned 'slug'/'status'/'title'/'bodyJson' key is rejected, not silently merged into ext", async () => {
  const registry = createHookRegistry();
  registry.attach(
    "core-field-attacker",
    "site",
    async () => ({ slug: "hijacked" } as never),
    [] // no declared fields at all — 'slug' is not a declared ext field, and is also a core field name
  );

  await assert.rejects(() => registry.runBeforeSave(draft()), PluginHookFailedError);
});

test("ADR-024 §3: a synchronous (non-async) filter function is honored exactly like an async one — core always awaits", async () => {
  const registry = createHookRegistry();
  registry.attach("sync-plugin", "site", (() => ({ count: 1 })) as never, [
    { path: "ext.sync-plugin.count", type: "integer" },
  ]);

  const result = await registry.runBeforeSave(draft());
  assert.deepEqual(result, { "sync-plugin": { count: 1 } });
});

// --- ADR-057 Decision 3: the additive third TB-01 rank ("glue", after "built-in" and "site"). ---
// Added 2026-08-04 alongside Site Glue's content-lifecycle attachment point; every test above this
// point is the pre-existing, unmodified SPEC-005 certified suite.

test("ADR-057 Decision 3: a 'glue'-sourced attachment composes AFTER built-in and site, id-ascending among themselves, regardless of attach order", async () => {
  const registry = createHookRegistry();
  const callOrder: string[] = [];

  const makeFilter = (id: string) => async () => {
    callOrder.push(id);
    return { marker: id };
  };

  // Attach in a deliberately scrambled order, across all three ranks.
  registry.attach("zeta-glue", "glue", makeFilter("zeta-glue"), [{ path: "ext.zeta-glue.marker", type: "string" }]);
  registry.attach("zeta-site", "site", makeFilter("zeta-site"), [{ path: "ext.zeta-site.marker", type: "string" }]);
  registry.attach("z-built-in", "built-in", makeFilter("z-built-in"), [{ path: "ext.z-built-in.marker", type: "string" }]);
  registry.attach("alpha-glue", "glue", makeFilter("alpha-glue"), [{ path: "ext.alpha-glue.marker", type: "string" }]);
  registry.attach("alpha-site", "site", makeFilter("alpha-site"), [{ path: "ext.alpha-site.marker", type: "string" }]);
  registry.attach("a-built-in", "built-in", makeFilter("a-built-in"), [{ path: "ext.a-built-in.marker", type: "string" }]);

  await registry.runBeforeSave(draft());

  assert.deepEqual(callOrder, [
    "a-built-in",
    "z-built-in",
    "alpha-site",
    "zeta-site",
    "alpha-glue",
    "zeta-glue",
  ]);
});

test("ADR-057 Decision 3: a glue-sourced filter's returned patch merges into ext.{moduleId} exactly like a built-in/site plugin's", async () => {
  const registry = createHookRegistry();
  registry.attach("site-glue-example", "glue", async () => ({ count: 7 }), [
    { path: "ext.site-glue-example.count", type: "integer" },
  ]);

  const result = await registry.runBeforeSave(draft());
  assert.deepEqual(result, { "site-glue-example": { count: 7 } });
});

test("BR-04: a later-composed plugin's filter observes the earlier plugin's already-merged ext on the entry snapshot it receives", async () => {
  const registry = createHookRegistry();
  let secondFilterSawFirstPluginsExt: unknown;

  registry.attach("a-built-in", "built-in", async () => ({ value: 1 }), [
    { path: "ext.a-built-in.value", type: "integer" },
  ]);
  registry.attach(
    "b-site",
    "site",
    async (entry) => {
      secondFilterSawFirstPluginsExt = entry.ext["a-built-in"];
      return { value: 2 };
    },
    [{ path: "ext.b-site.value", type: "integer" }]
  );

  await registry.runBeforeSave(draft());
  assert.deepEqual(secondFilterSawFirstPluginsExt, { value: 1 });
});
