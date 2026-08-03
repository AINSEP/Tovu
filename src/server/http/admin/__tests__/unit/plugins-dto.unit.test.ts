import assert from "node:assert/strict";
import test from "node:test";

import { toAdminPluginResponse } from "../../plugins";
import type { PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";

/**
 * @file C-017 `toAdminPluginResponse()` — SPEC-005 REQ-10/REQ-11, api.spec.md §5.
 *
 * TDD-certified against the stub in `../../plugins.ts`; currently RED — `toAdminPluginResponse`
 * throws "not implemented". These assertions describe the contract the Programmer stage must
 * satisfy.
 */

function discovery(overrides: Partial<PluginDiscoveryRecord> = {}): PluginDiscoveryRecord {
  return {
    id: "word-count",
    name: "Word Count",
    version: "1.0.0",
    source: "built-in",
    status: "valid",
    errors: [],
    ...overrides,
  };
}

test("REQ-10: a plugin never enabled (activation null) maps to enabled:false, not an error", () => {
  const response = toAdminPluginResponse(discovery(), null);
  assert.equal(response.enabled, false);
});

test("REQ-10: a plugin with an activation row projects its enabled flag verbatim", () => {
  const response = toAdminPluginResponse(discovery(), {
    pluginId: "word-count",
    workspaceId: "ws-1",
    version: "1.0.0",
    enabled: true,
    updatedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(response.enabled, true);
});

test("REQ-10: id/name/version/source/status/errors pass through unchanged from the discovery record", () => {
  const record = discovery({
    id: "invalid-site-plugin",
    name: "Invalid Site Plugin",
    version: "2.0.0",
    source: "site",
    status: "invalid",
    errors: [{ code: "HOOK_UNKNOWN", file: "tovu.plugin.json", message: "unknown hook" }],
  });
  const response = toAdminPluginResponse(record, null);

  assert.equal(response.id, "invalid-site-plugin");
  assert.equal(response.name, "Invalid Site Plugin");
  assert.equal(response.version, "2.0.0");
  assert.equal(response.source, "site");
  assert.equal(response.status, "invalid");
  assert.deepEqual(response.errors, [{ code: "HOOK_UNKNOWN", file: "tovu.plugin.json", message: "unknown hook" }]);
});

test("REQ-10: a valid plugin's errors array is empty, never null/undefined", () => {
  const response = toAdminPluginResponse(discovery({ status: "valid", errors: [] }), null);
  assert.deepEqual(response.errors, []);
});

// --- 1.1.2 addendum: REQ-10's additive `tier` field (REQ-18/AC-26 badge input) ---
//
// Small addition alongside the rest of this certified suite (SPEC-005 1.1.2, RT-010): REQ-10's
// response gains one additive field, `tier`, "mirroring how `enabled` is already projected." This
// is NOT incidentally covered by the pre-existing tests above — the `discovery()` helper's base
// fixture and every pre-1.1.2 assertion in this file are silent on `tier` (verified: `discovery()`
// above has no `tier` key at all, and no prior assertion here reads `response.tier`). These two
// tests are the dedicated wire-level coverage for the new field.
test("REQ-10 (1.1.2): tier passes through unchanged from the discovery record — mirrors id/name/version/source/status", () => {
  const response = toAdminPluginResponse(discovery({ tier: "tier-1" }), null);
  assert.equal(response.tier, "tier-1");
});

test("REQ-10 (1.1.2)/AC-26: distinct records project their OWN tier value, never a value hardcoded to tier-3", () => {
  const tierOne = toAdminPluginResponse(discovery({ id: "tier-one-plugin", tier: "tier-1" }), null);
  const tierTwo = toAdminPluginResponse(discovery({ id: "tier-two-plugin", tier: "tier-2" }), null);
  const tierThree = toAdminPluginResponse(discovery({ id: "tier-three-plugin", tier: "tier-3" }), null);

  assert.equal(tierOne.tier, "tier-1");
  assert.equal(tierTwo.tier, "tier-2");
  assert.equal(tierThree.tier, "tier-3");
});
