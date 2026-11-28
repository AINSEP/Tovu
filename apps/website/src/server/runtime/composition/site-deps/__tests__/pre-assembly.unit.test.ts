import assert from "node:assert/strict";
import { mock, test, type TestContext } from "node:test";

/**
 * @file `composePreAssembly`'s own effects and late-bound ports: a boot load of the plugin admin
 * surface handlers that fails is logged (Error message or thrown value) and never rejects the boot
 * tail, and the plugin export runtime's embed-consent switch reads the route deps' cookie consent at
 * call time, on only for a literal `true`. The export runtime factory is a recorder; everything else
 * composed here is the real thing over inert fakes (no repo is read during composition).
 */

const exportsRuntime = await import("#src/features/agent-plugins/exports/runtime");
let handed: { embedConsentOff: () => boolean; workspaceId: string } | undefined;
mock.module("#src/features/agent-plugins/exports/runtime", { namedExports: { ...exportsRuntime,
  createPluginExportRuntime: (required: NonNullable<typeof handed>) => { handed = required; return { exports: "recorded" }; },
} });
const { composePreAssembly } = await import("../pre-assembly.js");

type Required = Parameters<typeof composePreAssembly>[0];
const pending = new Promise<never>(() => {});

function compose(refresh: () => Promise<unknown>, routeDeps: () => unknown) {
  return composePreAssembly({
    kernel: {}, agentPluginConnections: { adminSurfaceHost: { refresh } }, postRepo: {}, settingsRepo: {}, mediaRepo: {},
    mediaContentTypeStore: {}, transformDefinitionRepo: { listByName: async () => [] }, originRegistry: {},
    clock: { nowMs: () => 7, nowIso: () => "2031-02-03T04:05:06.000Z" },
    siteTitleSettingsDeps: {}, siteSettingsReady: pending, identity: { identityReady: pending }, workspaceId: "site-7",
    routeDeps, agentPluginLifecycle: { loadPluginContributions: async () => [] }, customCredentialSetRepo: {},
    siteAssistantSecretSealer: {}, externalMcpServerRepo: {}, siteAssistantSecretKeyring: {},
  } as unknown as Required);
}

function captureWarnings(t: TestContext) {
  const warnings: unknown[][] = [];
  const spy = mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  t.after(() => spy.mock.restore());
  return warnings;
}

for (const [label, failure, reason] of [["an Error", new Error("handlers.mjs missing"), "handlers.mjs missing"], ["a thrown value", "disk gone", "disk gone"]] as const) {
  test(`a boot load of the admin surface handlers rejecting with ${label} is logged and the boot tail still settles`, async t => {
    const warnings = captureWarnings(t);
    const result = compose(() => Promise.reject(failure), () => ({}));
    assert.equal(await result.adminSurfaceHandlersReady, undefined);
    assert.deepEqual(warnings, [[`[admin-surfaces] handler modules could not be loaded at boot, continuing without them — ${reason}`]]);
  });
}

test("a boot load of the admin surface handlers that succeeds logs nothing", async t => {
  const warnings = captureWarnings(t);
  const result = compose(() => Promise.resolve({ loaded: 2 }), () => ({}));
  assert.equal(await result.adminSurfaceHandlersReady, undefined);
  assert.deepEqual(warnings, []);
});

test("the export runtime's embed-consent switch reads the route deps' cookie consent per call and is on only for true", async () => {
  let deps: unknown = {};
  compose(() => Promise.resolve(), () => deps);
  assert.ok(handed, "the export runtime was composed");
  assert.equal(handed.workspaceId, "site-7");
  assert.equal(handed.embedConsentOff(), false, "no cookie consent composed");
  deps = { cookieConsent: {} };
  assert.equal(handed.embedConsentOff(), false, "consent without the switch");
  deps = { cookieConsent: { embedConsentOff: () => "yes" } };
  assert.equal(handed.embedConsentOff(), false, "a truthy non-true answer is not on");
  deps = { cookieConsent: { embedConsentOff: () => true } };
  assert.equal(handed.embedConsentOff(), true);
});
