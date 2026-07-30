import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverPlugins } from "../../discovery";
import { buildAc11FixtureInstallDir, WORD_COUNT_BUILT_IN } from "../fixtures/ac11-fixture";

/**
 * @file C-007 `discoverPlugins()` — SPEC-005 REQ-02/03, AC-09, AC-11, AC-16, EC-08/EC-09, TB-01,
 * DUP-01.
 *
 * TDD-certified against the stub in `../../discovery.ts`; currently RED — `discoverPlugins` throws
 * "not implemented". These assertions describe the contract the Programmer stage must satisfy.
 */

test("AC-11/REQ-10 (RT-009 fixture): built-in word-count + one valid + one invalid site plugin all appear with correct source/status", async () => {
  const { installDir, builtIns } = await buildAc11FixtureInstallDir();
  try {
    const records = await discoverPlugins({ installDir, builtIns });

    assert.equal(records.length, 3);
    const byId = new Map(records.map((r) => [r.id, r]));

    assert.equal(byId.get("word-count")?.source, "built-in");
    assert.equal(byId.get("word-count")?.status, "valid");
    assert.deepEqual(byId.get("word-count")?.errors, []);

    assert.equal(byId.get("valid-site-plugin")?.source, "site");
    assert.equal(
      byId.get("valid-site-plugin")?.status,
      "valid",
      "the tier-fixed (RT-009) valid site plugin must not spuriously become invalid"
    );
    assert.deepEqual(byId.get("valid-site-plugin")?.errors, []);

    assert.equal(byId.get("invalid-site-plugin")?.source, "site");
    assert.equal(byId.get("invalid-site-plugin")?.status, "invalid");
    assert.ok(byId.get("invalid-site-plugin")?.errors.some((e) => e.code === "HOOK_UNKNOWN"));
  } finally {
    await rm(installDir, { recursive: true, force: true });
  }
});

test("TB-01: PLUGINS_LIST ordering is built-ins first by id ascending, then site plugins by id ascending", async () => {
  const { installDir, builtIns } = await buildAc11FixtureInstallDir();
  try {
    const records = await discoverPlugins({ installDir, builtIns });
    assert.deepEqual(
      records.map((r) => `${r.source}:${r.id}`),
      ["built-in:word-count", "site:invalid-site-plugin", "site:valid-site-plugin"]
    );
  } finally {
    await rm(installDir, { recursive: true, force: true });
  }
});

test("EC-09/AC-16: legacy mode (no install dir) discovers built-ins only; word-count is still listed and enableable", async () => {
  const records = await discoverPlugins({ builtIns: [WORD_COUNT_BUILT_IN] });
  assert.equal(records.length, 1);
  assert.equal(records[0].id, "word-count");
  assert.equal(records[0].source, "built-in");
  assert.equal(records[0].status, "valid");
});

test("AC-09/EC-08: when two installed versions of one site plugin id exist, only the latest by semver is included, the other stays dormant", async () => {
  const { installDir, builtIns } = await buildAc11FixtureInstallDir();
  try {
    // Add a second, OLDER installed version of valid-site-plugin alongside the existing 1.0.0.
    const olderDir = path.join(installDir, "valid-site-plugin", "0.9.0", "server");
    await mkdir(olderDir, { recursive: true });
    await writeFile(
      path.join(installDir, "valid-site-plugin", "0.9.0", "tovu.plugin.json"),
      JSON.stringify({
        id: "valid-site-plugin",
        name: "Valid Site Plugin",
        version: "0.9.0",
        sdkRange: "^1.0.0",
        engine: 1,
        tier: "tier-3",
        capabilities: ["content.read"],
        hooks: [],
        fields: [],
        integrity: {},
      }),
      "utf8"
    );
    await writeFile(path.join(olderDir, "index.mjs"), "export default {};\n", "utf8");

    const records = await discoverPlugins({ installDir, builtIns });
    const matches = records.filter((r) => r.id === "valid-site-plugin");

    assert.equal(matches.length, 1, "only one record per plugin id — the older dormant install must not appear as a second row");
    assert.equal(matches[0].version, "1.0.0", "the latest installed version by semver must win");
  } finally {
    await rm(installDir, { recursive: true, force: true });
  }
});

test("DUP-01: two site plugins with case-insensitively matching ids are BOTH marked ID_DUPLICATE", async () => {
  const { installDir, builtIns } = await buildAc11FixtureInstallDir();
  try {
    // Rename-collide: plant a second folder whose manifest id case-insensitively matches
    // valid-site-plugin's id (folder name itself must match its own manifest id, EC-01, so this
    // uses a different folder name with the SAME id value, differently cased).
    const dupDir = path.join(installDir, "valid-site-plugin-dup", "1.0.0", "server");
    await mkdir(dupDir, { recursive: true });
    await writeFile(
      path.join(installDir, "valid-site-plugin-dup", "1.0.0", "tovu.plugin.json"),
      JSON.stringify({
        id: "Valid-Site-Plugin", // case-insensitive match against "valid-site-plugin"
        name: "Duplicate",
        version: "1.0.0",
        sdkRange: "^1.0.0",
        engine: 1,
        tier: "tier-3",
        capabilities: [],
        hooks: [],
        fields: [],
        integrity: {},
      }),
      "utf8"
    );
    await writeFile(path.join(dupDir, "index.mjs"), "export default {};\n", "utf8");
    // EC-01 requires id === folder name; give the duplicate its own matching folder name too.
    await mkdir(path.join(installDir, "Valid-Site-Plugin", "1.0.0", "server"), { recursive: true });
    await writeFile(
      path.join(installDir, "Valid-Site-Plugin", "1.0.0", "tovu.plugin.json"),
      JSON.stringify({
        id: "Valid-Site-Plugin",
        name: "Duplicate",
        version: "1.0.0",
        sdkRange: "^1.0.0",
        engine: 1,
        tier: "tier-3",
        capabilities: [],
        hooks: [],
        fields: [],
        integrity: {},
      }),
      "utf8"
    );
    await writeFile(path.join(installDir, "Valid-Site-Plugin", "1.0.0", "server", "index.mjs"), "export default {};\n", "utf8");
    await rm(dupDir, { recursive: true, force: true }); // remove the mismatched-folder attempt above; keep only the matching one

    const records = await discoverPlugins({ installDir, builtIns });
    const collisions = records.filter((r) => r.id.toLowerCase() === "valid-site-plugin");

    assert.ok(collisions.length >= 2, "both case-insensitively-colliding site records must be present, not merged/deduped silently");
    for (const record of collisions) {
      assert.ok(
        record.errors.some((e) => e.code === "ID_DUPLICATE"),
        `record ${record.id} must carry ID_DUPLICATE — site-vs-site collisions mark BOTH (DUP-01)`
      );
    }
  } finally {
    await rm(installDir, { recursive: true, force: true });
  }
});

test("DUP-01: a site plugin id equal to a built-in id marks the site record SHADOWS_BUILT_IN and leaves the built-in unaffected", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-plugin-shadow-"));
  const versionDir = path.join(root, "plugins", "word-count", "1.0.0", "server");
  try {
    await mkdir(versionDir, { recursive: true });
    await writeFile(
      path.join(root, "plugins", "word-count", "1.0.0", "tovu.plugin.json"),
      JSON.stringify({
        id: "word-count",
        name: "Shadowing Word Count",
        version: "1.0.0",
        sdkRange: "^1.0.0",
        engine: 1,
        tier: "tier-3",
        capabilities: [],
        hooks: [],
        fields: [],
        integrity: {},
      }),
      "utf8"
    );
    await writeFile(path.join(versionDir, "index.mjs"), "export default {};\n", "utf8");

    const records = await discoverPlugins({ installDir: path.join(root, "plugins"), builtIns: [WORD_COUNT_BUILT_IN] });
    const builtIn = records.find((r) => r.source === "built-in" && r.id === "word-count");
    const site = records.find((r) => r.source === "site" && r.id === "word-count");

    assert.equal(builtIn?.status, "valid", "the built-in must be entirely unaffected by a shadowing site plugin");
    assert.ok(site?.errors.some((e) => e.code === "SHADOWS_BUILT_IN"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
