/** V06: Electron chooses shipped DATA only; ordinary local desktop remains unrestricted. */
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { resolveDesktopHostSignals } from "./desktop-host-signals.ts";
import { bundledAgentPluginsDir } from "../../website/src/server/runtime/composition/site-paths.ts";

const empty = { hosted: false, nativeToolsRestricted: false, trustProxyHops: undefined, labels: [] };

for (const resourcesPath of ["", "/resources"]) for (const present of [false, true]) {
  test(`desktop payload selection ${JSON.stringify({ resourcesPath, present })}`, () => {
    let probes = 0;
    const env = { NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1", TOVU_DESKTOP_OWNER_PID: "42" };
    const payload = path.join("/resources", "tovu", "dist", "content", "agent-plugins");
    assert.equal(resolveDesktopHostSignals({ env }, {
      resourcesPath,
      pathExists: file => { probes++; assert.equal(file, payload); return present; },
      resolveSignals: (required, optional) => {
        assert.equal(required.env, env);
        assert.equal(required.bundledSourceRoot, resourcesPath && present ? payload : bundledAgentPluginsDir({}, { env }));
        assert.equal(optional, undefined);
        return empty;
      },
    }), empty);
    assert.equal(probes, resourcesPath ? 1 : 0);
  });
}

test("default desktop binding accepts a host with no platform hints", () => {
  const signals = resolveDesktopHostSignals({ env: {} });
  assert.equal(signals.hosted, false);
  assert.equal(signals.nativeToolsRestricted, false);
  assert.deepEqual(signals.labels, []);
});

test("default filesystem probe and reader degrade to no hints for an absent payload", () => {
  assert.equal(resolveDesktopHostSignals({ env: {} }, { resourcesPath: "/missing/desktop/resources" }).nativeToolsRestricted, false);
});
