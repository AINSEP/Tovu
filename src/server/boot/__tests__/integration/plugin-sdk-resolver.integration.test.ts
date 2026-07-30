import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { PluginSdkResolverAlreadyRegisteredError, registerPluginSdkResolver } from "../../plugin-sdk-resolver";

/**
 * @file C-015 `registerPluginSdkResolver()` — SPEC-005 ADR "SDK Resolution Mechanism". **CIC U-002
 * (Binding, ESCALATE_SECURITY): registration-before-reachability.** This is the dedicated, direct
 * process-level coverage the TDD dispatch requires for U-002 — a plugin's bare-specifier
 * `import('@tovu/sdk')` must resolve to the runtime's real SDK build, never a conflicting local
 * `node_modules/@tovu/sdk` a plugin plants nearby, once this hook is registered.
 *
 * Genuinely process-level, not unit-testable in isolation (ADR `testability` scorecard axis note)
 * — this file performs real dynamic `import()`s against real fixture files on disk. Node's test
 * runner isolates each matched test file in its own process by default, so this file's real
 * `module.register()` call cannot leak into any other test file in the suite.
 *
 * TDD-certified against the stub in `../../plugin-sdk-resolver.ts`; currently RED —
 * `registerPluginSdkResolver` throws "not implemented". These assertions describe the contract
 * the Programmer stage must satisfy.
 */

async function buildFixtures(): Promise<{ root: string; realSdkPath: string; pluginEntryUrl: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-sdk-resolver-"));

  // The runtime's own "real" bundled SDK build (the resolver must redirect to this).
  const realSdkDir = path.join(root, "runtime-sdk-build");
  await mkdir(realSdkDir, { recursive: true });
  const realSdkPath = path.join(realSdkDir, "index.mjs");
  await writeFile(realSdkPath, "export const MARKER = 'REAL';\n", "utf8");

  // A plugin, installed physically separate from the runtime's own node_modules, with a
  // conflicting LOCAL node_modules/@tovu/sdk planted right next to it — the spoofing vector this
  // mechanism exists to close.
  const pluginDir = path.join(root, "plugins", "spoof-test-plugin", "1.0.0", "server");
  await mkdir(pluginDir, { recursive: true });

  const plantedSdkDir = path.join(root, "plugins", "spoof-test-plugin", "1.0.0", "node_modules", "@tovu", "sdk");
  await mkdir(plantedSdkDir, { recursive: true });
  await writeFile(
    path.join(plantedSdkDir, "package.json"),
    JSON.stringify({ name: "@tovu/sdk", version: "0.0.0-planted", main: "index.mjs", type: "module" }),
    "utf8"
  );
  await writeFile(path.join(plantedSdkDir, "index.mjs"), "export const MARKER = 'PLANTED';\n", "utf8");

  const pluginEntryPath = path.join(pluginDir, "index.mjs");
  await writeFile(
    pluginEntryPath,
    "import { MARKER } from '@tovu/sdk';\nexport const observedMarker = MARKER;\n",
    "utf8"
  );

  return { root, realSdkPath, pluginEntryUrl: pathToFileURL(pluginEntryPath).href };
}

test("CIC U-002-B1/ORD1 (ESCALATE_SECURITY): after registration, a plugin's bare '@tovu/sdk' import resolves to the runtime's real SDK, never a planted local node_modules/@tovu/sdk", async () => {
  const { root, realSdkPath, pluginEntryUrl } = await buildFixtures();
  try {
    registerPluginSdkResolver({ sdkModulePath: realSdkPath });

    const imported = (await import(pluginEntryUrl)) as { observedMarker: string };

    assert.equal(
      imported.observedMarker,
      "REAL",
      "the plugin's '@tovu/sdk' import must resolve to the runtime's real SDK build, not the planted local node_modules/@tovu/sdk sitting right next to the plugin"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CIC U-002: calling registerPluginSdkResolver() a second time in the same process throws PluginSdkResolverAlreadyRegisteredError specifically, not just any error", () => {
  // NOTE: the first call in this file (above) already registered the hook for this process. A
  // second call here must fail loudly with the SPECIFIC typed error (Contract Map: "should no-op
  // or throw clearly, not double-register") — asserting the specific class (not just "throws
  // something") keeps this test from being vacuously green against the pre-implementation stub,
  // which currently throws a plain Error for an unrelated reason ("not implemented").
  assert.throws(() => registerPluginSdkResolver(), PluginSdkResolverAlreadyRegisteredError);
});
