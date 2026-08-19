import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadPlugin } from "../../loader.js";
import type { CapabilityScopedSdkCoreDeps } from "../../capability-sdk.js";
import type { PluginDiscoveryRecord } from "../../discovery.js";
import type { PluginManifest } from "../../manifest.js";
import type { PluginSdk } from "../../../../../packages/sdk/src/index.js";

/**
 * @file C-008 `loadPlugin()` — SPEC-005 REQ-03, AC-03/AC-04, INV-04. **CIC U-001 (Binding,
 * ESCALATE_SECURITY): verify-before-import ordering.** This is the dedicated, direct coverage the
 * TDD dispatch requires for U-001 — integrity and `sdkRange` must both pass before `import()` is
 * ever called, for every load.
 *
 * TDD-certified against the stub in `../../loader.ts`; currently RED — `loadPlugin` throws "not
 * implemented". These assertions describe the contract the Programmer stage must satisfy.
 */

function sha256(bytes: string): string {
  return `sha256-${createHash("sha256").update(bytes, "utf8").digest("hex")}`;
}

async function writeFixtureEntry(dir: string, contents: string): Promise<string> {
  const entryPath = path.join(dir, "server", "index.mjs");
  await mkdir(path.dirname(entryPath), { recursive: true });
  await writeFile(entryPath, contents, "utf8");
  return entryPath;
}

function record(overrides: Partial<PluginDiscoveryRecord> = {}): PluginDiscoveryRecord {
  return {
    id: "loader-fixture",
    name: "Loader Fixture",
    version: "1.0.0",
    source: "site",
    status: "valid",
    errors: [],
    ...overrides,
  };
}

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: "loader-fixture",
    name: "Loader Fixture",
    version: "1.0.0",
    sdkRange: "^1.0.0",
    engine: 1,
    tier: "tier-3",
    capabilities: [],
    hooks: [],
    fields: [],
    integrity: {},
    ...overrides,
  };
}

function coreDeps(overrides: Partial<CapabilityScopedSdkCoreDeps> = {}): CapabilityScopedSdkCoreDeps {
  return {
    getCurrentEntry: () => ({
      id: "entry-1",
      workspaceId: "ws-1",
      title: "Entry",
      slug: "entry",
      status: "draft",
      bodyJson: {},
      ext: {},
    }),
    writeExtField: () => {},
    attachFilter: () => {},
    ...overrides,
  };
}

function definedPluginModule(setup: (sdk: PluginSdk) => void | Promise<void> = () => {}): unknown {
  return { default: { definition: { setup } } };
}

test("CIC U-001-ORD1 (ESCALATE_SECURITY): a tampered plugin's code is NEVER import()-ed — integrity is checked before step (3)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-loader-tampered-"));
  try {
    const entryContents = "export default { setup() {} };\n";
    const entryPath = await writeFixtureEntry(dir, entryContents);
    // Record the hash of DIFFERENT bytes than what's on disk — a tamper, by construction.
    const wrongHash = sha256("this is not what is on disk");

    let importCalls = 0;
    const result = await loadPlugin(
      {
        record: record(),
        manifest: manifest({ integrity: { "server/index.mjs": wrongHash } }),
        entryPath,
        coreDeps: coreDeps(),
      },
      {
        importModule: async () => {
          importCalls += 1;
          return definedPluginModule();
        },
      }
    );

    assert.equal(importCalls, 0, "import() must NEVER be called when integrity verification fails (CIC U-001)");
    assert.equal(result.loaded, false);
    if (!result.loaded) assert.equal(result.reason, "INTEGRITY_FAILED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CIC U-001-ORD1 (ESCALATE_SECURITY): an sdkRange-incompatible plugin's code is NEVER import()-ed — sdkRange is checked before step (3)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-loader-incompatible-"));
  try {
    const entryContents = "export default { setup() {} };\n";
    const entryPath = await writeFixtureEntry(dir, entryContents);
    const correctHash = sha256(entryContents);

    let importCalls = 0;
    const result = await loadPlugin(
      {
        record: record(),
        manifest: manifest({
          integrity: { "server/index.mjs": correctHash },
          sdkRange: ">=99.0.0", // unsatisfiable against any realistic runtime SDK version
        }),
        entryPath,
        coreDeps: coreDeps(),
      },
      {
        runtimeSdkVersion: "1.0.0",
        importModule: async () => {
          importCalls += 1;
          return definedPluginModule();
        },
      }
    );

    assert.equal(importCalls, 0, "import() must NEVER be called when sdkRange is unsatisfied (AC-04/CIC U-001)");
    assert.equal(result.loaded, false);
    if (!result.loaded) assert.equal(result.reason, "SDK_RANGE_UNSATISFIED");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("AC-03/INV-04: integrity verification runs BEFORE the sdkRange check — a plugin that fails BOTH is reported as INTEGRITY_FAILED, not SDK_RANGE_UNSATISFIED (BR-01's fixed step order)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-loader-both-fail-"));
  try {
    const entryContents = "export default { setup() {} };\n";
    const entryPath = await writeFixtureEntry(dir, entryContents);
    const wrongHash = sha256("tampered bytes, not what is on disk");

    const result = await loadPlugin(
      {
        record: record(),
        manifest: manifest({ integrity: { "server/index.mjs": wrongHash }, sdkRange: ">=99.0.0" }),
        entryPath,
        coreDeps: coreDeps(),
      },
      { runtimeSdkVersion: "1.0.0" }
    );

    assert.equal(result.loaded, false);
    if (!result.loaded) {
      assert.equal(
        result.reason,
        "INTEGRITY_FAILED",
        "BR-01's fixed step order (1) integrity, THEN (2) sdkRange means integrity's failure must win when both would fail"
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("AC-03: a valid, compatible plugin whose bytes match their integrity hash and whose sdkRange is satisfied IS imported and reports loaded:true", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-loader-happy-"));
  try {
    const entryContents = "export default { setup() {} };\n";
    const entryPath = await writeFixtureEntry(dir, entryContents);
    const correctHash = sha256(entryContents);

    let importCalls = 0;
    let setupCalls = 0;
    const result = await loadPlugin(
      {
        record: record(),
        manifest: manifest({ integrity: { "server/index.mjs": correctHash }, sdkRange: "^1.0.0" }),
        entryPath,
        coreDeps: coreDeps(),
      },
      {
        runtimeSdkVersion: "1.0.0",
        importModule: async (p) => {
          importCalls += 1;
          assert.equal(p, entryPath);
          return definedPluginModule(() => {
            setupCalls += 1;
          });
        },
      }
    );

    assert.equal(importCalls, 1, "a valid, compatible plugin must be imported exactly once");
    assert.equal(setupCalls, 1, "the imported definePlugin export's setup() must run exactly once");
    assert.equal(result.loaded, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("REQ-03/AC-12: a plugin whose entry file is missing on disk fails CODE_ENTRY_MISSING, not a raw filesystem error", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-loader-missing-entry-"));
  try {
    const missingEntryPath = path.join(dir, "server", "index.mjs"); // never written
    const result = await loadPlugin(
      {
        record: record(),
        manifest: manifest({ integrity: {} }),
        entryPath: missingEntryPath,
        coreDeps: coreDeps(),
      },
      { runtimeSdkVersion: "1.0.0" }
    );

    assert.equal(result.loaded, false);
    if (!result.loaded) assert.equal(result.reason, "CODE_ENTRY_MISSING");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("REQ-03 step (4): setup receives a capability-scoped SDK whose granted addFilter delegates to the composition root's coreDeps", async () => {
  let attachedHook: string | null = null;
  const result = await loadPlugin(
    {
      record: record(),
      manifest: manifest({ capabilities: ["hooks.attach"], hooks: ["content.entry.beforeSave"] }),
      entryPath: "built-in:loader-fixture",
      coreDeps: coreDeps({
        attachFilter: (hookName) => {
          attachedHook = hookName;
        },
      }),
    },
    {
      runtimeSdkVersion: "1.0.0",
      importModule: async () =>
        definedPluginModule((sdk) => {
          sdk.addFilter("content.entry.beforeSave", async () => ({}));
        }),
    }
  );

  assert.deepEqual(result, { loaded: true });
  assert.equal(attachedHook, "content.entry.beforeSave");
});

test("REQ-03 step (4): a module without a valid definePlugin default export is rejected without running setup", async () => {
  const result = await loadPlugin(
    {
      record: record(),
      manifest: manifest(),
      entryPath: "built-in:invalid-export",
      coreDeps: coreDeps(),
    },
    { runtimeSdkVersion: "1.0.0", importModule: async () => ({ default: { setup() {} } }) }
  );

  assert.deepEqual(result, { loaded: false, reason: "PLUGIN_EXPORT_INVALID" });
});

test("REQ-03 step (4): a setup failure is returned to the enable caller instead of being swallowed", async () => {
  const result = await loadPlugin(
    {
      record: record(),
      manifest: manifest(),
      entryPath: "built-in:throwing-setup",
      coreDeps: coreDeps(),
    },
    {
      runtimeSdkVersion: "1.0.0",
      importModule: async () =>
        definedPluginModule(() => {
          throw new Error("setup exploded");
        }),
    }
  );

  assert.deepEqual(result, { loaded: false, reason: "PLUGIN_SETUP_FAILED" });
});
