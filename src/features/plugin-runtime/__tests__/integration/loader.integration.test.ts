import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { loadPlugin } from "../../loader";
import type { PluginDiscoveryRecord } from "../../discovery";
import type { PluginManifest } from "../../manifest";

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
      },
      {
        importModule: async () => {
          importCalls += 1;
          return { default: { setup() {} } };
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
      },
      {
        runtimeSdkVersion: "1.0.0",
        importModule: async () => {
          importCalls += 1;
          return { default: { setup() {} } };
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
    const result = await loadPlugin(
      {
        record: record(),
        manifest: manifest({ integrity: { "server/index.mjs": correctHash }, sdkRange: "^1.0.0" }),
        entryPath,
      },
      {
        runtimeSdkVersion: "1.0.0",
        importModule: async (p) => {
          importCalls += 1;
          assert.equal(p, entryPath);
          return { default: { setup() {} } };
        },
      }
    );

    assert.equal(importCalls, 1, "a valid, compatible plugin must be imported exactly once");
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
      },
      { runtimeSdkVersion: "1.0.0" }
    );

    assert.equal(result.loaded, false);
    if (!result.loaded) assert.equal(result.reason, "CODE_ENTRY_MISSING");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
