import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * @file `composeSitePluginRuntime`'s late-bound ports: the product tracker handed to the plugin
 * runtime reads the lifecycle tracker at call time, and the declared content-type ports are built
 * from the content-type repo and outbox getters only on first use (both are composed later), once.
 * The plugin-runtime and declared-content-type factories are recorders; the deferral is Jini's own.
 */

type RuntimeOptions = { productTracker: () => unknown; declaredContentTypes: { findByKey: (input: unknown) => unknown } };
let handed: RuntimeOptions | undefined;
const built: unknown[] = [];
mock.module(new URL("../../plugin-runtime.js", import.meta.url).href, { namedExports: {
  composePluginRuntime: (options: RuntimeOptions) => { handed = options; return { runtime: "recorded" }; },
} });
mock.module(new URL("../../declared-content-types.js", import.meta.url).href, { namedExports: {
  createDeclaredContentTypePorts: (input: unknown) => { built.push(input); return { findByKey: (params: unknown) => ({ found: params }), register: () => undefined }; },
} });
const { composeSitePluginRuntime } = await import("../plugin-runtime.js");

/** A counted getter, so a test can tell a lazy read from an eager one. */
function counted<T>(value: T) {
  const getter = Object.assign(() => { getter.reads += 1; return value; }, { reads: 0 });
  return getter;
}

test("the plugin runtime reads the tracker and builds declared content-type ports from late getters, once, on first use", () => {
  const tracker = { capture: () => undefined };
  const repo = { repo: "content-types" };
  const outbox = { outbox: "sqlite" };
  const clock = { nowMs: () => 7, nowIso: () => "2031-02-03T04:05:06.000Z" };
  const idGen = { newId: () => "id-1" };
  const lifecycleTracker = counted(tracker);
  const contentTypeRepo = counted(repo);
  const outboxGetter = counted(outbox);
  const result = composeSitePluginRuntime({
    lifecycleTracker, routeDepsBuiltForPluginHost: () => undefined, workspaceId: "site-7", clock,
    pluginActivationRepo: {}, resolvedSiteBinding: { dir: "/nonexistent/bakery", name: "bakery" },
    contentTypeRepo, idGen, outbox: outboxGetter, overrides: {},
  } as unknown as Parameters<typeof composeSitePluginRuntime>[0]);
  assert.deepEqual(result, { pluginRuntime: { runtime: "recorded" } });
  assert.ok(handed, "the plugin runtime was composed");
  assert.deepEqual([lifecycleTracker.reads, contentTypeRepo.reads, outboxGetter.reads], [0, 0, 0], "nothing read during composition");
  assert.equal(handed.productTracker(), tracker);
  assert.equal(lifecycleTracker.reads, 1);
  assert.deepEqual(handed.declaredContentTypes.findByKey({ key: "recipe" }), { found: { key: "recipe" } });
  handed.declaredContentTypes.findByKey({ key: "menu" });
  assert.equal(built.length, 1, "ports are built once");
  assert.deepEqual(built[0], { repo, clock, ids: idGen, outbox });
  assert.deepEqual([contentTypeRepo.reads, outboxGetter.reads], [1, 1]);
});
