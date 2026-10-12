import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { SecretsVaultService, buildVaultAad, VAULT_KINDS, type VaultKind, type VaultMeta } from "@jini-ai/platform/secrets/credential-sets";
import { acquireOperationLock, releaseOperationLock, isOperationInFlight } from "#src/contracts/core/operation-lock";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { vaultFixture, vaultStep, stamp } from "#src/platform/db/migrations/__tests__/secrets-vault.fixture";
import { createTovuVaultKinds, type TovuVaultPolicy } from "../vault-kinds.js";
import { normalizeVaultAtBoot, normalizeSiteVaultAtBoot, type VaultBootInput } from "../vault-boot.js";
import { legacyVaultAad, buildPublishContentPeerAad, type VaultLegacyContext } from "../vault-legacy-codecs.js";

/** S2: real GCM + SQLite/PGlite integration; ordinary Jini reads prove new AAD, not a legacy
 * fallback. Failure cases retain the original envelope and never report green coverage.
 */
const clock = { nowMs: () => Date.parse(stamp) + 1000 };
const policy: TovuVaultPolicy = {
  validateMeta: ({ meta }) => meta,
  legacyPublishCredential: ({ providerId }) => providerId === "legacy-host" ? { vendorId: "vendor-test", tokenField: "token" } : undefined,
  tokenField: ({ kind }) => ["vendor", "source-control", "custom"].includes(kind) ? "token" : undefined,
};
const registry = createTovuVaultKinds({ policy });
async function prepared(dialect: "sqlite" | "pglite") {
  const fixture = await vaultFixture(dialect);
  await fixture.kernel.transaction(() => vaultStep.up(fixture.kernel, { note: () => {} }));
  const input: VaultBootInput = { ...fixture, workspaceId: "ws", siteId: `vault-boot-${dialect}`, clock, registry };
  const repo = new SqlSecretsVaultRepo({ kernel: fixture.kernel as StorageKernel<SecretsVaultDatabase> });
  return { ...fixture, input, repo };
}

for (const dialect of ["sqlite", "pglite"] as const) {
  test(`${dialect}: legacy rows re-seal, compare, and reopen through Jini's ordinary service; second boot is idempotent`, async () => {
    const { kernel, envelopes, input, repo, keyring, sealer } = await prepared(dialect);
    try {
      const original = await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id='ws' ORDER BY id`);
      const reports: unknown[] = [];
      const report = await normalizeVaultAtBoot(input, { report: report => reports.push(report) });
      assert.equal(report.green, true);
      assert.deepEqual(report.flagged, []);
      assert.deepEqual(reports, [report]);
      assert.equal(isOperationInFlight({ siteId: input.siteId }), false);
      assert.equal(Object.values(report.kinds).reduce((n, kind) => n + kind.rows, 0), 12);
      assert.equal(Object.values(report.kinds).reduce((n, kind) => n + kind.envelopes, 0), 11);
      assert.equal(Object.values(report.kinds).reduce((n, kind) => n + kind.succeeded, 0), 12);
      const service = new SecretsVaultService({ repo, keyring, sealer, metaParsers: registry.metaParsers,
        authorize: async () => {}, now: () => stamp, newId: () => "unused" });
      const identities = await kernel.query<{ id: string }>(sql`SELECT id FROM secrets_vault WHERE workspace_id='ws'`);
      const plaintexts = new Map<string, VaultMeta | null>();
      for (const { id } of identities) {
        const record = (await repo.find({ workspaceId: "ws", id }))!;
        assert.equal(record.meta.legacyAad, undefined);
        assert.equal(record.meta.normalization, undefined);
        assert.equal(record.revision, 2);
        assert.equal(record.updatedAt, new Date(clock.nowMs()).toISOString());
        const opened = await service.get(record);
        assert.ok(opened);
        plaintexts.set(record.kind === "vendor" ? String((record.meta.migration as VaultMeta).table) : record.kind, opened.payload);
        if (record.sealed) {
          const legacy = record.meta.migration as unknown as VaultLegacyContext;
          const fixture = envelopes.find(entry => entry.table === legacy.table && entry.kind === record.kind)!;
          assert.notEqual(record.sealed.ciphertext, fixture.sealed.ciphertext);
          assert.notEqual(record.sealed.nonce, fixture.sealed.nonce);
          assert.ok(await sealer.open({ sealed: record.sealed }, { aad: buildVaultAad(record) }));
          await assert.rejects(sealer.open({ sealed: record.sealed }, { aad: legacyVaultAad({ record, legacy: { ...legacy,
            provider: record.kind === "vendor" && legacy.table === "publish_credential_sets" ? legacy.provider : record.provider } }) }));
        }
      }
      assert.deepEqual(plaintexts.get("site-assistant"), { apiKey: "long-token-1234567890" });
      assert.deepEqual(plaintexts.get("personal-execution"), { apiKey: "personal-long-token" });
      assert.deepEqual(plaintexts.get("media-provider"), { apiKey: "short" });
      assert.deepEqual(plaintexts.get("custom"), { token: "long-token-1234567890" });
      assert.deepEqual(plaintexts.get("database-destination"), { connectionString: "postgres://writer:password@db.example.test/content" });
      assert.deepEqual(plaintexts.get("vendor_credential_sets"), { vendorId: "vendor-test", token: "long-token-1234567890" });
      assert.deepEqual(plaintexts.get("publish_credential_sets"), { vendorId: "vendor-test", token: "different-legacy-token" });
      assert.deepEqual(plaintexts.get("source-control"), { providerId: "source-test", token: "long-token-1234567890", username: "paired" });
      assert.deepEqual(plaintexts.get("mcp-env"), { NAME: "env-value" });
      assert.deepEqual(plaintexts.get("mcp-auth"), { schemaVersion: 1, clientSecret: "client-secret", tokens: { accessToken: "access-token" } });
      const custom = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      assert.equal(custom.meta.username, null, "an intentionally cleared username must not resurrect from old ciphertext");
      const media = (await repo.find({ workspaceId: "ws", id: 'vault:["media-provider","media-test"]' }))!;
      assert.equal(media.tokenLength, 5);
      assert.equal(media.last4, null);
      const vendors = await repo.list({ workspaceId: "ws", kind: "vendor", ownerKey: "tovu", principalId: null, provider: "vendor-test" });
      assert.equal(vendors.length, 2);
      assert.deepEqual(vendors.map(row => row.label).sort(), ["Saved", "Saved (legacy copy)"]);
      assert.equal(vendors.filter(row => row.isDefault).length, 1);
      for (const row of vendors) assert.equal((row.meta.migration as VaultMeta).originalLabel, "Saved");
      for (const kind of ["database-destination", "mcp-env", "mcp-auth"] as VaultKind[]) {
        const row = (await repo.list({ workspaceId: "ws", kind, ownerKey: kind.startsWith("mcp-") ? "server" : "tovu", principalId: null }))[0];
        assert.equal(row.last4, null);
        assert.equal(row.tokenLength, null);
      }
      const after = await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id='ws' ORDER BY id`);
      assert.notDeepEqual(after, original);
      const second = await normalizeVaultAtBoot(input);
      assert.equal(second.green, true);
      assert.equal(Object.values(second.kinds).reduce((n, kind) => n + kind.attempted, 0), 0);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id='ws' ORDER BY id`), after);
      const empty = await normalizeVaultAtBoot({ ...input, workspaceId: "ws-empty" });
      assert.equal(empty.green, true);
      assert.equal(empty.kinds["site-assistant"].rows, 1);
      assert.equal(empty.kinds["media-provider"].rows, 1);
      assert.equal(empty.kinds["site-assistant"].envelopes, 0);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: boot collisions skip an occupied first legacy copy label`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      const vault = new SecretsVaultService({ repo, keyring: input.keyring, sealer: input.sealer,
        metaParsers: registry.metaParsers, authorize: async () => {}, now: () => stamp, newId: () => "occupied-copy" });
      await vault.put({ workspaceId: "ws", kind: "vendor", ownerKey: "tovu", principalId: null, binding: null,
        provider: "vendor-test", label: "Saved (legacy copy)", isDefault: false,
        expectedRevision: null, meta: { accountLabel: null }, payload: null });
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      const rows = await repo.list({ workspaceId: "ws", kind: "vendor", ownerKey: "tovu", principalId: null, provider: "vendor-test" });
      assert.deepEqual(rows.map(row => row.label).sort(), ["Saved", "Saved (legacy copy 2)", "Saved (legacy copy)"]);
      const after = await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id='ws' ORDER BY id`);
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id='ws' ORDER BY id`), after);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: old machine labels repair with CAS without resealing, including null providers and principal scopes`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      const vendors = await repo.list({ workspaceId: "ws", kind: "vendor", ownerKey: "tovu", principalId: null, provider: "vendor-test" });
      const damaged = [vendors.find(row => row.label === "Saved (legacy copy)")!,
        (await repo.find({ workspaceId: "ws", id: "custom" }))!,
        (await repo.list({ workspaceId: "ws", kind: "personal-execution", ownerKey: "tovu", principalId: "p" }))[0]!];
      const originals: typeof damaged = [];
      for (const row of damaged) {
        originals.push(await repo.put({ expectedRevision: row.revision, record: { ...row,
          label: `${row.kind === "vendor" ? "Saved" : row.label} (legacy:${row.id}:0)`, revision: row.revision + 1 } }));
      }
      // Occupy the first human suffix independently of the row being repaired.
      const vendor = vendors.find(row => row.label === "Saved")!;
      await repo.put({ expectedRevision: null, record: { ...vendor, id: "occupied-copy", label: "Saved (legacy copy)",
        isDefault: false, revision: 1, sealed: null } });
      const sealer = { open: input.sealer.open.bind(input.sealer), seal: async () => { throw new Error("label repair must never seal"); } };
      assert.equal((await normalizeVaultAtBoot({ ...input, sealer })).green, true);
      for (const before of originals) {
        const after = (await repo.find({ workspaceId: "ws", id: before.id }))!;
        const preferred = before.label.replace(/ \(legacy:.*:\d+\)$/, "");
        assert.equal(after.label, `${preferred} (legacy copy${before.kind === "vendor" ? " 2" : ""})`);
        assert.deepEqual(after, { ...before, label: after.label, revision: before.revision + 1,
          updatedAt: new Date(clock.nowMs()).toISOString() });
        assert.equal(buildVaultAad(after), buildVaultAad(before));
      }
      const after = await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id='ws' ORDER BY id`);
      assert.equal((await normalizeVaultAtBoot({ ...input, sealer })).green, true);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault WHERE workspace_id='ws' ORDER BY id`), after);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: an intervening revision prevents stale label repair`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      const row = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      const before = await repo.put({ expectedRevision: row.revision, record: { ...row,
        label: "Custom (legacy:vault:custom:0)", revision: row.revision + 1 } });
      await repo.put({ expectedRevision: null, record: { ...row, id: "other-custom", label: "Custom",
        revision: 1, isDefault: false, sealed: null } });
      const query = kernel.query.bind(kernel);
      let intervened = false;
      kernel.query = async <Row>(statement: import("kysely").RawBuilder<Row>): Promise<Row[]> => {
        const rows = await query(statement);
        if (!intervened && rows.some(row => row !== null && typeof row === "object" && "label" in row && "is_default" in row)) {
          intervened = true;
          await kernel.execute(sql`UPDATE secrets_vault SET revision=revision+1 WHERE workspace_id='ws' AND id='custom'`);
        }
        return rows;
      };
      const report = await normalizeVaultAtBoot(input);
      assert.equal(intervened, true);
      assert.equal(report.green, false);
      assert.deepEqual(report.flagged, [{ id: "custom", kind: "custom", reason: "conflict" }]);
      assert.deepEqual(await repo.find({ workspaceId: "ws", id: "custom" }), { ...before, revision: before.revision + 1 });
      kernel.query = query;
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      assert.equal((await repo.find({ workspaceId: "ws", id: "custom" }))!.label, "Custom (legacy copy)");
    } finally { await kernel.close(); }
  });

  test(`${dialect}: metadata-only machine labels repair without a key or crypto`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      const keyring = { activeKey: async () => { throw new Error("unexpected key read"); },
        derive: async () => { throw new Error("unexpected derivation"); },
        deriveSigningSecret: async () => { throw new Error("unexpected signing key"); } };
      const sealer = { seal: async () => { throw new Error("unexpected seal"); }, open: async () => { throw new Error("unexpected open"); } };
      const emptyInput = { ...input, workspaceId: "ws-empty", keyring, sealer };
      assert.equal((await normalizeVaultAtBoot(emptyInput)).green, true);
      const row = (await repo.list({ workspaceId: "ws-empty", kind: "site-assistant", ownerKey: "tovu", principalId: null }))[0]!;
      const before = await repo.put({ expectedRevision: row.revision, record: { ...row,
        label: `Assistant (legacy:${row.id}:0)`, revision: row.revision + 1 } });
      assert.equal((await normalizeVaultAtBoot(emptyInput)).green, true);
      const after = (await repo.find({ workspaceId: "ws-empty", id: row.id }))!;
      assert.deepEqual(after, { ...before, label: "Assistant (legacy copy)", revision: before.revision + 1,
        updatedAt: new Date(clock.nowMs()).toISOString() });
      assert.equal((await normalizeVaultAtBoot(emptyInput)).green, true);
      assert.deepEqual(await repo.find({ workspaceId: "ws-empty", id: row.id }), after);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: missing key flags each sealed legacy row, preserves bytes, retries safely, and never reports green`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      const rows = await kernel.query<{ id: string }>(sql`SELECT id FROM secrets_vault WHERE workspace_id='ws' AND sealed_ciphertext IS NOT NULL`);
      const originals = new Map(await Promise.all(rows.map(async ({ id }) => [id, (await repo.find({ workspaceId: "ws", id }))!] as const)));
      const noKey = { ...input.keyring, activeKey: async () => { throw new Error("sensitive key details must not enter reports"); },
        derive: input.keyring.derive.bind(input.keyring), deriveSigningSecret: input.keyring.deriveSigningSecret.bind(input.keyring) };
      const report = await normalizeVaultAtBoot({ ...input, keyring: noKey });
      assert.equal(report.green, false);
      assert.equal(report.flagged.length, 11);
      assert.ok(report.flagged.every(flag => flag.reason === "missing-key"));
      assert.equal(report.kinds["publish-peer"].succeeded, 1, "metadata-only peer needs no key");
      assert.equal(Object.values(report.kinds).reduce((n, kind) => n + kind.legacyRemaining, 0), 11);
      assert.equal(JSON.stringify(report).includes("sensitive"), false);
      for (const [id, original] of originals) {
        const row = (await repo.find({ workspaceId: "ws", id }))!;
        assert.deepEqual(row.sealed, original.sealed);
        assert.deepEqual(row.meta.legacyAad, original.meta.legacyAad);
        assert.equal(row.meta.normalization, "missing-key");
        assert.equal(row.revision, 2);
      }
      const flagged = await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`);
      const retry = await normalizeVaultAtBoot({ ...input, keyring: noKey });
      assert.equal(retry.green, false);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`), flagged);
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      assert.equal(isOperationInFlight({ siteId: input.siteId }), false);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: unknown deploy catalog blocks only its legacy row and retains its identity/default mapping`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      const missing = createTovuVaultKinds({ policy: { ...policy, legacyPublishCredential: () => undefined } });
      const report = await normalizeVaultAtBoot({ ...input, registry: missing });
      assert.equal(report.green, false);
      assert.equal(report.flagged.length, 1);
      assert.equal(report.flagged[0].reason, "catalog-unavailable");
      const row = (await repo.find({ workspaceId: "ws", id: report.flagged[0].id }))!;
      assert.equal(row.provider, "legacy-host");
      assert.equal((row.meta.legacyAad as VaultMeta).id, "collision");
      assert.equal((row.meta.migration as VaultMeta).originalDefault, true);
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: wrong key or failed verification leaves the old envelope recoverable`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      const old = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      const sealer = { seal: input.sealer.seal.bind(input.sealer), open: async (required: Parameters<typeof input.sealer.open>[0], options?: { aad?: string }) => {
        const text = await input.sealer.open(required, options);
        return options?.aad?.startsWith("secrets-vault:") ? `${text}changed` : text;
      } };
      const report = await normalizeVaultAtBoot({ ...input, sealer });
      assert.equal(report.green, false);
      assert.ok(report.flagged.some(flag => flag.id === "custom" && flag.reason === "unopenable"));
      assert.deepEqual((await repo.find({ workspaceId: "ws", id: "custom" }))!.sealed, old.sealed);
      assert.ok((await repo.find({ workspaceId: "ws", id: "custom" }))!.meta.legacyAad);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: the shared operation lock denies boot before DB work and the Jini workspace lock fences writers`, async () => {
    const { kernel, input } = await prepared(dialect);
    try {
      const handle = await acquireOperationLock({ deps: { clock }, input: { siteId: input.siteId, operationKind: "restore" } });
      assert.ok(handle.ok);
      const original = await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`);
      await assert.rejects(normalizeVaultAtBoot(input), /OPERATION_IN_FLIGHT/);
      assert.deepEqual(await kernel.query(sql`SELECT * FROM secrets_vault ORDER BY id`), original);
      assert.equal(isOperationInFlight({ siteId: input.siteId }), true, "denied boot cannot release restore's lock");
      await releaseOperationLock({ deps: { clock }, input: { siteId: input.siteId, handle: handle.value } });
      const lockKey = kernel.lockKey.bind(kernel);
      const keys: string[] = [];
      kernel.lockKey = async key => { keys.push(key); assert.equal(kernel.inTransaction(), true); return lockKey(key); };
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      assert.equal(keys[0], "secrets_vault:ws");
      assert.equal(isOperationInFlight({ siteId: input.siteId }), false);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: revision CAS refuses an intervening replacement and retains the writer's original envelope`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      const original = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      let intervened = false;
      const sealer = { seal: input.sealer.seal.bind(input.sealer), open: async (required: Parameters<typeof input.sealer.open>[0], options?: { aad?: string }) => {
        const result = await input.sealer.open(required, options);
        // Deliberately bypass the writer fence to challenge CAS independently of the lock.
        if (!intervened && options?.aad === buildVaultAad(original)) {
          intervened = true;
          await kernel.execute(sql`UPDATE secrets_vault SET revision=revision+1 WHERE workspace_id='ws' AND id='custom'`);
        }
        return result;
      } };
      const report = await normalizeVaultAtBoot({ ...input, sealer });
      assert.equal(intervened, true);
      assert.equal(report.green, false);
      assert.ok(report.flagged.some(flag => flag.id === "custom" && flag.reason === "conflict"));
      const row = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      assert.deepEqual(row.sealed, original.sealed);
      assert.equal(row.revision, 2);
      assert.ok(row.meta.legacyAad);
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: a malformed source identity is flagged instead of guessing a legacy AAD`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      const original = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      const meta = { ...original.meta, legacyAad: { ...(original.meta.legacyAad as VaultMeta), workspaceId: "another-workspace" } };
      await kernel.execute(sql`UPDATE secrets_vault SET meta=${JSON.stringify(meta)} WHERE workspace_id='ws' AND id='custom'`);
      const report = await normalizeVaultAtBoot(input);
      assert.equal(report.green, false);
      assert.deepEqual(report.flagged, [{ id: "custom", kind: "custom", reason: "invalid-meta" }]);
      assert.deepEqual((await repo.find({ workspaceId: "ws", id: "custom" }))!.sealed, original.sealed);
      assert.equal(report.kinds.custom.legacyRemaining, 1);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: metadata-only rows normalize without any key or crypto calls`, async () => {
    const { kernel, input } = await prepared(dialect);
    try {
      const noKey = { activeKey: async () => { throw new Error("unexpected key read"); }, derive: async () => { throw new Error("unexpected derivation"); },
        deriveSigningSecret: async () => { throw new Error("unexpected signing key"); } };
      const noCrypto = { seal: async () => { throw new Error("unexpected seal"); }, open: async () => { throw new Error("unexpected open"); } };
      const report = await normalizeVaultAtBoot({ ...input, workspaceId: "ws-empty", keyring: noKey, sealer: noCrypto });
      assert.equal(report.green, true);
      assert.equal(report.kinds["site-assistant"].succeeded, 1);
      assert.equal(report.kinds["media-provider"].succeeded, 1);
      assert.deepEqual(report.flagged, []);
      assert.equal(Object.values(report.kinds).reduce((n, kind) => n + kind.envelopes, 0), 0);
    } finally { await kernel.close(); }
  });

  test(`${dialect}: missing keys after normalization still flag current envelopes instead of a false green boot`, async () => {
    const { kernel, input, repo } = await prepared(dialect);
    try {
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      const original = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      const noKey = { activeKey: async () => { throw new Error("key unavailable"); }, derive: input.keyring.derive.bind(input.keyring),
        deriveSigningSecret: input.keyring.deriveSigningSecret.bind(input.keyring) };
      const report = await normalizeVaultAtBoot({ ...input, keyring: noKey });
      assert.equal(report.green, false);
      assert.equal(report.flagged.length, 11);
      assert.equal(report.kinds.custom.legacyRemaining, 0);
      assert.equal(report.kinds.custom.unopenable, 1);
      const row = (await repo.find({ workspaceId: "ws", id: "custom" }))!;
      assert.equal(row.meta.normalization, "missing-key");
      assert.deepEqual(row.sealed, original.sealed);
      assert.equal((await normalizeVaultAtBoot(input)).green, true);
      assert.equal((await repo.find({ workspaceId: "ws", id: "custom" }))!.meta.normalization, undefined);
    } finally { await kernel.close(); }
  });
}

test("Tovu parsers call injected policy on reads/complete patches, retain provenance, and reject unsafe metadata", () => {
  const calls: VaultKind[] = [];
  const registered = createTovuVaultKinds({ policy: { ...policy, validateMeta: ({ kind, meta }) => { calls.push(kind); return meta; } } });
  assert.equal(registered.isCopyableKind["personal-execution"], false);
  assert.equal(registered.isCopyableKind["mcp-auth"], false);
  const parse = registered.metaParsers.custom;
  assert.deepEqual(parse({ meta: { category: "general", baseUrl: "https://api.example.test", additionalHosts: [], username: null, migration: { mappedId: "id" } } }).migration, { mappedId: "id" });
  assert.deepEqual(calls, ["custom"]);
  for (const meta of [null, [], { category: "unknown" }, { category: "general", baseUrl: "https://name:password@example.test" },
    { category: "general", additionalHosts: ["https://example.test/path"] }, { category: "general", legacyAad: {} },
    { category: "general", unexpected: "field" }]) assert.throws(() => parse({ meta }));
  const override = createTovuVaultKinds({ policy }, { parsers: { vendor: ({ meta }) => ({ ...(meta as VaultMeta), accountLabel: "normalized" }) } });
  assert.equal(override.metaParsers.vendor({ meta: { accountLabel: "old" } }).accountLabel, "normalized");
  assert.deepEqual(Object.keys(registered.metaParsers).sort(), [...VAULT_KINDS].sort());
});

test("legacy codec checks versions, personal/MCP identity and exact peer version format", () => {
  assert.equal(buildPublishContentPeerAad({ workspaceId: "ws", id: "peer", aadVersion: 2 }), "publish-content-peer:v2:ws:peer");
  const record = { workspaceId: "ws", kind: "personal-execution", principalId: "p", provider: "provider", ownerKey: "tovu" } as Parameters<typeof legacyVaultAad>[0]["record"];
  const legacy: VaultLegacyContext = { table: "admin_execution_credentials", workspaceId: "ws", id: "ws", principalId: "p", provider: "provider", serverId: null, aadVersion: 1 };
  assert.equal(legacyVaultAad({ record, legacy }), "admin-execution-credential:v1:ws:p");
  assert.equal(legacyVaultAad({ record, legacy: { ...legacy, aadVersion: 0 } }), undefined);
  assert.throws(() => legacyVaultAad({ record, legacy: { ...legacy, aadVersion: 2 } }));
  assert.throws(() => legacyVaultAad({ record, legacy: { ...legacy, principalId: "other" } }));
  assert.throws(() => legacyVaultAad({ record, legacy: { ...legacy, workspaceId: "other" } }));
  assert.throws(() => legacyVaultAad({ record, legacy: { ...legacy, table: "unknown" } }));
});

test("host boot wiring emits flagged coverage before returning when the site key is missing", async () => {
  const fixture = await vaultFixture("sqlite");
  try {
    await fixture.kernel.transaction(() => vaultStep.up(fixture.kernel, { note: () => {} }));
    let reported: Awaited<ReturnType<typeof normalizeSiteVaultAtBoot>> | undefined;
    const report = await normalizeSiteVaultAtBoot({ kernel: fixture.kernel, workspaceId: "ws", clock }, {
      keyring: { ...fixture.keyring, activeKey: async () => { throw new Error("missing site key"); },
        derive: input => fixture.keyring.derive(input), deriveSigningSecret: input => fixture.keyring.deriveSigningSecret(input) },
      sealer: fixture.sealer,
      loadContributions: async () => ({ items: [], refusals: [] }),
      report: coverage => { reported = coverage; },
    });
    assert.equal(reported, report, "consumer construction follows the awaited report callback");
    assert.equal(report.green, false);
    assert.ok(report.flagged.some(row => row.reason === "missing-key"));
    const legacy = await fixture.kernel.query<{ n: number }>(sql`SELECT count(*) AS n FROM secrets_vault
      WHERE sealed_ciphertext IS NOT NULL AND json_extract(meta, '$.legacyAad') IS NOT NULL`);
    assert.ok(Number(legacy[0]!.n) > 0, "missing keys keep the original envelopes recoverable");
  } finally { await fixture.kernel.close(); }
});
