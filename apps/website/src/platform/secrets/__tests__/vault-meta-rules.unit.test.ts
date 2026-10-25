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

// L11 Stryker: 91 no-coverage mutants — the recovery-provenance and destination-run allowlists
// were reached only through `vault-kinds`. Exercise each rule directly, with one item per list entry.
const credentialUrl = "https://user:password@example.test";
const credentialIn = (field: string) => ({ name: "CredentialInputError", message: "Put credentials in the secret field, not in this field.", field });

test("a legacy AAD marker is refused whatever its value", () => {
  for (const legacyAad of ["v1", null, undefined, 0]) assert.throws(() => assertRecoveryMeta({ meta: { legacyAad } as never }), invalidMeta, String(legacyAad));
});
test("every documented normalization status is accepted; anything else is refused", () => {
  for (const normalization of ["missing-key", "unopenable", "invalid-meta", "catalog-unavailable", "conflict"]) {
    assert.equal(assertRecoveryMeta({ meta: { normalization } }), undefined, normalization);
  }
  for (const normalization of ["", "CONFLICT", "conflict ", "unknown", null, 1, ["conflict"], {}]) {
    assert.throws(() => assertRecoveryMeta({ meta: { normalization } as never }), invalidMeta, JSON.stringify(normalization));
  }
});
test("migration provenance must be a plain object", () => {
  for (const migration of [null, "old", 1, [], ["originalLabel"]]) assert.throws(() => assertRecoveryMeta({ meta: { migration } as never }), invalidMeta, JSON.stringify(migration));
  assert.equal(assertRecoveryMeta({ meta: { migration: {}, normalization: "conflict" } }), undefined);
});
test("each migration label is checked for credentials; non-string labels are ignored", () => {
  for (const field of ["originalLabel", "mappedLabel"]) {
    assert.throws(() => assertRecoveryMeta({ meta: { migration: { originalLabel: "ok", mappedLabel: "ok", [field]: credentialUrl } } }), credentialIn(field));
  }
  assert.equal(assertRecoveryMeta({ meta: { migration: { originalLabel: 42, mappedLabel: null, other: credentialUrl } } }), undefined);
});

test("api-connection metadata is dispatched to the Tovu parser, not Jini's kind parser", () => {
  const untouched: VaultMetaParsers = new Proxy(base, { get: () => () => { throw new Error("base parser must not run"); } });
  assert.throws(() => parseStructuralMeta({ kind: "api-connection", meta: { nonsense: true }, provider: null, base: untouched }), { name: "OAuthTokenStoreError" });
});
test("a destination keeps a string savedAt, omits an absent one, and refuses a non-string one", () => {
  const meta = { description, lastRun: null };
  assert.equal(parseStructuralMeta({ kind: "database-destination", meta: { ...meta, savedAt: "2026-10-16T00:00:00.000Z" }, provider: null, base }).savedAt, "2026-10-16T00:00:00.000Z");
  assert.equal(Object.hasOwn(parseStructuralMeta({ kind: "database-destination", meta, provider: null, base }), "savedAt"), false);
  for (const savedAt of [42, null, {}]) {
    assert.throws(() => parseStructuralMeta({ kind: "database-destination", meta: { ...meta, savedAt } as never, provider: null, base }), invalidMeta, JSON.stringify(savedAt));
  }
});

test("a publish peer needs a string baseUrl and a non-empty remoteWorkspaceId", () => {
  assert.equal(assertHostMetaRules({ kind: "publish-peer", meta: { baseUrl: "https://peer.example.test", remoteWorkspaceId: "ws-2" } }), undefined);
  for (const meta of [{ remoteWorkspaceId: "ws-2" }, { baseUrl: 1, remoteWorkspaceId: "ws-2" }, { baseUrl: "https://peer.example.test" },
    { baseUrl: "https://peer.example.test", remoteWorkspaceId: "" }, { baseUrl: "https://peer.example.test", remoteWorkspaceId: 7 }]) {
    assert.throws(() => assertHostMetaRules({ kind: "publish-peer", meta: meta as never }), invalidMeta, JSON.stringify(meta));
  }
});

test("a destination description needs exactly its four string fields, none holding a credential", () => {
  for (const meta of [{ lastRun: null }, { description: null, lastRun: null },
    ...["host", "port", "database", "user"].flatMap(field => [
      { description: { ...description, [field]: undefined }, lastRun: null },
      { description: { ...description, [field]: 5432 }, lastRun: null },
    ]),
    { description: { ...description, password: "x" }, lastRun: null }]) {
    assert.throws(() => assertHostMetaRules({ kind: "database-destination", meta: meta as never }), invalidMeta, JSON.stringify(meta));
  }
  for (const field of ["host", "port", "database", "user"]) {
    assert.throws(() => assertHostMetaRules({ kind: "database-destination", meta: { description: { ...description, [field]: credentialUrl }, lastRun: null } }), credentialIn(field));
  }
});

const success = { copied: true, snapshotAt: "2026-10-16T00:00:00.000Z", tableCount: 3, rowCount: 0 };
const failure = { copied: false, snapshotAt: "2026-10-16T00:00:00.000Z", code: "E_COPY", message: "boom" };
test("a destination's last run is a success or failure summary with only its own fields", () => {
  assert.equal(assertHostMetaRules({ kind: "database-destination", meta: { description, lastRun: success } }), undefined);
  assert.equal(assertHostMetaRules({ kind: "database-destination", meta: { description, lastRun: failure } }), undefined);
  for (const lastRun of [undefined, {}, { ...success, snapshotAt: 1 }, { ...success, copied: "yes" },
    { ...success, code: "E" }, { ...failure, tableCount: 1 }, { ...failure, code: 1 }, { ...failure, message: null },
    { ...success, tableCount: -1 }, { ...success, rowCount: 1.5 }, { ...success, rowCount: Number.MAX_SAFE_INTEGER + 1 }, { ...success, tableCount: "3" },
    { ...success, rowCount: -1 }]) {
    assert.throws(() => assertHostMetaRules({ kind: "database-destination", meta: { description, lastRun } as never }), invalidMeta, JSON.stringify(lastRun));
  }
});

test("a custom credential (or a vendor marked custom) needs a known category", () => {
  for (const category of ["source-control", "hosting", "media", "ai", "ops", "general"]) {
    assert.equal(assertHostMetaRules({ kind: "custom", meta: { category } }), undefined, category);
    assert.equal(assertHostMetaRules({ kind: "vendor", meta: { credentialType: "custom", category } }), undefined, category);
  }
  for (const meta of [{}, { category: "other" }, { category: "General" }]) {
    assert.throws(() => assertHostMetaRules({ kind: "custom", meta }), invalidMeta, JSON.stringify(meta));
    assert.throws(() => assertHostMetaRules({ kind: "vendor", meta: { ...meta, credentialType: "custom" } }), invalidMeta);
  }
  assert.equal(assertHostMetaRules({ kind: "vendor", meta: { credentialType: "vendor" } }), undefined, "a plain vendor needs no category");
});

test("every credential-free text field, additional host and worksFor entry is checked", () => {
  for (const field of ["baseUrl", "model", "username", "accountLabel"]) {
    assert.throws(() => assertHostMetaRules({ kind: "site-assistant", meta: { [field]: credentialUrl } }), credentialIn(field));
    assert.equal(assertHostMetaRules({ kind: "site-assistant", meta: { [field]: "plain" } }), undefined);
  }
  assert.throws(() => assertHostMetaRules({ kind: "vendor", meta: { additionalHosts: ["https://ok.example.test", "https://ok.example.test/path"] } }), invalidMeta);
  assert.equal(assertHostMetaRules({ kind: "vendor", meta: { additionalHosts: ["https://a.example.test", "https://b.example.test"] } }), undefined);
  assert.throws(() => assertHostMetaRules({ kind: "vendor", meta: { worksFor: ["host", credentialUrl] } }), credentialIn("worksFor"));
  assert.equal(assertHostMetaRules({ kind: "vendor", meta: { worksFor: ["host", "other"], additionalHosts: "not-a-list" } }), undefined);
});
