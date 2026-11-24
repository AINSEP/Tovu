import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * B159: the memory composition (`app.ts`), the SQLite composition (`site-deps/plugin-runtime.ts`) and
 * the CLI installer's "cannot shadow a built-in" list must all read ONE list, `BUILT_IN_RUNTIME_SOURCES`.
 * Observed at the real seam: whatever `sources` each composition hands `composePluginRuntime` must be
 * exactly the list the CLI protects.
 */
test("both compositions hand composePluginRuntime the same built-ins the CLI protects", async () => {
  const real = await import("../plugin-runtime.js");
  const seen: string[][] = [];
  mock.module(new URL("../plugin-runtime.js", import.meta.url).href, {
    namedExports: { ...real, composePluginRuntime: (...args: Parameters<typeof real.composePluginRuntime>) => {
      seen.push(args[0].sources.map((source) => source.manifest.id));
      return real.composePluginRuntime(...args);
    } },
  });
  const { builtInPluginIds } = await import("../built-in-plugin-sources.js");
  const { createRouteDeps } = await import("../app.js");
  const { composeSitePluginRuntime } = await import("../site-deps/plugin-runtime.js");
  const { InMemoryPluginActivationRepo } = await import("@jini-ai/plugins/host");

  createRouteDeps();
  composeSitePluginRuntime({
    lifecycleTracker: () => ({ capture: () => undefined }), routeDepsBuiltForPluginHost: () => undefined, workspaceId: "ws",
    clock: { nowMs: () => 0, nowIso: () => "1970-01-01T00:00:00.000Z" }, pluginActivationRepo: new InMemoryPluginActivationRepo(),
    resolvedSiteBinding: { dir: "/nonexistent-site" }, contentTypeRepo: () => { throw new Error("deferred"); },
    idGen: { newId: () => "id" }, outbox: () => { throw new Error("deferred"); }, overrides: {},
  } as unknown as Parameters<typeof composeSitePluginRuntime>[0]);

  const cliProtects = builtInPluginIds();
  assert.equal(seen.length >= 2, true, `expected both compositions to compose a runtime, saw ${seen.length}`);
  for (const ids of seen) assert.deepEqual(ids, cliProtects);
});
