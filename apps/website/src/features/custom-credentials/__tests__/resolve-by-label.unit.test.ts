import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { buildVaultAad, VaultError } from "@jini-ai/platform/secrets/credential-sets";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { InMemoryCustomCredentialSetRepo } from "../repo.memory.js";
import {
  createCustomCredential,
  deleteCustomCredential,
  describeCredential,
  describeCredentialByLabel,
  listCustomCredentials,
  updateCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialNotFoundError,
  CustomCredentialValidationError,
  resolveCustomCredentialByLabel,
  type CustomCredentialWriteDeps,
} from "../store.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { CREDENTIAL_MESSAGES } from "../../../contracts/core/credential-token.js";
import type { CreateCustomCredentialInput } from "../store.js";
import type { CustomCredentialSetRecord } from "../types.js";

/**
 * @file `resolveCustomCredentialByLabel` — the first real decrypting reader for
 * `custom_credential_sets` (added for `server/runtime/boot/resolve-mailer.ts`). Mirrors
 * `vendor-credentials/__tests__/store.unit.test.ts`'s own `resolveForVendor` coverage shape
 * (real `AesGcmSecretSealer` + `InMemoryKeyring`, no plaintext-passthrough sealer double — see
 * that class's own header for why one is deliberately not built).
 */

const WORKSPACE = "ws-1";

/** Same double every sibling credential store's own test file uses for "the site key is
 *  unavailable" — see `vendor-credentials/__tests__/store.unit.test.ts`'s own `BrokenKeyring`. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no Site key: TOVU_SITE_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no Site key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no Site key");
  }
}

function makeWriteDeps(overrides: Partial<CustomCredentialWriteDeps> = {}): CustomCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  return {
    repo: new InMemoryCustomCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: createFakeClock({ startIso: "2026-08-31T00:00:00.000Z" }),
    idGen: (() => {
      let n = 0;
      return { newId: () => `cred-${++n}` };
    })(),
    ...overrides,
  };
}

test("resolveCustomCredentialByLabel returns null when no row has that label (not configured is not an error)", async () => {
  const deps = makeWriteDeps();
  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "Tovu Mail — Resend API" });
  assert.equal(resolved, null);
});

test("label/origin descriptions and lists open no credentials; resolution opens only the selected row", async () => {
  const deps = makeWriteDeps();
  await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "selected", category: "ops",
    baseUrl: "https://api.example.com/v1", additionalHosts: ["https://other.example.com/path"],
    connection: { token: "selected-token-1234", username: "operator" } });
  await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "decoy", category: "general",
    baseUrl: "https://decoy.example.com", connection: { token: "decoy-token-5678" } });
  let opens = 0;
  const open = deps.sealer.open.bind(deps.sealer);
  deps.sealer.open = (input, options) => { opens++; return open(input, options); };
  const described = await describeCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "selected" });
  assert.equal(described?.baseUrl, "https://api.example.com/v1");
  assert.deepEqual(described?.additionalHosts, ["https://other.example.com"]);
  assert.deepEqual(described?.tokenHint, { length: 19, last4: "1234" });
  assert.equal((await listCustomCredentials(deps, { workspaceId: WORKSPACE })).length, 2);
  assert.equal(opens, 0);
  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "selected" });
  assert.deepEqual(resolved?.connection, { token: "selected-token-1234", username: "operator" });
  assert.deepEqual(resolved?.additionalHosts, described?.additionalHosts);
  assert.equal(opens, 1);
});

test("custom labels remain workspace-wide unique on create and rename, with the typed duplicate error", async () => {
  const deps = makeWriteDeps();
  const input = { workspaceId: WORKSPACE, label: "unique", category: "ops", baseUrl: "https://example.com", connection: { token: "long-token-1234" } };
  const first = await createCustomCredential(deps, input);
  await assert.rejects(createCustomCredential(deps, input), CustomCredentialDuplicateLabelError);
  const second = await createCustomCredential(deps, { ...input, label: "second", category: "hosting" });
  await assert.rejects(updateCustomCredential(deps, { workspaceId: WORKSPACE, id: second.id, label: "unique" }), CustomCredentialDuplicateLabelError);
  assert.equal((await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "unique" }))?.id, first.id);
  assert.equal((await listCustomCredentials(deps, { workspaceId: WORKSPACE })).length, 2);
});

test("a metadata-only custom edit preserves its hints/envelope with an unavailable key", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "original", category: "ops",
    baseUrl: "https://example.com", connection: { token: "original-token-1234", username: "operator" } });
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  const broken = { ...deps, keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  const changed = await updateCustomCredential(broken, { workspaceId: WORKSPACE, id: created.id, label: "renamed", username: null, connection: { token: "" } });
  assert.deepEqual(changed.tokenHint, created.tokenHint);
  assert.equal("username" in changed, false);
  assert.deepEqual((await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id }))?.sealed, before?.sealed);
  assert.deepEqual((await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "renamed" }))?.connection, { token: "original-token-1234" });
});

test("short custom tokens never expose a suffix through saved hints", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "short", category: "general",
    baseUrl: "https://example.com", connection: { token: "short" } });
  assert.deepEqual(created.tokenHint, { length: 5, last4: null });
  assert.deepEqual((await describeCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "short" }))?.tokenHint, created.tokenHint);
});

test("a gated custom rotation fails CAS instead of overwriting a newer token and saved origins", async () => {
  const deps = makeWriteDeps();
  const created = await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "raced", category: "general",
    baseUrl: "https://original.example.com", connection: { token: "original-token-1234" } });
  let entered!: () => void;
  let release!: () => void;
  const sealing = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const seal = deps.sealer.seal.bind(deps.sealer);
  const stale = updateCustomCredential({ ...deps, sealer: {
    open: deps.sealer.open.bind(deps.sealer), seal: async input => { entered(); await gate; return seal(input); },
  } }, { workspaceId: WORKSPACE, id: created.id, connection: { token: "stale-token-5678" } });
  const rejected = assert.rejects(stale, VaultError);
  await sealing;
  try {
    await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: created.id,
      connection: { token: "newer-token-9999" }, baseUrl: "https://newer.example.com", additionalHosts: ["https://other.example.com"] });
  } finally { release(); }
  await rejected;
  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "raced" });
  assert.deepEqual(resolved?.connection, { token: "newer-token-9999" });
  assert.equal(resolved?.baseUrl, "https://newer.example.com");
  assert.deepEqual(resolved?.additionalHosts, ["https://other.example.com"]);
});

test("resolveCustomCredentialByLabel finds the row by exact label and decrypts its connection", async () => {
  const deps = makeWriteDeps();
  await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Tovu Mail — Resend API",
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "re_live_abc123" },
  });
  // A decoy row with a different label must not be matched.
  await createCustomCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Some other integration",
    category: "general",
    baseUrl: "https://example.com",
    connection: { token: "unrelated" },
  });

  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "Tovu Mail — Resend API" });
  assert.ok(resolved);
  assert.equal(resolved?.category, "ops");
  assert.equal(resolved?.baseUrl, "https://api.resend.com");
  assert.deepEqual(resolved?.connection, { token: "re_live_abc123" });
});

test("resolveCustomCredentialByLabel is workspace-scoped: a same-labeled row in a different workspace is never returned", async () => {
  const deps = makeWriteDeps();
  await createCustomCredential(deps, {
    workspaceId: "ws-other",
    label: "Tovu Mail — Resend API",
    category: "ops",
    baseUrl: "https://api.resend.com",
    connection: { token: "belongs-to-ws-other" },
  });

  const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "Tovu Mail — Resend API" });
  assert.equal(resolved, null);
});

test("resolveCustomCredentialByLabel throws CustomCredentialSecretStoreUnconfiguredError, never a raw error, when the keyring is broken", async () => {
  const workingDeps = makeWriteDeps();
  await createCustomCredential(workingDeps, {
    workspaceId: WORKSPACE,
    label: "Tovu Mail — SMTP Server",
    category: "ops",
    baseUrl: "https://smtp.example.com:587",
    connection: { token: "app-password", username: "mailer@example.com" },
  });

  const brokenResolveDeps = { repo: workingDeps.repo, sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  await assert.rejects(
    () => resolveCustomCredentialByLabel(brokenResolveDeps, { workspaceId: WORKSPACE, label: "Tovu Mail — SMTP Server" }),
    (err: unknown) => {
      assert.ok(err instanceof CustomCredentialSecretStoreUnconfiguredError);
      assert.equal(
        (err as Error).message,
        "The credential could not be saved or unlocked. Check the site credential store."
      );
      return true;
    }
  );
});

const validCreateInput: CreateCustomCredentialInput = {
  workspaceId: WORKSPACE, label: "validation", category: "general", baseUrl: "https://example.com",
  connection: { token: "fixture-token-1234" },
};
const categoryMessage = "category must be one of: source-control, hosting, media, ai, ops, general";

// Each fixture isolates one rejection; otherwise an earlier guard could mask a broken validator.
const invalidMetadata: { name: string; patch: Partial<CreateCustomCredentialInput>; message: string }[] = [
  { name: "a non-string label", patch: { label: 4 }, message: "label must be a non-empty string" },
  { name: "a whitespace label", patch: { label: " \t " }, message: "label must be a non-empty string" },
  { name: "a label over 200 characters", patch: { label: "x".repeat(201) }, message: "label must be 200 characters or fewer" },
  { name: "a non-string category", patch: { category: null }, message: categoryMessage },
  { name: "credentials in a category", patch: { category: "https://user:private@example.com" }, message: CREDENTIAL_MESSAGES.plain },
  { name: "a non-string base URL", patch: { baseUrl: 4 }, message: "baseUrl must be a non-empty string" },
  { name: "a whitespace base URL", patch: { baseUrl: " " }, message: "baseUrl must be a non-empty string" },
  { name: "a relative base URL", patch: { baseUrl: "/api" }, message: "baseUrl must be a valid absolute URL" },
  { name: "a non-HTTP base URL", patch: { baseUrl: "file:///api" }, message: "baseUrl must use http or https" },
  { name: "a non-array host list", patch: { additionalHosts: null }, message: "additionalHosts must be an array of absolute http/https URLs" },
  { name: "a non-string host entry", patch: { additionalHosts: ["https://valid.example", 4] }, message: "additionalHosts[1] must be a non-empty string" },
  { name: "a whitespace host entry", patch: { additionalHosts: [" "] }, message: "additionalHosts[0] must be a non-empty string" },
  { name: "a relative host entry", patch: { additionalHosts: ["/api"] }, message: "additionalHosts[0] must be a valid absolute URL" },
  { name: "a non-HTTP host entry", patch: { additionalHosts: ["ftp://example.com"] }, message: "additionalHosts[0] must use http or https" },
  { name: "credentials in a host entry", patch: { additionalHosts: ["https://user:private@example.com"] }, message: CREDENTIAL_MESSAGES.plain },
];
for (const { name, patch, message } of invalidMetadata) {
  test(`create rejects ${name} without persisting a credential`, async () => {
    const deps = makeWriteDeps();
    await assert.rejects(createCustomCredential(deps, { ...validCreateInput, ...patch }),
      error => error instanceof CustomCredentialValidationError && error.message === message);
    assert.deepEqual(await listCustomCredentials(deps, { workspaceId: WORKSPACE }), []);
  });
  test(`update rejects ${name} and preserves the saved credential`, async () => {
    const deps = makeWriteDeps();
    const saved = await createCustomCredential(deps, validCreateInput);
    const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: saved.id });
    await assert.rejects(updateCustomCredential(deps, { ...patch, workspaceId: WORKSPACE, id: saved.id }),
      error => error instanceof CustomCredentialValidationError && error.message === message);
    assert.deepEqual(await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }), saved);
    assert.deepEqual((await deps.repo.findById({ workspaceId: WORKSPACE, id: saved.id }))?.sealed, before?.sealed);
  });
}

for (const connection of [null, [], "token", 4]) {
  test(`create rejects a ${JSON.stringify(connection)} connection with a typed shape error`, async () => {
    const deps = makeWriteDeps();
    await assert.rejects(createCustomCredential(deps, { ...validCreateInput, connection }),
      error => error instanceof CustomCredentialValidationError && error.message === "connection must be an object");
    assert.deepEqual(await listCustomCredentials(deps, { workspaceId: WORKSPACE }), []);
  });
  test(`update rejects a ${JSON.stringify(connection)} connection instead of treating it as a blank-token patch`, async () => {
    const deps = makeWriteDeps();
    const saved = await createCustomCredential(deps, validCreateInput);
    await assert.rejects(updateCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id, connection }),
      error => error instanceof CustomCredentialValidationError && error.message === "connection must be an object");
    assert.deepEqual(await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }), saved);
  });
}

for (const username of [null, 4, " "]) {
  test(`create rejects the invalid connection username ${JSON.stringify(username)}`, async () => {
    const deps = makeWriteDeps();
    await assert.rejects(createCustomCredential(deps, { ...validCreateInput, connection: { token: "fixture-token-1234", username } }),
      error => error instanceof CustomCredentialValidationError && error.message === "'username' must be a non-empty string when provided");
    assert.deepEqual(await listCustomCredentials(deps, { workspaceId: WORKSPACE }), []);
  });
}
for (const username of [4, "https://user:private@example.com"]) {
  test(`update rejects the invalid username patch ${JSON.stringify(username)}`, async () => {
    const deps = makeWriteDeps();
    const saved = await createCustomCredential(deps, validCreateInput);
    const message = typeof username === "string" ? CREDENTIAL_MESSAGES.plain : "'username' must be a non-empty string, or null to clear it";
    await assert.rejects(updateCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id, username }),
      error => error instanceof CustomCredentialValidationError && error.message === message);
    assert.deepEqual(await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }), saved);
  });
}
test("create rejects credentials embedded in a connection username", async () => {
  const deps = makeWriteDeps();
  await assert.rejects(createCustomCredential(deps, { ...validCreateInput,
    connection: { token: "fixture-token-1234", username: "https://user:private@example.com" } }),
    error => error instanceof CustomCredentialValidationError && error.message === CREDENTIAL_MESSAGES.plain);
  assert.deepEqual(await listCustomCredentials(deps, { workspaceId: WORKSPACE }), []);
});

test("create accepts a 200-character label and normalizes HTTP host origins without losing ports", async () => {
  const deps = makeWriteDeps();
  const saved = await createCustomCredential(deps, { ...validCreateInput, label: "x".repeat(200),
    baseUrl: "http://example.com:8080/api", additionalHosts: ["http://OTHER.example:8081/a", "http://other.example:8081/b"] });
  assert.equal(saved.label, "x".repeat(200));
  assert.equal(saved.baseUrl, "http://example.com:8080/api");
  assert.deepEqual(saved.additionalHosts, ["http://other.example:8081"]);
  assert.deepEqual(await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }), saved);
});

test("metadata updates replace host lists, change category and base URL, and preserve the token", async () => {
  const deps = makeWriteDeps();
  const saved = await createCustomCredential(deps, { ...validCreateInput, additionalHosts: ["https://old.example"] });
  const changed = await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id,
    category: "hosting", baseUrl: "http://new.example/api", additionalHosts: ["http://extra.example/path"] });
  assert.equal(changed.category, "hosting");
  assert.equal(changed.baseUrl, "http://new.example/api");
  assert.deepEqual(changed.additionalHosts, ["http://extra.example"]);
  await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id, additionalHosts: [] });
  assert.deepEqual(await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: saved.label }), {
    id: saved.id, category: "hosting", baseUrl: "http://new.example/api", additionalHosts: [],
    connection: { token: "fixture-token-1234" },
  });
});

test("describe and delete are scoped by workspace, and deleting an absent credential is idempotent", async () => {
  const deps = makeWriteDeps();
  const saved = await createCustomCredential(deps, validCreateInput);
  assert.equal(await describeCredential(deps, { workspaceId: "other", id: saved.id }), null);
  await deleteCustomCredential(deps, { workspaceId: "other", id: saved.id });
  assert.deepEqual(await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }), saved);
  await deleteCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id });
  await deleteCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id });
  assert.equal(await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }), null);
  assert.equal(await describeCredentialByLabel(deps, { workspaceId: WORKSPACE, label: saved.label }), null);
  assert.deepEqual(await listCustomCredentials(deps, { workspaceId: WORKSPACE }), []);
});

test("updating a missing credential returns the typed not-found error", async () => {
  const deps = makeWriteDeps();
  await assert.rejects(updateCustomCredential(deps, { workspaceId: WORKSPACE, id: "missing" }),
    error => error instanceof CustomCredentialNotFoundError && error.message === "no custom credential 'missing' in this workspace");
});

test("a legacy sealed DTO without token hints can be described without unlocking it", async () => {
  const repo = new InMemoryCustomCredentialSetRepo();
  const deps = makeWriteDeps({ repo });
  const saved = await createCustomCredential(deps, validCreateInput);
  const record = await repo.findById({ workspaceId: WORKSPACE, id: saved.id });
  assert.ok(record);
  // The compatibility DTO has no hint metadata. Reinsert under the same identity so the real
  // ciphertext's AAD remains valid; reads must not invent a hint or require a key.
  await repo.delete({ workspaceId: WORKSPACE, id: saved.id });
  await repo.insert({ ...record });
  const described = await describeCredential({ repo }, { workspaceId: WORKSPACE, id: saved.id });
  assert.deepEqual(described, { ...saved, tokenHint: null });
});

for (const operation of ["insert", "update"] as const) {
  test(`a non-unique ${operation} failure propagates without replacing saved state`, async () => {
    const failure = new Error("credential repository is offline");
    class FailingRepo extends InMemoryCustomCredentialSetRepo {
      fail = false;
      override async insert(record: CustomCredentialSetRecord): Promise<void> {
        if (this.fail && operation === "insert") throw failure;
        await super.insert(record);
      }
      override async update(record: CustomCredentialSetRecord): Promise<void> {
        if (this.fail && operation === "update") throw failure;
        await super.update(record);
      }
    }
    const repo = new FailingRepo();
    const deps = makeWriteDeps({ repo });
    const saved = await createCustomCredential(deps, validCreateInput);
    repo.fail = true;
    const pending = operation === "insert"
      ? createCustomCredential(deps, { ...validCreateInput, label: "second" })
      : updateCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id, label: "renamed" });
    await assert.rejects(pending, error => error === failure);
    assert.deepEqual(await listCustomCredentials(deps, { workspaceId: WORKSPACE }), [saved]);
  });
}

/** One real repository with a controlled write between metadata selection and the vault read. */
class AfterSelectionRepo extends InMemoryCustomCredentialSetRepo {
  afterSelection?: (required: { records: readonly CustomCredentialSetRecord[] }) => Promise<void>;
  override async listByWorkspace(input: { workspaceId: string }): Promise<CustomCredentialSetRecord[]> {
    const records = await super.listByWorkspace(input);
    const write = this.afterSelection;
    this.afterSelection = undefined;
    await write?.({ records });
    return records;
  }
}

test("a credential deleted after label selection resolves to null", async () => {
  const repo = new AfterSelectionRepo();
  const deps = makeWriteDeps({ repo });
  await createCustomCredential(deps, validCreateInput);
  repo.afterSelection = async ({ records }) => { for (const record of records) await repo.delete(record); };
  assert.equal(await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: validCreateInput.label as string }), null);
  assert.deepEqual(await listCustomCredentials(deps, { workspaceId: WORKSPACE }), []);
});

test("resolution pairs a concurrently rotated token with its current origins and username", async () => {
  const repo = new AfterSelectionRepo();
  const deps = makeWriteDeps({ repo });
  const saved = await createCustomCredential(deps, validCreateInput);
  repo.afterSelection = async () => {
    await updateCustomCredential(deps, { workspaceId: WORKSPACE, id: saved.id, category: "ops",
      baseUrl: "http://current.example/api", additionalHosts: ["http://extra.example/path"],
      connection: { token: "current-token-5678", username: "current-user" } });
  };
  assert.deepEqual(await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: saved.label }), {
    id: saved.id, category: "ops", baseUrl: "http://current.example/api", additionalHosts: ["http://extra.example"],
    connection: { token: "current-token-5678", username: "current-user" },
  });
});

test("a payload cleared in the vault after label selection fails closed", async () => {
  const repo = new AfterSelectionRepo();
  const deps = makeWriteDeps({ repo });
  const saved = await createCustomCredential(deps, validCreateInput);
  repo.afterSelection = async ({ records }) => {
    const row = records[0]?.vaultRecord;
    assert.ok(row);
    await repo.vault.put({ record: { ...row, sealed: null, revision: row.revision + 1 }, expectedRevision: row.revision });
  };
  await assert.rejects(resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: saved.label }),
    error => error instanceof CustomCredentialSecretStoreUnconfiguredError && error.message === CREDENTIAL_MESSAGES.storage);
  assert.equal((await repo.vault.find({ workspaceId: WORKSPACE, id: saved.id }))?.sealed, null);
});

for (const payload of [{}, { token: 7 }]) {
  test(`a decrypted payload ${JSON.stringify(payload)} fails closed with the safe storage error`, async () => {
    const repo = new InMemoryCustomCredentialSetRepo();
    const deps = makeWriteDeps({ repo });
    const saved = await createCustomCredential(deps, validCreateInput);
    const record = await repo.findById({ workspaceId: WORKSPACE, id: saved.id });
    assert.ok(record?.vaultRecord);
    const row = record.vaultRecord;
    // Real encryption/AAD and the real vault parser run; only the stored payload is malformed.
    const sealed = await deps.sealer.seal({ plaintext: JSON.stringify(payload), key: await deps.keyring.activeKey(), aad: buildVaultAad(row) });
    await repo.vault.put({ record: { ...row, sealed, revision: row.revision + 1 }, expectedRevision: row.revision });
    await assert.rejects(resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: saved.label }),
      error => error instanceof CustomCredentialSecretStoreUnconfiguredError && error.message === CREDENTIAL_MESSAGES.storage);
  });
}

test("a read adapter returning legacy DTOs without vault context reports unknown hints", async () => {
  class LegacyReadRepo extends InMemoryCustomCredentialSetRepo {
    override async findById(input: { workspaceId: string; id: string }): Promise<CustomCredentialSetRecord | null> {
      const record = await super.findById(input);
      // Legacy adapters expose only the historical enumerable DTO, not private vault metadata.
      return record ? { ...record } : null;
    }
  }
  const deps = makeWriteDeps({ repo: new LegacyReadRepo() });
  const saved = await createCustomCredential(deps, validCreateInput);
  assert.deepEqual(await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }), { ...saved, tokenHint: null });
});
