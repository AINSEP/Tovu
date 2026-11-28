import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test, type TestContext } from "node:test";

/**
 * @file `composeAgentPluginBootstrap`'s late-bound ports handed to the agent-plugin lifecycle: the
 * product tracker and the MCP provisioning deps are read through their getters only when the
 * lifecycle asks (they are composed after it), and install-identity admission runs the install
 * under the plugin host read at call time, refusing with its own message while no host exists.
 * The lifecycle and deferred-effects factories are recorders, so the test can call what was handed.
 */

const lifecycle = await import("#src/features/agent-plugins/lifecycle");
const effects = await import("#src/features/agent-plugins/update-effects");
type LifecycleOptional = NonNullable<Parameters<typeof lifecycle.createTovuAgentPluginLifecycle>[1]>;
const handed: { lifecycle?: LifecycleOptional; resolveDeps?: () => unknown } = {};
mock.module("#src/features/agent-plugins/lifecycle", { namedExports: { ...lifecycle,
  createTovuAgentPluginLifecycle: (_required: unknown, optional: LifecycleOptional) => { handed.lifecycle = optional; return { lifecycle: "recorded" }; },
} });
mock.module("#src/features/agent-plugins/update-effects", { namedExports: { ...effects,
  createDeferredAgentPluginUpdateEffects: (required: { resolveDeps: () => unknown }) => { handed.resolveDeps = required.resolveDeps; return { effects: "recorded" }; },
} });
const { composeAgentPluginBootstrap } = await import("../agent-plugin-bootstrap.js");

type Required = Parameters<typeof composeAgentPluginBootstrap>[0];

/** A counted getter, so a test can tell a lazy read from an eager one. */
function counted<T>(value: () => T) {
  const getter = Object.assign(() => { getter.reads += 1; return value(); }, { reads: 0 });
  return getter;
}

function compose(t: TestContext, routeDeps: () => unknown) {
  const dir = mkdtempSync(join(tmpdir(), "tovu-agent-plugin-bootstrap-"));
  // An existing themes root: seeding finds it already present and copies nothing.
  mkdirSync(join(dir, "themes"));
  const closers: Array<() => unknown> = [];
  t.after(async () => { for (const close of closers) await close(); rmSync(dir, { recursive: true, force: true }); });
  const tracker = { capture: () => undefined };
  const lifecycleTracker = counted(() => tracker);
  const routeDepsGetter = counted(routeDeps);
  const result = composeAgentPluginBootstrap({
    dbPath: join(dir, "content.db"),
    onStoreClose: ({ registration }: { registration: () => unknown }) => { closers.push(registration); },
    overrides: { siteBinding: { dir, name: "bakery" } },
    lifecycleTracker,
    routeDeps: routeDepsGetter,
  } as unknown as Required);
  const optional = handed.lifecycle;
  assert.ok(optional, "the lifecycle was composed");
  return { result, optional, tracker, lifecycleTracker, routeDepsGetter, dir };
}

test("the lifecycle's product tracker and MCP provisioning deps are read through their getters only at call time", t => {
  const deps = { pluginHost: undefined, late: "route-deps" };
  const f = compose(t, () => deps);
  assert.equal(f.result.resolvedThemesDir, join(f.dir, "themes"));
  assert.equal(f.lifecycleTracker.reads, 0, "tracker not read during composition");
  assert.equal(f.routeDepsGetter.reads, 0, "route deps not read during composition");
  assert.equal(f.optional.productTracker?.(), f.tracker);
  assert.equal(f.lifecycleTracker.reads, 1);
  assert.equal(handed.resolveDeps?.(), deps);
  assert.equal(f.routeDepsGetter.reads, 1);
});

test("install identity admission runs the install under the plugin host read at call time, as an agent-plugin", async t => {
  const admitted: unknown[] = [];
  let host: unknown;
  const f = compose(t, () => ({ pluginHost: host }));
  const admit = f.optional.identityAdmission;
  assert.ok(admit, "identity admission is handed to the lifecycle");
  const run = async () => "installed";
  host = { withInstallIdentity: (input: unknown) => { admitted.push(input); return Promise.resolve("admitted"); } };
  assert.equal(await admit({ id: "gallery", localId: "local-gallery", run } as Parameters<typeof admit>[0]), "admitted");
  assert.deepEqual(admitted, [{ candidate: { id: "gallery", localId: "local-gallery", family: "agent-plugin" }, run }]);
});

test("install identity admission refuses while no plugin host is composed", t => {
  const f = compose(t, () => ({ pluginHost: undefined }));
  const admit = f.optional.identityAdmission;
  assert.ok(admit, "identity admission is handed to the lifecycle");
  assert.throws(() => admit({ id: "gallery", localId: "local-gallery", run: async () => "installed" } as Parameters<typeof admit>[0]),
    { message: "agent plugin installation has no plugin host" });
});
