/** Phase 4/V06: pure host facts and security policies over neutral declarations, without I/O. */
import assert from "node:assert/strict";
import test from "node:test";
import { CORE_HOST_SIGNAL_FALLBACK, selectCoreHostSignalDeclaration, evaluateHostSignals, type HostSignalDeclaration } from "../../host-signals.js";
import { resolveTrustProxySetting } from "#src/server/inbound/shared/trust-proxy";
import { createSitePluginPolicy } from "#src/features/plugin-runtime/install";
import { isHostedAssistantRuntime, resolveFullCliAccess, resolveAssistantCliPermissions } from "../../assistant-native-fallbacks.js";
import { resolveAgentPermissionMode } from "../../agent-permission-mode.js";
import { detectDeploymentSignals } from "#src/server/runtime/boot/boot-readiness-warnings";
import { assistantCliPermissions } from "#src/assistant/assistant-subagents-policy";

export const declaration: HostSignalDeclaration = { signals: [
  { env: "EXAMPLE_APP", facts: { hosted: true, trustProxyHops: 1, nativeToolsRestricted: true }, label: "Example host" },
  { env: "EXAMPLE_MACHINE", facts: { nativeToolsRestricted: true } },
  { env: "EXAMPLE_ALLOC", facts: { nativeToolsRestricted: true } },
] };

// Empty strings are absent; whitespace and literal "0" remain present, as with the former env reads.
for (const app of [undefined, "", " ", "0", "app"]) {
  for (const machine of [undefined, "", " ", "0", "machine"]) {
    for (const alloc of [undefined, "", " ", "0", "alloc"]) {
      test(`APP/MACHINE/ALLOC matrix ${JSON.stringify([app, machine, alloc])}`, () => {
        const env = { EXAMPLE_APP: app, EXAMPLE_MACHINE: machine, EXAMPLE_ALLOC: alloc };
        const hostSignals = evaluateHostSignals({ env, declaration });
        const options = { hostSignals };
        const hosted = !!app;
        const restricted = !!(app || machine || alloc);
        assert.deepEqual(hostSignals, { hosted, nativeToolsRestricted: restricted,
          trustProxyHops: hosted ? 1 : undefined, labels: hosted ? ["Example host"] : [] });
        assert.equal(resolveTrustProxySetting({ env }, options), hosted ? 1 : false);
        assert.equal(createSitePluginPolicy({ env, hostSignals }).localInstallEnabled({}, {}), !hosted);
        assert.equal(isHostedAssistantRuntime({ env }, options), restricted);
        assert.equal(resolveFullCliAccess({ isOwner: true, setting: true, env }, options), !restricted);
        assert.equal(resolveAgentPermissionMode({ env: { ...env, TOVU_AGENT_PERMISSION_MODE: "bypass" } }, options), restricted ? "restricted" : "bypass");
        assert.equal(resolveAssistantCliPermissions({ isOwner: true, env, settings: assistantCliPermissions({ enabled: true }) }, options).capabilities.shell, !restricted);
        assert.deepEqual(detectDeploymentSignals({ env }, { ...options, pathExists: () => false }), hosted ? ["Example host"] : []);
      });
    }
  }
}

test("explicit proxy override always wins, even when host defaults conflict", () => {
  for (const present of [false, true]) {
    const hostSignals = evaluateHostSignals({ env: { EXAMPLE_APP: present ? "app" : "" }, declaration });
    const defaultTrust = present ? 1 : false;
    for (const [override, expected] of [[undefined, defaultTrust], ["", defaultTrust], ["  ", defaultTrust],
      ["false", false], ["FALSE", false], ["0", false], ["off", false], ["no", false], ["2", 2], ["01", 1], [" loopback ", "loopback"]] as const) {
      assert.equal(resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: override } }, { hostSignals }), expected);
    }
    assert.throws(() => resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: " TrUe " } }, { hostSignals }), /would trust/);
  }
});

test("packaged desktop exempts only NODE_ENV from hosted install policy", () => {
  for (const env of [{}, { ELECTRON_RUN_AS_NODE: "1" }, { TOVU_DESKTOP_OWNER_PID: "42" }, { ELECTRON_RUN_AS_NODE: "1", TOVU_DESKTOP_OWNER_PID: "42" }]) {
    const desktop = env.ELECTRON_RUN_AS_NODE === "1" && !!env.TOVU_DESKTOP_OWNER_PID;
    for (const app of ["", "app"]) for (const optIn of [undefined, "0", "1"]) {
      const input = { ...env, NODE_ENV: "production", EXAMPLE_APP: app, TOVU_PLUGIN_LOCAL_INSTALL: optIn };
      const hostSignals = evaluateHostSignals({ env: input, declaration });
      assert.equal(createSitePluginPolicy({ env: input, hostSignals }).localInstallEnabled({}, {}), optIn === "1" || (!app && desktop));
      assert.equal(resolveFullCliAccess({ isOwner: true, env: input }, { hostSignals }), !app);
    }
  }
});

test("an explicitly empty evaluated declaration has no hints; independent core switches still apply", () => {
  const env = { EXAMPLE_APP: "present" };
  const hostSignals = evaluateHostSignals({ env, declaration: { signals: [] } });
  assert.equal(resolveTrustProxySetting({ env }, { hostSignals }), false);
  assert.equal(isHostedAssistantRuntime({ env }, { hostSignals }), false);
  assert.equal(createSitePluginPolicy({ env, hostSignals }).localInstallEnabled({}, {}), true);
  for (const independent of [{ TOVU_RUNTIME_MODE: "production" }, { TOVU_HOSTED: "1" }, { TOVU_HOSTED: "true" }, { TOVU_PUBLIC_URL: "https://owner.tovu.dev/" }]) {
    assert.equal(isHostedAssistantRuntime({ env: independent }, { hostSignals }), true);
  }
});

test("core fallback is immutable, and complete unambiguous declarations retain their identity", () => {
  assert.equal(selectCoreHostSignalDeclaration({}), CORE_HOST_SIGNAL_FALLBACK);
  assert.ok(Object.isFrozen(CORE_HOST_SIGNAL_FALLBACK));
  assert.ok(Object.isFrozen(CORE_HOST_SIGNAL_FALLBACK.signals));
  for (const signal of CORE_HOST_SIGNAL_FALLBACK.signals) {
    assert.ok(Object.isFrozen(signal));
    assert.ok(Object.isFrozen(signal.facts));
  }
  // Signal and fact order do not confer ownership; equality is by the contract, not JSON bytes.
  const complete = { signals: [...CORE_HOST_SIGNAL_FALLBACK.signals].reverse().map(signal => ({
    ...signal, facts: Object.fromEntries(Object.entries(signal.facts).reverse()),
  })) };
  assert.equal(selectCoreHostSignalDeclaration({ declaration: complete }), complete);
});

test("empty, partial, changed and ambiguous security declarations select the complete fallback", () => {
  const signals = CORE_HOST_SIGNAL_FALLBACK.signals;
  const candidates: HostSignalDeclaration[] = [
    { signals: [] }, declaration,
    ...signals.map((_, index) => ({ signals: signals.filter((_, other) => index !== other) })),
    { signals: [...signals, signals[0]!] },
    { signals: [...signals, ...declaration.signals, ...declaration.signals] },
    { signals: signals.map(signal => ({ ...signal, facts: { ...signal.facts, hosted: false } })) },
    { signals: signals.map(signal => ({ ...signal, label: "Changed diagnostic" })) },
    { signals: signals.map(signal => ({ ...signal, facts: { ...signal.facts, nativeToolsRestricted: false } })) },
  ];
  for (const candidate of candidates) {
    assert.equal(selectCoreHostSignalDeclaration({ declaration: candidate }), CORE_HOST_SIGNAL_FALLBACK);
  }
});

test("matched facts only restrict; conflicting proxy hops never grant arbitrary trust", () => {
  const hostSignals = evaluateHostSignals({ env: { A: "yes", B: "yes" }, declaration: { deploymentAdvice: "Example advice", signals: [
    { env: "A", facts: { hosted: true, trustProxyHops: 1 }, label: "A" },
    { env: "B", facts: { hosted: false, nativeToolsRestricted: true, trustProxyHops: 2 }, label: "B" },
  ] } });
  assert.deepEqual(hostSignals, { hosted: true, nativeToolsRestricted: true, trustProxyHops: undefined, labels: ["A", "B"], deploymentAdvice: "Example advice" });
  assert.equal(resolveTrustProxySetting({ env: {} }, { hostSignals }), false);
  assert.equal(resolveTrustProxySetting({ env: { TOVU_TRUST_PROXY: "3" } }, { hostSignals }), 3);
  assert.deepEqual(evaluateHostSignals({ env: {}, declaration: { signals: [{ env: "A", facts: {}, label: "A" }] } }).labels, []);
});
