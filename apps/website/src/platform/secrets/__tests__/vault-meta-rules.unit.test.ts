import "../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createVaultMetaParsers, VaultError, type VaultMetaParsers } from "@jini-ai/platform/secrets/credential-sets";
import { assertCredentialFreeOrigin, assertHostMetaRules, assertRecoveryMeta, parseStructuralMeta, withRecoveryMeta } from "../vault-meta-rules.js";

const invalidMeta = { name: "VaultError", message: "Secrets vault: invalid-meta", code: "invalid-meta" };
const base: VaultMetaParsers = createVaultMetaParsers({});
const description = { host: "db.example.test", port: "5432", database: "content", user: "writer" };

// Jini's structural parser only ever yields string origins; these pin the defence-in-depth check.
for (const value of [42, null, ["https://api.example.test"], { origin: "https://api.example.test" }]) {
  test(`an additional host that is not a string is refused: ${JSON.stringify(value)}`, () => {
    assert.throws(() => assertCredentialFreeOrigin({ value }), invalidMeta);
  });
}
test("a canonical additional origin passes", () => {
  assert.equal(assertCredentialFreeOrigin({ value: "https://api.example.test" }, {}), undefined);
});
test("recovery metadata without provenance passes", () => {
  assert.equal(assertRecoveryMeta({ meta: { model: "m" } }, {}), undefined);
});
test("a structural failure is reported before a destination's savedAt type", () => {
  // Both refuse with invalid-meta; a failing fake parser proves the structural parse runs first.
  const refusal = new VaultError({ code: "conflict" });
  const failing: VaultMetaParsers = { ...base, "database-destination": () => { throw refusal; } };
  assert.throws(() => parseStructuralMeta({ kind: "database-destination", meta: { description, lastRun: null, savedAt: 42 }, provider: null, base: failing }, {}), error => error === refusal);
});
test("other kinds pass savedAt to the structural parser, which refuses it", () => {
  assert.throws(() => parseStructuralMeta({ kind: "site-assistant", meta: { savedAt: "2026-10-16T00:00:00.000Z" }, provider: undefined, base }), invalidMeta);
});
test("host rules accept a destination whose last run is null", () => {
  assert.equal(assertHostMetaRules({ kind: "database-destination", meta: { description, lastRun: null } }, {}), undefined);
});
test("absent provenance adds no keys", () => {
  assert.deepEqual(withRecoveryMeta({ meta: { model: "m" }, migration: undefined, normalization: undefined }, {}), { model: "m" });
});
test("present provenance is re-attached after the policy's metadata", () => {
  assert.deepEqual(withRecoveryMeta({ meta: { model: "m" }, migration: {}, normalization: "conflict" }), { model: "m", migration: {}, normalization: "conflict" });
});
