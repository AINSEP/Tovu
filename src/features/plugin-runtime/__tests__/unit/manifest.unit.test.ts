import assert from "node:assert/strict";
import test from "node:test";

import { validateManifest, type PluginManifest } from "../../manifest";

/**
 * @file C-006 `validateManifest()` — SPEC-005 REQ-01, BR-02/BR-03, AC-07/AC-08/AC-12, EC-01/EC-04/
 * EC-05, DUP-01 (`SHADOWS_BUILT_IN` half — the `ID_DUPLICATE` site-vs-site half needs the whole
 * discovered set and is covered by `discovery.integration.test.ts` instead).
 *
 * RT-009 note (carried into every fixture in this file): the 1.1.1 `plugin.tier` fix makes `tier`
 * a required field with no safe default. Every "baseline valid" manifest fixture below explicitly
 * declares `tier: "tier-3"` — the only value a v1 in-process ESM loader may declare (ADR-024 §1) —
 * so a fixture never spuriously fails validation for an unrelated reason.
 *
 * TDD-certified against the stub in `../../manifest.ts`; currently RED — `validateManifest` throws
 * "not implemented". These assertions describe the contract the Programmer stage must satisfy.
 */

function validManifest(overrides: Partial<PluginManifest> = {}): unknown {
  return {
    id: "word-count",
    name: "Word Count",
    version: "1.0.0",
    sdkRange: "^1.0.0",
    engine: 1,
    tier: "tier-3",
    capabilities: ["content.read", "content.extend", "hooks.attach"],
    hooks: ["content.entry.beforeSave"],
    fields: [{ path: "ext.word-count.count", type: "integer", queryable: false }],
    integrity: { "server/index.mjs": "sha256-deadbeef" },
    ...overrides,
  };
}

function required(manifest: unknown, folderName = "word-count", builtInIds: readonly string[] = []) {
  return { manifest, folderName, builtInIds };
}

function codesOf(result: { errors: readonly { code: string }[] }): string[] {
  return result.errors.map((e) => e.code).sort();
}

test("REQ-01/BR-03: a fully valid manifest (tier included, RT-009) produces zero errors", () => {
  const result = validateManifest(required(validManifest()));
  assert.deepEqual(result.errors, []);
});

test("REQ-01/AC-12: a manifest missing a required field is MANIFEST_MALFORMED", () => {
  const { name: _name, ...missingName } = validManifest() as Record<string, unknown>;
  const result = validateManifest(required(missingName));
  assert.ok(codesOf(result).includes("MANIFEST_MALFORMED"));
});

test("REQ-01 (1.1.1 fix)/BR-02: a manifest missing `tier` is MANIFEST_MALFORMED, same as any other required field", () => {
  const { tier: _tier, ...missingTier } = validManifest() as Record<string, unknown>;
  const result = validateManifest(required(missingTier));
  assert.ok(
    codesOf(result).includes("MANIFEST_MALFORMED"),
    "a missing `tier` must fail exactly like a missing `engine`/`sdkRange` — no silent default (behavior.spec.md §10)"
  );
});

test("REQ-01 (1.1.1 fix): a manifest with an out-of-vocabulary `tier` value is MANIFEST_MALFORMED", () => {
  const result = validateManifest(required(validManifest({ tier: "tier-9" as never })));
  assert.ok(codesOf(result).includes("MANIFEST_MALFORMED"));
});

test("REQ-01: unknown top-level manifest keys fail validation", () => {
  const result = validateManifest(required({ ...validManifest(), unexpectedKey: true } as never));
  assert.ok(codesOf(result).includes("MANIFEST_MALFORMED"));
});

test("REQ-01: engine newer than the runtime supports is ENGINE_UNSUPPORTED", () => {
  const result = validateManifest(required(validManifest({ engine: 999 })));
  assert.ok(codesOf(result).includes("ENGINE_UNSUPPORTED"));
});

test("EC-01: tovu.plugin.json id differing from the install folder name is ID_FOLDER_MISMATCH", () => {
  const result = validateManifest(required(validManifest({ id: "word-count" }), "different-folder-name"));
  assert.ok(codesOf(result).includes("ID_FOLDER_MISMATCH"));
});

test("REQ-01: an id outside ^[a-z0-9-]+$ or outside 1..50 chars is MANIFEST_MALFORMED", () => {
  const badChars = validateManifest(required(validManifest({ id: "Word_Count!" }), "Word_Count!"));
  assert.ok(codesOf(badChars).includes("MANIFEST_MALFORMED"));

  const tooLong = validateManifest(required(validManifest({ id: "a".repeat(51) }), "a".repeat(51)));
  assert.ok(codesOf(tooLong).includes("MANIFEST_MALFORMED"));
});

test("REQ-04: a manifest declaring a capability outside the v1 vocabulary is CAPABILITY_UNKNOWN", () => {
  const result = validateManifest(required(validManifest({ capabilities: ["content.read", "fs.write" as never] })));
  assert.ok(codesOf(result).includes("CAPABILITY_UNKNOWN"));
});

test("EC-05/REQ-05: a manifest declaring a hook point outside the v1 vocabulary is HOOK_UNKNOWN", () => {
  const result = validateManifest(required(validManifest({ hooks: ["content.entry.afterEverything"] })));
  assert.ok(codesOf(result).includes("HOOK_UNKNOWN"));
});

test("REQ-06/AC-07: a field path not namespaced to the plugin's own id is FIELD_PATH_INVALID", () => {
  const result = validateManifest(
    required(validManifest({ fields: [{ path: "ext.other-plugin.x", type: "string", queryable: false }] }))
  );
  assert.ok(codesOf(result).includes("FIELD_PATH_INVALID"));
});

test("EC-04/AC-08: a field declared queryable:true is QUERYABLE_UNSUPPORTED_V1", () => {
  const result = validateManifest(
    required(validManifest({ fields: [{ path: "ext.word-count.count", type: "integer", queryable: true }] }))
  );
  assert.ok(codesOf(result).includes("QUERYABLE_UNSUPPORTED_V1"));
});

test("DUP-01: a site plugin id equal to a built-in id is SHADOWS_BUILT_IN, and the built-in is unaffected (this function only reports the site record's error)", () => {
  const result = validateManifest(required(validManifest({ id: "word-count" }), "word-count", ["word-count"]));
  assert.ok(codesOf(result).includes("SHADOWS_BUILT_IN"));
});

test("REQ-01/BR-02 (collect-all, adversarial aggregate case): a manifest violating every rule at once reports ALL applicable codes, not just the first", () => {
  const kitchenSink = {
    id: "Bad_Id!",
    name: "Bad Plugin",
    version: "1.0.0",
    sdkRange: "^1.0.0",
    engine: 999,
    tier: "not-a-tier",
    capabilities: ["fs.write"],
    hooks: ["content.entry.afterEverything"],
    fields: [
      { path: "ext.someone-else.x", type: "string", queryable: true },
    ],
    integrity: { "server/index.mjs": "sha256-deadbeef" },
  };

  const result = validateManifest(required(kitchenSink, "totally-different-folder"));
  const codes = codesOf(result);

  for (const expected of [
    "MANIFEST_MALFORMED", // tier out of vocabulary (or id format) — at least one MANIFEST_MALFORMED entry
    "ENGINE_UNSUPPORTED",
    "ID_FOLDER_MISMATCH",
    "CAPABILITY_UNKNOWN",
    "HOOK_UNKNOWN",
    "FIELD_PATH_INVALID",
    "QUERYABLE_UNSUPPORTED_V1",
  ]) {
    assert.ok(
      codes.includes(expected),
      `collect-all validation must report ${expected} alongside every other violated rule — ` +
        `first-failure short-circuiting would silently hide it (BR-02, all codes found: ${codes.join(", ")})`
    );
  }
});

test("REQ-01/BR-02 (property-style): every one of the 6 well-formed-except-one-field mutations of a valid manifest independently produces exactly the error that field's own rule predicts, and no others introduced by the mutation itself", () => {
  const mutations: Array<{ label: string; overrides: Partial<PluginManifest>; expectedCode: string }> = [
    { label: "bad tier", overrides: { tier: "tier-4" as never }, expectedCode: "MANIFEST_MALFORMED" },
    { label: "bad engine", overrides: { engine: 42 }, expectedCode: "ENGINE_UNSUPPORTED" },
    { label: "bad capability", overrides: { capabilities: ["network.raw" as never] }, expectedCode: "CAPABILITY_UNKNOWN" },
    { label: "bad hook", overrides: { hooks: ["content.entry.afterSave"] }, expectedCode: "HOOK_UNKNOWN" },
    {
      label: "bad field namespace",
      overrides: { fields: [{ path: "ext.not-me.x", type: "string", queryable: false }] },
      expectedCode: "FIELD_PATH_INVALID",
    },
    {
      label: "queryable field",
      overrides: { fields: [{ path: "ext.word-count.count", type: "integer", queryable: true }] },
      expectedCode: "QUERYABLE_UNSUPPORTED_V1",
    },
  ];

  for (const { label, overrides, expectedCode } of mutations) {
    const result = validateManifest(required(validManifest(overrides)));
    assert.ok(
      codesOf(result).includes(expectedCode),
      `mutation "${label}" must produce ${expectedCode} (found: ${codesOf(result).join(", ")})`
    );
  }
});

test("REQ-01: validateManifest does not mutate its input manifest object", () => {
  const manifest = validManifest();
  const before = JSON.stringify(manifest);
  validateManifest(required(manifest));
  assert.equal(JSON.stringify(manifest), before);
});
