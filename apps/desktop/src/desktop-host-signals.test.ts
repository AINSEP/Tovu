/** V06: Electron chooses shipped DATA only; ordinary local desktop remains unrestricted. */
import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { resolveDesktopHostSignals } from "./desktop-host-signals.ts";
import { bundledAgentPluginsDir } from "../../website/src/server/runtime/composition/site-paths.ts";
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "../../website/src/features/agent-plugins/identity-read-policy.ts";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { CORE_HOST_SIGNAL_FALLBACK } from "@tovu/contracts/host-signals";

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
        assert.deepEqual(optional, { legacyIdentity: TOVU_AGENT_PLUGIN_IDENTITY_READ.legacyIdentity });
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

test("the desktop preboot path honors the same legacy host-signal declaration", t => {
  const resourcesPath = mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-preboot-"));
  t.after(() => rmSync(resourcesPath, { recursive: true, force: true }));
  const root = path.join(resourcesPath, "tovu", "dist", "content", "agent-plugins");
  const signal = { env: "LEGACY_HOST_APP", facts: { hosted: true, nativeToolsRestricted: true }, label: "Legacy host" };
  const write = (pluginId: string, extensions: unknown) => {
    mkdirSync(path.join(root, pluginId), { recursive: true });
    writeFileSync(path.join(root, pluginId, "plugin.json"), JSON.stringify({ name: pluginId, version: "1.0.0", extensions }));
  };
  // A shipped declaration must keep every core security signal to replace the core fallback.
  write("legacy-host", { tovu: { hostSignals: [...CORE_HOST_SIGNAL_FALLBACK.signals, signal] } });
  // An own canonical key wins even when malformed, so this valid legacy sibling contributes nothing.
  write("shadowed-host", { jini: { hostSignals: "malformed" }, tovu: { hostSignals: [{ ...signal, env: "SHADOWED_HOST_APP" }] } });
  const legacy = resolveDesktopHostSignals({ env: { LEGACY_HOST_APP: "1" } }, { resourcesPath });
  assert.equal(legacy.hosted, true);
  assert.equal(legacy.nativeToolsRestricted, true);
  assert.equal(resolveDesktopHostSignals({ env: { SHADOWED_HOST_APP: "1" } }, { resourcesPath }).hosted, false);
});
