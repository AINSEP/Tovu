import "../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryVaultRepo, type VaultContext, type VaultKind, type VaultMeta } from "@jini-ai/platform/secrets/credential-sets";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { CUSTOM_CREDENTIAL_CATEGORIES } from "#src/features/custom-credentials/types";
import { byVaultLabel, createTovuStoreVault, createTovuVaultKinds, parseTovuStoreMeta, type TovuVaultPolicy } from "../vault-kinds.js";

const policy: TovuVaultPolicy = {
  validateMeta: ({ meta }) => meta,
  legacyPublishCredential: () => undefined,
  tokenField: () => undefined,
};
const parsers = createTovuVaultKinds({ policy }).metaParsers;
const description = { host: "db.example.test", port: "5432", database: "content", user: "writer" };
const snapshotAt = "2026-10-16T00:00:00.000Z";

function invalid(kind: VaultKind, meta: unknown) {
  assert.throws(() => parsers[kind]({ meta }), { name: "VaultError", message: "Secrets vault: invalid-meta", code: "invalid-meta" });
}

test("host metadata policy receives parsed fields and returns its catalog decision with migration provenance", () => {
  const seen: unknown[] = [];
  const registry = createTovuVaultKinds({ policy: { ...policy, validateMeta: input => {
    seen.push(input);
    return { ...input.meta, model: "catalog-model" };
  } } }, {});
  const meta = { baseUrl: "https://models.example.test", model: "requested-model", migration: { originalLabel: "Original", mappedLabel: "Mapped" }, normalization: "conflict" };
  assert.deepEqual(registry.metaParsers["media-provider"]({ meta }, {}), { ...meta, model: "catalog-model" });
  assert.deepEqual(seen, [{ kind: "media-provider", meta: { baseUrl: meta.baseUrl, model: "requested-model" } }]);
  assert.equal(registry.isCopyableKind.custom, true);
  assert.equal(registry.isCopyableKind["personal-execution"], false);
});

for (const normalization of ["missing-key", "unopenable", "invalid-meta", "catalog-unavailable", "conflict"]) {
  test(`preserves the ${normalization} recovery status`, () => {
    assert.deepEqual(parsers.vendor({ meta: { accountLabel: null, normalization } }), { accountLabel: null, normalization });
  });
}
for (const [label, meta] of [
  ["unknown normalization", { normalization: "ready" }],
  ["null normalization", { normalization: null }],
  ["null migration", { migration: null }],
  ["scalar migration", { migration: "old" }],
  ["array migration", { migration: [] }],
] as const) test(`rejects ${label} as ordinary metadata`, () => invalid("vendor", meta));

test("migration fields may be absent or non-string JSON without losing provenance", () => {
  for (const migration of [{}, { originalLabel: null, mappedLabel: 42 }]) {
    const meta = { migration };
    assert.deepEqual(parsers.vendor({ meta }), meta);
  }
});

for (const [kind, field] of [["media-provider", "baseUrl"], ["site-assistant", "model"], ["custom", "username"], ["vendor", "accountLabel"]] as const) {
  test(`${field} cannot move credentials into plain ${kind} metadata`, () => {
    const meta = { ...(kind === "custom" ? { category: "general" } : {}), [field]: "https://user:password@example.test" };
    assert.throws(() => parsers[kind]({ meta }), { name: "CredentialInputError", message: "Put credentials in the secret field, not in this field.", field });
  });
}
test("database descriptions cannot hold credentials in an otherwise valid field", () => {
  assert.throws(() => parsers["database-destination"]({ meta: { description: { ...description, host: "https://user:password@example.test" }, lastRun: null } }), {
    name: "CredentialInputError", message: "Put credentials in the secret field, not in this field.", field: "host",
  });
});

for (const field of ["originalLabel", "mappedLabel"]) test(`migration ${field} cannot contain a credential`, () => {
  assert.throws(() => parsers.vendor({ meta: { migration: { [field]: "https://user:password@example.test" } } }), /credential|secret|password/i);
});

test("all custom credential categories accept canonical additional origins and optional username", () => {
  for (const category of CUSTOM_CREDENTIAL_CATEGORIES) {
    const meta = { category, baseUrl: "https://api.example.test", additionalHosts: ["https://uploads.example.test", "http://localhost:9000"], username: "writer" };
    assert.deepEqual(parsers.custom({ meta }), meta);
  }
  invalid("custom", { category: null });
});
for (const host of ["https://api.example.test/", "https://api.example.test?token=abc"]) {
  test(`additional host must be an origin: ${host}`, () => invalid("custom", { category: "general", additionalHosts: [host] }));
}
test("malformed additional host URLs fail instead of reaching the host policy", () => {
  assert.throws(() => parsers.custom({ meta: { category: "general", additionalHosts: ["not a URL"] } }), { name: "TypeError", message: "Invalid URL" });
});

test("publish peers require a nonempty remote workspace and a string base URL", () => {
  const meta = { baseUrl: "https://peer.example.test", remoteWorkspaceId: "remote" };
  assert.deepEqual(parsers["publish-peer"]({ meta }), meta);
  for (const patch of [{ baseUrl: null }, { remoteWorkspaceId: null }, { remoteWorkspaceId: "" }]) invalid("publish-peer", { ...meta, ...patch });
  invalid("publish-peer", { baseUrl: meta.baseUrl });
});

test("database destinations retain savedAt and accept metadata-only saves and both run outcomes", () => {
  for (const lastRun of [null, { copied: true, snapshotAt, tableCount: 0, rowCount: 12 }, { copied: false, snapshotAt, code: "NETWORK", message: "Try again" }]) {
    const meta = { description, lastRun, savedAt: snapshotAt };
    assert.deepEqual(parsers["database-destination"]({ meta }), meta);
  }
  assert.deepEqual(parsers["database-destination"]({ meta: { description, lastRun: null } }), { description, lastRun: null });
  invalid("database-destination", { description, lastRun: null, savedAt: 42 });
});
for (const [label, value] of [
  ["missing", undefined], ["null", null], ["missing field", { host: "db", port: "5432", database: "content" }],
  ["null field", { ...description, user: null }], ["extra field", { ...description, password: "forbidden" }],
] as const) test(`database description rejects ${label}`, () => {
  invalid("database-destination", { ...(value === undefined ? {} : { description: value }), lastRun: null });
});
for (const [label, run] of [
  ["absent", undefined], ["missing time", { copied: true, tableCount: 1, rowCount: 1 }],
  ["invalid copied flag", { copied: null, snapshotAt }],
  ["extra success field", { copied: true, snapshotAt, tableCount: 1, rowCount: 1, extra: true }],
  ["extra failure field", { copied: false, snapshotAt, code: "FAIL", message: "Failed", extra: true }],
  ["missing code", { copied: false, snapshotAt, message: "Failed" }],
  ["missing message", { copied: false, snapshotAt, code: "FAIL" }],
] as const) test(`database last run rejects ${label}`, () => {
  invalid("database-destination", { description, ...(run === undefined ? {} : { lastRun: run }) });
});
for (const field of ["tableCount", "rowCount"]) for (const value of [null, 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
  test(`successful run rejects ${field}=${value}`, () => invalid("database-destination", { description, lastRun: { copied: true, snapshotAt, tableCount: 1, rowCount: 1, [field]: value } }));
}

test("store metadata parsing retains safe nullable fields and binary label order", () => {
  assert.deepEqual(parseTovuStoreMeta({ kind: "site-assistant", meta: { baseUrl: null, model: "safe-model" } }), { baseUrl: null, model: "safe-model" });
  assert.deepEqual(parseTovuStoreMeta({ kind: "personal-execution", meta: { protocol: "openai", maxTokens: 100 } }, {}), { protocol: "openai", maxTokens: 100 });
  assert.deepEqual([{ label: "a" }, { label: "Z" }, { label: "a" }].sort(byVaultLabel), [{ label: "Z" }, { label: "a" }, { label: "a" }]);
  assert.equal(byVaultLabel({ label: "a" }, { label: "a" }), 0);
});

function storeFixture() {
  const repo = new InMemoryVaultRepo({});
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const storageError = () => new Error("safe storage failure");
  const required = { repo: { vault: repo }, kind: "media-provider" as const, keyring, sealer, storageError };
  const scope: VaultContext = { workspaceId: "ws", kind: "media-provider", ownerKey: "tovu", principalId: null, binding: null };
  const input = { ...scope, expectedRevision: null, provider: "test", label: "Media", meta: {} as VaultMeta, payload: { token: "secret" } };
  return { repo, required, scope, input };
}

test("store vault rejects an absent repository and missing generated identity", async () => {
  const f = storeFixture();
  assert.throws(() => createTovuStoreVault({ ...f.required, repo: {} }), { message: "Secrets vault: invalid-record" });
  await assert.rejects(createTovuStoreVault(f.required).put({ ...f.input, payload: null }), { message: "Secrets vault: invalid-record" });
  assert.deepEqual(await f.repo.list(f.scope), []);
});
test("store vault defaults its timestamp to epoch and uses an injected singleton id", async () => {
  const f = storeFixture();
  const service = createTovuStoreVault({ ...f.required, newId: () => "singleton" });
  const result = await service.put(f.input);
  assert.equal(result.id, "singleton");
  assert.equal(result.createdAt, "1970-01-01T00:00:00.000Z");
  assert.deepEqual((await service.get({ ...f.scope, id: result.id }))?.payload, { token: "secret" });
});
test("store vault honors a principal-bound workspace and injected clock", async () => {
  const f = storeFixture();
  const context = { ...f.scope, principalId: "owner" };
  const service = createTovuStoreVault({ ...f.required, context, clock: { nowMs: () => Date.parse(snapshotAt) }, newId: () => "bound" });
  const result = await service.put({ ...f.input, ...context });
  assert.equal(result.createdAt, snapshotAt);
  assert.deepEqual((await service.get({ ...context, id: "bound" }))?.payload, { token: "secret" });
  await assert.rejects(service.get({ ...context, workspaceId: "other", id: "bound" }), { message: "Secrets vault: context" });
});
for (const patch of [{ kind: "vendor" }, { ownerKey: "other" }, { principalId: "other" }, { binding: "endpoint" }] as const) {
  test(`store vault refuses foreign ${Object.keys(patch)[0]} before persistence`, async () => {
    const f = storeFixture();
    await assert.rejects(createTovuStoreVault(f.required).get({ ...f.scope, ...patch, id: "missing" }), { message: "Secrets vault: context" });
    assert.deepEqual(await f.repo.list(f.scope), []);
  });
}
test("store listing accepts an unbound query without a binding property", async () => {
  const f = storeFixture();
  const service = createTovuStoreVault({ ...f.required, context: f.scope }, {});
  await service.put({ ...f.input, id: "media", payload: null });
  assert.deepEqual((await service.list({ workspaceId: "ws", kind: "media-provider", ownerKey: "tovu", principalId: null })).map(row => row.id), ["media"]);
});
test("the store passes the original crypto error to its feature storage-error translator", async () => {
  const f = storeFixture();
  const failure = new Error("key unavailable");
  const service = createTovuStoreVault({ ...f.required, sealer: { seal: async () => { throw failure; }, open: f.required.sealer.open.bind(f.required.sealer) },
    storageError: error => new Error("safe feature failure", { cause: error }) });
  await assert.rejects(service.put({ ...f.input, id: "media" }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "safe feature failure");
    assert.equal(error.cause, failure);
    return true;
  });
  assert.equal(await f.repo.find({ workspaceId: "ws", id: "media" }), null);
});
for (const failure of ["missing-keyring", "active-key", "seal", "open"] as const) {
  test(`store vault translates ${failure} failures without publishing crypto details`, async t => {
    const f = storeFixture();
    const original = createTovuStoreVault(f.required);
    await original.put({ ...f.input, id: "media" });
    const failureError = new Error("private crypto detail");
    if (failure === "active-key") t.mock.method(f.required.keyring, "activeKey", async () => { throw failureError; });
    const required = { ...f.required,
      ...(failure === "missing-keyring" ? { keyring: undefined } : {}),
      sealer: {
        seal: failure === "seal" ? async () => { throw failureError; } : f.required.sealer.seal.bind(f.required.sealer),
        open: failure === "open" ? async () => { throw failureError; } : f.required.sealer.open.bind(f.required.sealer),
      },
    };
    const service = createTovuStoreVault(required);
    await assert.rejects(failure === "open" ? service.get({ ...f.scope, id: "media" }) : service.put({ ...f.input, id: "new" }), { message: "safe storage failure" });
    assert.equal(await f.repo.find({ workspaceId: "ws", id: "new" }), null);
  });
}
