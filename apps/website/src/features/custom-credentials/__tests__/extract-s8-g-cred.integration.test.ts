import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import { sql } from "kysely";
import { FixedRootKeyKeyring } from "@jini-ai/platform/secrets";
import { buildVaultAad, InMemoryVaultRepo, VaultError, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel, type ContentKernel } from "#src/platform/db/content-kernel";
import { sqliteKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { insertFixture } from "#src/platform/db/migrations/__tests__/secrets-vault.fixture";
import { createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import { HKDF_EXTRACTION_SALT } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import type { KeyringPort, SecretSealerPort } from "#src/features/webhooks/index";
import { attachedOnlyVault } from "#src/features/project-keys/attached-vault";
import { fakeAttachments } from "#src/features/project-keys/__tests__/helpers";
import { SqlCustomCredentialSetRepo } from "../custom-credential-repo.js";
import { CustomCredentialVaultRepo, customVaultRecord, customVaultScope } from "../vault-repo.js";
import {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  CustomCredentialSecretStoreUnconfiguredError,
  CustomCredentialValidationError,
  describeCredential,
  describeCredentialByLabel,
  listCustomCredentialInventory,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  type CustomCredentialWriteDeps,
} from "../store.js";
import type { CustomCredentialProjectScope, CustomCredentialSetRepoPort } from "../types.js";

/**
 * @file EXTRACT-S8 C0 (G-cred): frozen old-data characterization of the custom-credential vault
 * bridge, written on the UNMOVED code before any seam or move. The rows under
 * `fixtures/extract-s8/` were minted ONCE on the pinned code (Tovu c3801c833 / Jini 4044fe3c0)
 * with an obviously synthetic key (bytes 00..1f), a fixed clock and fixed ids:
 * - `cred-vendor-custom`: the unified `vendor` kind with `meta.credentialType = "custom"`, created
 *   through the real `createCustomCredential` path;
 * - `cred-legacy-custom`: the legacy `custom` kind in its post-boot-normalized shape (no
 *   `credentialType`/`worksFor` in stored metadata, no safe hints), sealed by the real
 *   `AesGcmSecretSealer` under `buildVaultAad` over kind `custom`. The store cannot mint this kind
 *   (`prepare` refuses a new `custom` identity), which is exactly why it must be frozen.
 * This suite only READS those files; it never re-mints them. `FROZEN_SHA256` pins their bytes, so
 * the post-move gate rerunning this same file against the moved code is a real old-data replay.
 * Every database here is a fresh head-schema content database with the frozen rows inserted as
 * stored bytes; counts come from wrappers around the production vault and sealer.
 */

const FIXTURE_NAMES = ["expected-open.json", "expected-summaries.json", "stored-rows.json", "synthetic-key.json"] as const;
type FixtureName = (typeof FIXTURE_NAMES)[number];
const FROZEN_SHA256: Record<FixtureName, string> = {
  "expected-open.json": "d39fd19a727e6a53fe056d78d94acc1ca7901695e01f167eb978291485ee74fe",
  "expected-summaries.json": "49ed30a958a5ea747142efe621ccb9d8a38abf71aa660832541e6672cabcd5fc",
  "stored-rows.json": "45f7a3839cb1bdb9cfef586c4bc63994e8f8111f1fdb247f7bf3c3faccaf60a2",
  "synthetic-key.json": "83e9ca08c77be7c3329d09ad598dea5ad23104322aeedbc39ed8e715b0343e5a",
};
const readFixture = (name: FixtureName) => readFileSync(new URL(`./fixtures/extract-s8/${name}`, import.meta.url), "utf8");
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const FROZEN = Object.fromEntries(FIXTURE_NAMES.map(name => [name, readFixture(name)])) as Record<FixtureName, string>;

type Row = Record<string, string | number | null>;
interface Opened { id: string; category: string; baseUrl: string; additionalHosts: string[]; connection: { token: string; username?: string } }
const KEY = JSON.parse(FROZEN["synthetic-key.json"]) as { hex: string; keyId: string; clock: string; workspaceId: string };
const ROWS = JSON.parse(FROZEN["stored-rows.json"]) as Row[];
const OPENED = JSON.parse(FROZEN["expected-open.json"]) as Record<"Legacy custom" | "Vendor bridge", Opened>;
const WS = KEY.workspaceId;
const LEGACY = "cred-legacy-custom";
const VENDOR = "cred-vendor-custom";
const PROJECT_WS = "project-extract-s8";
const LATER = "2026-11-02T00:00:00.000Z";
// Fake secrets built at runtime from obviously synthetic parts, never key-shaped literals.
const synthetic = (name: string) => `synthetic-${name}-token-${"0".repeat(12)}`;
const identity = (id: string, kind: "vendor" | "custom") => ({ workspaceId: WS, id, kind, ownerKey: "tovu", principalId: null, binding: null });
// The frozen-format AAD, restated literally so a changed builder strands this suite, not the rows.
const LITERAL_AAD = (id: string, kind: string) => `secrets-vault:v1:${JSON.stringify([WS, id, kind, "tovu", null, null])}`;

function fixedKeyring(hex = KEY.hex, keyId = KEY.keyId): KeyringPort {
  const root = new FixedRootKeyKeyring({ hex, hkdfSalt: HKDF_EXTRACTION_SALT }, { keyId });
  return { activeKey: () => root.activeKey({}), derive: input => root.derive(input), deriveSigningSecret: input => root.deriveSigningSecret(input) };
}

interface Counts { calls: Record<string, number>; puts: Parameters<VaultRepoPort["put"]>[0][]; opens: number; seals: number; openAads: string[]; sealAads: string[] }
const newCounts = (): Counts => ({ calls: {}, puts: [], opens: 0, seals: 0, openAads: [], sealAads: [] });
const reads = (counts: Counts) => Object.fromEntries(Object.entries(counts.calls).filter(([name]) => !["put", "delete", "patchMeta", "applyBatch"].includes(name)));
const writes = (counts: Counts) => ["put", "delete", "patchMeta", "applyBatch"].reduce((sum, name) => sum + (counts.calls[name] ?? 0), 0);

/** Counts every port call by name; `before` runs ahead of the delegated call (concurrency hooks). */
function counted<T extends object>(target: T, counts: Counts, before: (name: string) => Promise<void> = async () => {}): T {
  return new Proxy(target, { get(object, property, receiver) {
    const value: unknown = Reflect.get(object, property, receiver);
    if (typeof value !== "function" || typeof property !== "string") return value;
    return async (...args: unknown[]) => {
      counts.calls[property] = (counts.calls[property] ?? 0) + 1;
      if (property === "put") counts.puts.push(structuredClone(args[0] as Parameters<VaultRepoPort["put"]>[0]));
      await before(property);
      return Reflect.apply(value, object, args);
    };
  } });
}

function countedSealer(keyring: KeyringPort, counts: Counts): SecretSealerPort {
  const inner = new AesGcmSecretSealer(keyring);
  return {
    seal: input => { counts.seals += 1; counts.sealAads.push(input.aad); return inner.seal(input); },
    open: (input, optional) => { counts.opens += 1; counts.openAads.push(optional?.aad ?? ""); return inner.open(input, optional); },
  };
}

interface Site { kernel: ContentKernel; counts: Counts; vault: VaultRepoPort; deps: CustomCredentialWriteDeps; stored(): Promise<Row[]>; close(): Promise<void> }

/** A fresh head-schema content database holding exactly the frozen rows, read by the production
 * SQL facade (indexed `findByLabel` included) behind counting wrappers. */
async function openSite(optional: { project?: CustomCredentialProjectScope; before?: (name: string) => Promise<void>; keyring?: KeyringPort; ids?: string[] } = {}): Promise<Site> {
  const db = openContentDb(":memory:");
  const kernel = contentKernel(db);
  const fixtureKernel = sqliteKernel<unknown>(db);
  await insertFixture(fixtureKernel, "workspaces", { id: WS, name: WS, slug: WS, created_at: KEY.clock });
  for (const row of ROWS) await insertFixture(fixtureKernel, "secrets_vault", row);
  const counts = newCounts();
  const vault = counted(new SqlCustomCredentialSetRepo(kernel).vault, counts, optional.before);
  const keyring = optional.keyring ?? fixedKeyring();
  const ids = [...(optional.ids ?? [])];
  const deps: CustomCredentialWriteDeps = {
    repo: new CustomCredentialVaultRepo({ vault }, optional.project ? { project: optional.project } : {}),
    sealer: countedSealer(keyring, counts), keyring, clock: { nowMs: () => Date.parse(LATER) },
    idGen: { newId: () => ids.shift() ?? assert.fail("unexpected id request") },
  };
  return { kernel, counts, vault, deps,
    stored: () => kernel.query<Row>(sql`SELECT * FROM secrets_vault ORDER BY workspace_id, id`),
    close: () => kernel.close() };
}

async function withSite(optional: Parameters<typeof openSite>[0], body: (site: Site) => Promise<void>): Promise<void> {
  const site = await openSite(optional);
  try { await body(site); } finally { await site.close(); }
}

const isCanonical = (code: string) => (error: unknown) => {
  assert.ok(error instanceof VaultError, `expected the canonical VaultError, got ${String(error)}`);
  assert.equal(error.constructor, VaultError);
  assert.equal(error.code, code);
  return true;
};

/** A separate project store with its own synthetic key: an owner repo plus the site's granted view. */
function projectStore(siteId: string) {
  const counts = newCounts();
  const raw = new InMemoryVaultRepo({});
  const keyring = fixedKeyring("1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100", "extract-s8-project");
  const sealer = countedSealer(keyring, counts);
  const attachments = fakeAttachments();
  const owner = new CustomCredentialVaultRepo({ vault: raw });
  const view = new CustomCredentialVaultRepo({ vault: attachedOnlyVault({ vault: raw, siteId, attachments }) });
  const scope = (extra: Partial<CustomCredentialProjectScope> = {}): CustomCredentialProjectScope =>
    ({ workspaceId: PROJECT_WS, repo: view, sealer, keyring, ...extra });
  let next = 0;
  const ownerDeps: CustomCredentialWriteDeps = { repo: owner, sealer, keyring, clock: { nowMs: () => Date.parse(LATER) }, idGen: { newId: () => `project-key-${++next}` } };
  return { counts, raw, attachments, owner, scope, ownerDeps };
}

const saveProject = (deps: CustomCredentialWriteDeps, label: string, token: string) =>
  createCustomCredential(deps, { workspaceId: PROJECT_WS, label, category: "ai", baseUrl: "https://project.example.test", connection: { token } });

test("frozen fixtures: bytes match the C0 hashes and seed exactly the frozen stored rows", async () => {
  for (const name of FIXTURE_NAMES) assert.equal(sha256(FROZEN[name]), FROZEN_SHA256[name], name);
  await withSite({}, async site => {
    const stored = await site.stored();
    assert.deepEqual(stored, ROWS);
    assert.equal(`${JSON.stringify(stored, null, 2)}\n`, FROZEN["stored-rows.json"]);
    assert.deepEqual(stored.map(row => [row.id, row.kind, JSON.parse(String(row.meta)).credentialType ?? null]),
      [[LEGACY, "custom", null], [VENDOR, "vendor", "custom"]]);
  });
});

test("exact workspace/owner=tovu/AAD/null principal-binding-provider context opens both kinds without rewriting the stored row", async () => {
  await withSite({}, async site => {
    for (const [id, kind, label] of [[LEGACY, "custom", "Legacy custom"], [VENDOR, "vendor", "Vendor bridge"]] as const) {
      const scope = customVaultScope({ workspaceId: WS, id, kind });
      assert.deepEqual(scope, identity(id, kind));
      assert.equal(buildVaultAad(scope), LITERAL_AAD(id, kind));
      const service = createTovuStoreVault({ repo: site.deps.repo, kind, sealer: site.deps.sealer, storageError: () => new Error("storage") });
      const opened = await service.get(scope);
      assert.equal(opened?.payload?.token, OPENED[label].connection.token);
      assert.equal(opened?.summary.provider, null);
      assert.equal(site.counts.openAads.at(-1), LITERAL_AAD(id, kind));
      assert.deepEqual(await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label }), OPENED[label]);
      assert.equal(site.counts.openAads.at(-1), LITERAL_AAD(id, kind));
    }
    assert.equal(site.counts.opens, 4);
    assert.equal(writes(site.counts), 0);
    assert.equal(site.counts.seals, 0);
    assert.deepEqual(await site.stored(), ROWS);
  });
});

test("wrong context, wrong kind AAD and foreign ownership fail with the canonical VaultError (same class/code)", async () => {
  await withSite({}, async site => {
    const vendorService = createTovuStoreVault({ repo: site.deps.repo, kind: "vendor", sealer: site.deps.sealer, storageError: () => new Error("storage") });
    const customService = createTovuStoreVault({ repo: site.deps.repo, kind: "custom", sealer: site.deps.sealer, storageError: () => new Error("storage") });
    for (const wrong of [{ ownerKey: "foreign" }, { principalId: "person" }, { binding: "https://bound.example.test" }]) {
      await assert.rejects(vendorService.get({ ...identity(VENDOR, "vendor"), ...wrong }), isCanonical("context"));
      await assert.rejects(customService.get({ ...identity(LEGACY, "custom"), ...wrong }), isCanonical("context"));
    }
    // The stored kind authenticates the envelope: a kind-rewritten identity never reaches the sealer.
    await assert.rejects(vendorService.get(identity(LEGACY, "vendor")), isCanonical("context"));
    await assert.rejects(customService.get(identity(VENDOR, "custom")), isCanonical("context"));
    await assert.rejects(customService.get(identity(LEGACY, "vendor")), isCanonical("context"));
    const record = (await site.deps.repo.findById({ workspaceId: WS, id: LEGACY }))!;
    for (const wrong of [{ ownerKey: "foreign" }, { principalId: "person" }, { binding: "bound" }, { provider: "provider" }, { kind: "source-control" }]) {
      assert.throws(() => customVaultRecord({ row: { ...record.vaultRecord!, ...wrong } }), isCanonical("context"));
    }
    assert.equal(site.counts.opens, 0);
    // A frozen envelope opened under another identity's AAD fails authentication outright.
    const [legacyRow] = ROWS;
    const sealed = { keyId: String(legacyRow!.sealed_key_id), ciphertext: String(legacyRow!.sealed_ciphertext), nonce: String(legacyRow!.sealed_nonce), alg: "aes-256-gcm" as const };
    await assert.rejects(new AesGcmSecretSealer(fixedKeyring()).open({ sealed }, { aad: LITERAL_AAD(LEGACY, "vendor") }));
    assert.equal(JSON.parse(await new AesGcmSecretSealer(fixedKeyring()).open({ sealed }, { aad: LITERAL_AAD(LEGACY, "custom") })).token, OPENED["Legacy custom"].connection.token);
    assert.deepEqual(await site.stored(), ROWS);
  });
  await withSite({ keyring: fixedKeyring("ff".repeat(32), KEY.keyId) }, async site => {
    await assert.rejects(resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Vendor bridge" }), CustomCredentialSecretStoreUnconfiguredError);
    assert.deepEqual(await site.stored(), ROWS);
  });
});

test("summary bytes omit token/sealed/private context; username absent or clear, hints, meta, scope and timestamps exact", async () => {
  await withSite({}, async site => {
    const summaries = {
      list: await listCustomCredentials(site.deps, { workspaceId: WS }),
      describe: { [LEGACY]: await describeCredential(site.deps, { workspaceId: WS, id: LEGACY }), [VENDOR]: await describeCredential(site.deps, { workspaceId: WS, id: VENDOR }) },
    };
    const bytes = `${JSON.stringify(summaries, null, 2)}\n`;
    assert.equal(bytes, FROZEN["expected-summaries.json"]);
    assert.deepEqual(await listCustomCredentialInventory({ deps: site.deps, workspaceId: WS }), summaries.list);
    assert.deepEqual(await describeCredentialByLabel(site.deps, { workspaceId: WS, label: "Legacy custom" }), summaries.describe[LEGACY]);
    for (const row of ROWS) {
      for (const secret of [row.sealed_ciphertext, row.sealed_nonce, row.sealed_key_id]) assert.equal(bytes.includes(String(secret)), false);
    }
    for (const token of Object.values(OPENED).map(item => item.connection.token)) assert.equal(bytes.includes(token), false);
    const allowedKeys = ["credentialType", "worksFor", "id", "label", "category", "baseUrl", "additionalHosts", "username", "configured", "tokenHint", "scope", "createdAt", "updatedAt"];
    for (const summary of [...summaries.list, ...Object.values(summaries.describe)]) {
      assert.deepEqual(Reflect.ownKeys(summary!).filter(key => !allowedKeys.includes(String(key))), []);
    }
    const legacy = summaries.describe[LEGACY]!;
    assert.equal(Object.hasOwn(legacy, "username"), false);
    assert.equal(Object.hasOwn(legacy, "scope"), false);
    assert.equal(legacy.tokenHint, null);
    assert.deepEqual(summaries.describe[VENDOR]!.tokenHint, { length: 35, last4: "0001" });
    assert.equal(site.counts.opens, 0);
  });
  const project = projectStore(WS);
  await withSite({ project: project.scope() }, async site => {
    const scoped = await listCustomCredentials(site.deps, { workspaceId: WS });
    const unscoped = (JSON.parse(FROZEN["expected-summaries.json"]) as { list: object[] }).list;
    assert.deepEqual(scoped, unscoped.map(summary => ({ ...summary, scope: "site" })));
    assert.equal(site.counts.opens + project.counts.opens, 0);
  });
});

test("vaultRecord/vaultExpectedRevision are non-enumerable yet carry the exact CAS revision", async () => {
  await withSite({}, async site => {
    const record = (await site.deps.repo.findById({ workspaceId: WS, id: VENDOR }))!;
    for (const name of ["vaultRecord", "vaultExpectedRevision"]) {
      assert.equal(Object.keys(record).includes(name), false);
      assert.equal(JSON.stringify(record).includes(name), false);
    }
    assert.equal(Object.getOwnPropertyDescriptor(record, "vaultRecord")?.enumerable, false);
    assert.equal(record.vaultRecord?.revision, 1);
    assert.equal(Object.hasOwn(record, "vaultExpectedRevision"), false);
    const prepared = customVaultRecord({ row: record.vaultRecord!, expectedRevision: 1 });
    assert.equal(Object.getOwnPropertyDescriptor(prepared, "vaultExpectedRevision")?.enumerable, false);
    assert.equal(prepared.vaultExpectedRevision, 1);
    const updated = await updateCustomCredential(site.deps, { workspaceId: WS, id: VENDOR, label: "Vendor renamed" });
    assert.equal(updated.label, "Vendor renamed");
    assert.equal(site.counts.puts.length, 1);
    assert.equal(site.counts.puts[0]!.expectedRevision, 1);
    assert.equal(site.counts.puts[0]!.record.revision, 2);
    const after = await site.stored();
    assert.equal(after.find(row => row.id === VENDOR)!.revision, 2);
    // A spread copy drops the private context: the compatibility path re-reads the CURRENT revision.
    const current = (await site.deps.repo.findById({ workspaceId: WS, id: VENDOR }))!;
    const before = site.counts.calls.find ?? 0;
    await site.deps.repo.update({ ...current, updatedAt: LATER });
    assert.equal(site.counts.calls.find, before + 1);
    assert.equal(site.counts.puts[1]!.expectedRevision, 2);
    assert.equal(site.counts.puts[1]!.record.revision, 3);
    // A stale private revision is refused by the vault CAS and overwrites nothing.
    const settled = await site.stored();
    await assert.rejects(site.deps.repo.update(prepared), isCanonical("conflict"));
    assert.deepEqual(await site.stored(), settled);
  });
});

test("metadata list/describe perform 0 opens; resolve opens only the selected authorized row with SAME-read origins/username", async () => {
  let concurrent: (() => Promise<void>) | undefined;
  await withSite({ before: async name => {
    if (name !== "find" || !concurrent) return;
    const run = concurrent;
    concurrent = undefined;
    await run();
  } }, async site => {
    await listCustomCredentials(site.deps, { workspaceId: WS });
    assert.deepEqual(reads(site.counts), { list: 2 });
    await describeCredential(site.deps, { workspaceId: WS, id: VENDOR });
    await describeCredentialByLabel(site.deps, { workspaceId: WS, label: "Vendor bridge" });
    await listCustomCredentialInventory({ deps: site.deps, workspaceId: WS });
    assert.deepEqual(reads(site.counts), { list: 4, find: 1, findByLabel: 1 });
    assert.equal(site.counts.opens, 0);
    site.counts.calls = {};
    assert.deepEqual(await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Vendor bridge" }), OPENED["Vendor bridge"]);
    assert.deepEqual(reads(site.counts), { findByLabel: 1, find: 1 });
    assert.deepEqual(site.counts.openAads, [LITERAL_AAD(VENDOR, "vendor")]);
    assert.equal(await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Missing" }), null);
    assert.equal(site.counts.opens, 1);
    // A concurrent metadata update lands between label selection and the open: the result pairs
    // the token with the metadata of the read that produced it, never the earlier selection.
    const writer = (await openSiteDepsOver(site)).deps;
    concurrent = async () => { await updateCustomCredential(writer, { workspaceId: WS, id: VENDOR, additionalHosts: ["https://moved.example.test/x"], username: null }); };
    const resolved = await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Vendor bridge" });
    assert.equal(concurrent, undefined);
    assert.deepEqual(resolved, { ...OPENED["Vendor bridge"], additionalHosts: ["https://moved.example.test"], connection: { token: OPENED["Vendor bridge"].connection.token } });
    assert.equal(site.counts.opens, 2);
  });
});

/** A second, uninstrumented writer over the same database (concurrency hooks only). */
async function openSiteDepsOver(site: Site): Promise<{ deps: CustomCredentialWriteDeps }> {
  const keyring = fixedKeyring();
  return { deps: { repo: new SqlCustomCredentialSetRepo(site.kernel), sealer: new AesGcmSecretSealer(keyring), keyring,
    clock: { nowMs: () => Date.parse(LATER) }, idGen: { newId: () => assert.fail("unexpected id request") } } };
}

test("site precedence then granted project fallback; revoked and unattached project rows stay inaccessible", async () => {
  const project = projectStore(WS);
  const shadow = await saveProject(project.ownerDeps, "Vendor bridge", synthetic("project-shadow"));
  const granted = await saveProject(project.ownerDeps, "Project only", synthetic("project-only"));
  const hidden = await saveProject(project.ownerDeps, "Never granted", synthetic("never-granted"));
  for (const keyId of [shadow.id, granted.id]) await project.attachments.attach({ siteId: WS, siteName: "Site", keyId });
  project.counts.opens = 0;
  project.counts.openAads = [];
  await withSite({ project: project.scope() }, async site => {
    assert.deepEqual(await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Vendor bridge" }), OPENED["Vendor bridge"]);
    assert.equal(project.counts.opens, 0);
    assert.equal((await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Project only" }))?.connection.token, synthetic("project-only"));
    assert.equal(project.counts.opens, 1);
    assert.deepEqual(project.counts.openAads, [`secrets-vault:v1:${JSON.stringify([PROJECT_WS, granted.id, "vendor", "tovu", null, null])}`]);
    assert.deepEqual((await listCustomCredentials(site.deps, { workspaceId: WS })).map(row => [row.label, row.scope, row.id]),
      [["Legacy custom", "site", LEGACY], ["Project only", "project", granted.id], ["Vendor bridge", "site", VENDOR]]);
    const opensBefore = site.counts.opens + project.counts.opens;
    assert.equal(await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Never granted" }), null);
    assert.equal(await describeCredential(site.deps, { workspaceId: WS, id: hidden.id }), null);
    await project.attachments.detach({ siteId: WS, keyId: granted.id });
    assert.equal(await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Project only" }), null);
    assert.equal(await describeCredentialByLabel(site.deps, { workspaceId: WS, label: "Project only" }), null);
    assert.deepEqual((await listCustomCredentials(site.deps, { workspaceId: WS })).map(row => row.label), ["Legacy custom", "Vendor bridge"]);
    assert.equal(site.counts.opens + project.counts.opens, opensBefore);
    assert.equal(writes(site.counts), 0);
    assert.deepEqual(await site.stored(), ROWS);
  });
});

test("trusted owner create/replace is unchanged: project create, read-only grant, trusted replacement only", async () => {
  const project = projectStore(WS);
  await withSite({ project: project.scope({ createRepo: project.owner, replaceRepo: project.owner }), ids: ["owner-made"] }, async site => {
    const created = await createCustomCredential(site.deps, { workspaceId: WS, label: "Owner made", category: "ops",
      baseUrl: "https://owner.example.test", connection: { token: synthetic("owner-first") } });
    assert.equal(created.scope, "project");
    assert.equal(created.id, "owner-made");
    assert.deepEqual(await site.stored(), ROWS);
    assert.equal((await project.owner.findById({ workspaceId: PROJECT_WS, id: "owner-made" }))?.label, "Owner made");
    assert.equal(await describeCredential(site.deps, { workspaceId: WS, id: "owner-made" }), null);
    await project.attachments.attach({ siteId: WS, siteName: "Site", keyId: "owner-made" });
    const ownerRow = await project.raw.find({ workspaceId: PROJECT_WS, id: "owner-made" });
    await assert.rejects(updateCustomCredential(site.deps, { workspaceId: WS, id: "owner-made", connection: { token: synthetic("denied") } }),
      (error: unknown) => error instanceof CustomCredentialValidationError && error.message === "Change this saved key in Shared Keys, or open its secure key card in the owner session. Details: P25_OWNER_KEY_READ_ONLY.");
    assert.deepEqual(await project.raw.find({ workspaceId: PROJECT_WS, id: "owner-made" }), ownerRow);
    const seals = project.counts.seals;
    const replaced = await updateCustomCredential({ ...site.deps, allowSharedKeyReplacement: true }, { workspaceId: WS, id: "owner-made", connection: { token: synthetic("owner-second") } });
    assert.equal(replaced.scope, "project");
    assert.equal(project.counts.seals, seals + 1);
    assert.equal((await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Owner made" }))?.connection.token, synthetic("owner-second"));
    assert.equal((await project.raw.find({ workspaceId: PROJECT_WS, id: "owner-made" }))?.revision, ownerRow!.revision + 1);
    assert.deepEqual(await site.stored(), ROWS);
  });
});

test("CAS writes keep each row's compatibility kind, envelope and safe hints on both kinds", async () => {
  await withSite({}, async site => {
    const before = await site.stored();
    await updateCustomCredential(site.deps, { workspaceId: WS, id: LEGACY, label: "Legacy renamed" });
    await updateCustomCredential(site.deps, { workspaceId: WS, id: VENDOR, username: null, additionalHosts: ["https://second.example.test/y"] });
    assert.deepEqual(site.counts.puts.map(put => [put.record.id, put.record.kind, put.expectedRevision, put.record.revision]),
      [[LEGACY, "custom", 2, 3], [VENDOR, "vendor", 1, 2]]);
    assert.equal(site.counts.seals, 0);
    assert.equal(site.counts.opens, 0);
    const after = await site.stored();
    const envelope = ["kind", "sealed_key_id", "sealed_ciphertext", "sealed_nonce", "sealed_alg", "last4", "token_length", "is_default", "created_at"];
    for (const [index, row] of after.entries()) {
      for (const column of envelope) assert.equal(row[column], before[index]![column], `${String(row.id)}.${column}`);
      assert.equal(row.updated_at, LATER);
    }
    const legacyMeta = JSON.parse(String(after[0]!.meta)) as Record<string, unknown>;
    assert.deepEqual(legacyMeta, { category: "general", baseUrl: "https://legacy.example.test", additionalHosts: ["https://legacy-files.example.test"],
      username: null, credentialType: "custom", worksFor: [] });
    assert.equal(after[0]!.label, "Legacy renamed");
    const vendorMeta = JSON.parse(String(after[1]!.meta)) as Record<string, unknown>;
    assert.deepEqual(vendorMeta, { credentialType: "custom", worksFor: ["example-provider"], category: "hosting", baseUrl: "https://api.example.test/v1",
      additionalHosts: ["https://second.example.test"], username: null });
    const cleared = (await describeCredential(site.deps, { workspaceId: WS, id: VENDOR }))!;
    assert.equal(Object.hasOwn(cleared, "username"), false);
    assert.deepEqual(cleared.tokenHint, { length: 35, last4: "0001" });
    // Compatibility DTO writes (hidden context dropped) keep kind and the identical envelope's hints.
    for (const id of [LEGACY, VENDOR]) {
      const current = (await site.deps.repo.findById({ workspaceId: WS, id }))!;
      await site.deps.repo.update({ ...current, updatedAt: LATER });
    }
    const compat = await site.stored();
    for (const [index, row] of compat.entries()) {
      for (const column of envelope) assert.equal(row[column], before[index]![column], `${String(row.id)}.${column}`);
    }
    assert.deepEqual(compat.map(row => row.revision), [4, 3]);
    // Rotation reseals under the row's OWN stored kind (the legacy kind is never rewritten).
    await updateCustomCredential(site.deps, { workspaceId: WS, id: LEGACY, connection: { token: synthetic("legacy-rotated") } });
    assert.deepEqual(site.counts.sealAads, [LITERAL_AAD(LEGACY, "custom")]);
    const rotated = (await site.stored())[0]!;
    assert.equal(rotated.kind, "custom");
    assert.notEqual(rotated.sealed_ciphertext, before[0]!.sealed_ciphertext);
    assert.equal(rotated.last4, "0000");
    assert.equal((await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Legacy renamed" }))?.connection.token, synthetic("legacy-rotated"));
  });
});

test("duplicate, stale and failed-transaction writes overwrite nothing and roll back for real", async () => {
  await withSite({ ids: ["duplicate-id"] }, async site => {
    await assert.rejects(createCustomCredential(site.deps, { workspaceId: WS, label: "Vendor bridge", category: "general", baseUrl: "https://dup.example.test", connection: { token: synthetic("dup") } }),
      (error: unknown) => error instanceof CustomCredentialDuplicateLabelError && error.message === "a custom credential labeled 'Vendor bridge' already exists in this workspace");
    assert.deepEqual(await site.stored(), ROWS);
    // Host transaction: the update is visible inside, then the failure rolls the vault row back.
    let inside: Row[] = [];
    await assert.rejects(site.kernel.transaction(async () => {
      await updateCustomCredential(site.deps, { workspaceId: WS, id: LEGACY, label: "Inside transaction", connection: { token: synthetic("rolled-back") } });
      inside = await site.stored();
      throw new Error("host transaction failed after the vault write");
    }), /host transaction failed/);
    assert.equal(inside.find(row => row.id === LEGACY)?.label, "Inside transaction");
    assert.deepEqual(await site.stored(), ROWS);
    assert.deepEqual(await resolveCustomCredentialByLabel(site.deps, { workspaceId: WS, label: "Legacy custom" }), OPENED["Legacy custom"]);
  });
  let concurrent: (() => Promise<void>) | undefined;
  await withSite({ before: async name => {
    if (name !== "put" || !concurrent) return;
    const run = concurrent;
    concurrent = undefined;
    await run();
  } }, async site => {
    // A concurrent writer commits between this update's read and its CAS write: stale is refused.
    const writer = (await openSiteDepsOver(site)).deps;
    concurrent = async () => { await updateCustomCredential(writer, { workspaceId: WS, id: VENDOR, label: "Concurrent winner" }); };
    await assert.rejects(updateCustomCredential(site.deps, { workspaceId: WS, id: VENDOR, label: "Stale loser" }), isCanonical("conflict"));
    const after = await site.stored();
    assert.equal(after[1]!.label, "Concurrent winner");
    assert.equal(after[1]!.revision, 2);
    assert.deepEqual(after[0], ROWS[0]);
  });
});

test("old reader accepts new operations' stored rows (C0: old==new; the post-move gate replays them)", async () => {
  await withSite({ ids: ["created-later"] }, async site => {
    await createCustomCredential(site.deps, { workspaceId: WS, label: "Created later", category: "media", baseUrl: "https://created.example.test",
      additionalHosts: ["https://cdn.example.test/a"], worksFor: ["Example-Provider"], connection: { token: synthetic("created"), username: "created-login" }, scope: "site" });
    await updateCustomCredential(site.deps, { workspaceId: WS, id: LEGACY, label: "Legacy updated", connection: { token: synthetic("legacy-new") } });
    await updateCustomCredential(site.deps, { workspaceId: WS, id: VENDOR, username: "vendor-login" });
    const written = await site.stored();
    assert.deepEqual(written.map(row => [row.id, row.kind]), [["created-later", "vendor"], [LEGACY, "custom"], [VENDOR, "vendor"]]);
    // A reader constructed from scratch over the stored bytes only: fresh facade, fresh sealer.
    const reader: { repo: CustomCredentialSetRepoPort; sealer: SecretSealerPort } = { repo: new SqlCustomCredentialSetRepo(site.kernel), sealer: new AesGcmSecretSealer(fixedKeyring()) };
    const expected = {
      "Created later": { id: "created-later", category: "media", baseUrl: "https://created.example.test", additionalHosts: ["https://cdn.example.test"], connection: { token: synthetic("created"), username: "created-login" } },
      "Legacy updated": { ...OPENED["Legacy custom"], connection: { token: synthetic("legacy-new") } },
      "Vendor bridge": { ...OPENED["Vendor bridge"], connection: { token: OPENED["Vendor bridge"].connection.token, username: "vendor-login" } },
    };
    for (const [label, value] of Object.entries(expected)) assert.deepEqual(await resolveCustomCredentialByLabel(reader, { workspaceId: WS, label }), value, label);
    assert.deepEqual((await listCustomCredentials(reader, { workspaceId: WS })).map(row => [row.label, row.username ?? null, row.tokenHint]),
      [["Created later", "created-login", { length: synthetic("created").length, last4: "0000" }], ["Legacy updated", null, { length: synthetic("legacy-new").length, last4: "0000" }],
        ["Vendor bridge", "vendor-login", { length: 35, last4: "0001" }]]);
    // Optional replay hand-off: the stored bytes written here, for an isolated pinned old reader.
    const replayDir = process.env.EXTRACT_S8_G_CRED_REPLAY_DIR;
    if (replayDir) {
      mkdirSync(replayDir, { recursive: true });
      writeFileSync(`${replayDir}/new-operations-rows.json`, `${JSON.stringify({ rows: written, expected }, null, 2)}\n`);
    }
  });
});

test.after(() => {
  for (const name of FIXTURE_NAMES) assert.equal(sha256(readFixture(name)), FROZEN_SHA256[name], `${name} changed during the suite`);
});
