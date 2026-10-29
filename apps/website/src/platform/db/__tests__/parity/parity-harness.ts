import { exampleRegistry } from "#src/features/source-control/__tests__/fixtures/example-provider";
import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import type { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import type { StorageKernel } from "../../kernel/port.js";
import { sqliteConnectionOf } from "../../kernel/drivers/sqlite.js";
import { CONTENT_MIGRATIONS } from "../../migrations/index.js";
import { runMigrations } from "../../migrations/runner.js";
import { seedParityRows, stamp, vaultFixture } from "../../migrations/__tests__/secrets-vault.fixture.js";
import { normalizeVaultAtBoot } from "#src/server/runtime/composition/vault-boot";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import { CompiledQuery, sql, type KyselyPlugin, type RootOperationNode } from "kysely";
import { InMemorySiteAssistantCredentialRepo } from "#src/assistant/site-credential-store.memory";
import { InMemoryAdminExecutionCredentialRepo } from "#src/assistant/execution-credential-store.memory";
import { MediaProviderCredentialVaultRepo } from "#src/features/media/provider-credential-vault";
import { CustomCredentialVaultRepo } from "#src/features/custom-credentials/vault-repo";
import { InMemoryVendorCredentialSetRepo } from "#src/features/deployments/publish-credentials/repo.memory";
import { InMemorySourceControlCredentialSetRepo } from "#src/features/source-control/repo.memory";
import { VaultPublishContentPeerRepo } from "#src/features/publish-content/peers";
import { SealedDatabaseDestinationStore } from "#src/features/database-transfer/destination-store";

/**
 * @file Query-parity harness (DBMERGE-PLAN §2b/§2d). The pre-vault stores and repos are gone from
 * the tree, so ONE scripted transcript runs against either code generation: `loadParityModules`
 * imports the same stores and repos from a source root (the working tree, or a `git archive` of
 * the last pre-vault commit for the one-time golden capture). Store and repo names and signatures
 * did not change across 0012, which is what makes a single transcript possible. Repo paths moved
 * to their domains in 2a0c60acb; the archived pre-vault source retains platform/db/repos. Sealed bytes
 * legitimately change (0012 copies, the boot re-seal rewrites), so the transcript records the
 * consumer projection: views, decrypted plaintext, hints, order, and error classes.
 */

/** Loose module shape: the transcript drives two code generations through the same names. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Loose = any;
export type ParityModules = Record<string, Loose>;

export const CURRENT_SRC = join(import.meta.dirname, "../../../..");
export const GOLDEN_PATH = join(import.meta.dirname, "__fixtures__/vault-parity.golden.json");

/** Every module the transcripts touch, imported from `root` (an `apps/website/src` tree). */
export async function loadParityModules(root: string): Promise<ParityModules> {
  const load = (path: string) => import(pathToFileURL(join(root, path)).href);
  const loadRepo = (relative: string) => load(root === CURRENT_SRC ? relative : `platform/db/repos/${basename(relative)}`);
  return {
    site: await load("assistant/site-credential-store.ts"),
    exec: await load("assistant/execution-credential-store.ts"),
    media: await load("features/media/provider-credential-store.ts"),
    custom: await load("features/custom-credentials/store.ts"),
    peers: await load("features/publish-content/peers.ts"),
    destination: await load("features/database-transfer/destination-store.ts"),
    destinationRepo: await load("features/database-transfer/destination-repo.ts"),
    source: await load("features/source-control/store.ts"),
    publish: await load("features/deployments/publish-credentials/store.ts"),
    mcp: await load("assistant/external-mcp-store.ts"),
    siteRepo: await loadRepo("assistant/site-credential-repo.ts"),
    execRepo: await loadRepo("assistant/execution-credential-repo.ts"),
    mediaRepo: await loadRepo("features/media/media-provider-credential-repo.ts"),
    customRepo: await loadRepo("features/custom-credentials/custom-credential-repo.ts"),
    vendorRepo: await loadRepo("features/vendor-credentials/vendor-credential-repo.ts"),
    sourceRepo: await loadRepo("features/source-control/source-control-credential-repo.ts"),
    peerRepo: await loadRepo("features/publish-content/publish-content-peer-repo.ts"),
    mcpRepo: await loadRepo("assistant/external-mcp-repo.ts"),
    userPurge: await load("features/identity/user-purge.ts"),
    tableCatalog: await load("features/database-transfer/table-catalog.ts"),
    snapshotSource: await load("features/database-transfer/sqlite-source.ts"),
    exclusions: await load("features/database-transfer/exclusions.ts"),
    keyDependent: await load("platform/db/key-dependent-data.ts"),
  };
}

/** Deploy targets the vendor rows map to (publish summaries resolve a host per vendor). */
const targets = [
  { id: "legacy-host", vendorId: "vendor-test" },
  { id: "tie-host", vendorId: "vendor-tie" },
].map(({ id, vendorId }) => ({ descriptor: { id, label: id, credential: { vendorId, tokenField: "token",
  fields: [{ name: "token", label: "Token", secret: true }] } },
  // why: LoadedDeployTarget always carries `module` (d19868a6 reads module.acceptsCredential); none narrows eligibility here.
  module: {} }));
export const parityDeployTargets = {
  list: () => targets,
  get: (id: string) => targets.find(target => target.descriptor.id === id),
};

export interface ParityContext {
  kernel: StorageKernel<unknown>;
  keyring: InMemoryKeyring;
  sealer: AesGcmSecretSealer;
}

export type ParityDialect = "sqlite" | "pglite";
export const PARITY_DIALECTS: readonly ParityDialect[] = ["sqlite", "pglite"];
export const PARITY_WORKSPACES = ["ws", "ws2", "ws-empty"] as const;

/** The vault kinds as composition registers them, with the parity deploy targets as the legacy
 * publish-credential map (production reads the same map from the deploy-target registry). */
export const parityVaultKinds = createTovuVaultKinds({ policy: {
  validateMeta: ({ meta }) => meta,
  legacyPublishCredential: ({ providerId }) => {
    const credential = parityDeployTargets.get(providerId)?.descriptor.credential;
    return credential ? { vendorId: credential.vendorId, tokenField: credential.tokenField } : undefined;
  },
  tokenField: ({ kind }) => ["vendor", "source-control", "custom"].includes(kind) ? "token" : undefined,
} });

/** The legacy fixture plus parity rows, upgraded the way a live site is: the REAL pinned 0012 step
 * through the runner, then the boot re-seal for every workspace (clock = the seed stamp, so a
 * re-seal does not move `updatedAt`). Close `kernel` when done. */
export async function migratedParityFixture(dialect: ParityDialect, options: { kernel?: StorageKernel<unknown> } = {}) {
  const fixture = await vaultFixture(dialect, options);
  try {
    await seedParityRows(fixture, dialect);
    await runMigrations(fixture.kernel, CONTENT_MIGRATIONS);
    for (const workspaceId of PARITY_WORKSPACES) {
      const report = await normalizeVaultAtBoot({ ...fixture, workspaceId, siteId: `parity-${dialect}-${workspaceId}`,
        clock: { nowMs: () => Date.parse(stamp) }, registry: parityVaultKinds });
      if (!report.green) throw new Error(`boot re-seal flagged ${workspaceId}: ${JSON.stringify(report.flagged)}`);
    }
    return fixture;
  } catch (error) { await fixture.kernel.close(); throw error; }
}

/** The same rows on the pre-0012 schema, for the legacy side. */
export async function legacyParityFixture(dialect: ParityDialect) {
  const fixture = await vaultFixture(dialect);
  try { await seedParityRows(fixture, dialect); return fixture; } catch (error) { await fixture.kernel.close(); throw error; }
}

function baseDeps(ctx: ParityContext) {
  let next = 0;
  return { sealer: ctx.sealer, keyring: ctx.keyring, clock: { nowMs: () => Date.parse(stamp) }, idGen: { newId: () => `parity-${++next}` },
    loadDeployTargets: async () => parityDeployTargets };
}

/** Store dependencies wired exactly as the composition does (the Sql* repos over one kernel). */
export function parityDeps(mods: ParityModules, ctx: ParityContext) {
  const { kernel } = ctx;
  const base = baseDeps(ctx);
  return {
    site: { ...base, repo: new mods.siteRepo.SqlSiteAssistantCredentialRepo(kernel) },
    exec: { ...base, repo: new mods.execRepo.SqlAdminExecutionCredentialRepo(kernel) },
    media: { ...base, repo: new mods.mediaRepo.SqlMediaProviderCredentialRepo(kernel) },
    custom: { ...base, repo: new mods.customRepo.SqlCustomCredentialSetRepo(kernel) },
    vendor: { ...base, repo: new mods.vendorRepo.SqlVendorCredentialSetRepo(kernel) },
    source: { ...base, loadSourceControlProviders: async () => exampleRegistry({ probe: false, ids: ["github"] }), repo: new mods.sourceRepo.SqlSourceControlCredentialSetRepo(kernel) },
    peer: { ...base, repo: new mods.peerRepo.SqlPublishContentPeerRepo(kernel) },
    mcp: { ...base, repo: new mods.mcpRepo.SqlExternalMcpServerRepo(kernel) },
    destination: new mods.destination.SealedDatabaseDestinationStore({ ...base, repo: new mods.destinationRepo.DatabaseDestinationRepo(kernel) }),
  };
}

/** Fields that carry sealed bytes or storage bookkeeping, never the consumer's view. */
const STORAGE_KEYS = new Set(["sealed", "sealedKeyId", "sealedCiphertext", "sealedNonce", "sealedAlg", "ciphertext", "nonce", "keyId", "alg",
  "aadVersion", "oauthAadVersion", "oauthSealed", "oauthSealedKeyId", "oauthSealedCiphertext", "oauthSealedNonce", "oauthSealedAlg", "revision", "vault",
  // A hash over the stored row (dialect-specific even before the vault); the approval flow, not the view.
  "admissionRevision"]);

/** JSON projection of a store result: storage keys dropped, Dates as ISO, functions omitted. */
export function project(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(project);
  if (value instanceof Map) return project(Object.fromEntries(value));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (STORAGE_KEYS.has(key) || typeof entry === "function" || entry === undefined) continue;
      out[key] = project(entry);
    }
    return out;
  }
  return value;
}

export type ParityDeps = ReturnType<typeof parityDeps>;

export interface RecordedStatement { kind: string; sql: string; parameters: readonly unknown[] }

/** `kernel` recording every statement it executes (compiled SQL + parameters), for the hot-path
 * query counts and plans. Repos built over the wrapper go through it for every call. */
export function countingKernel<DB>(kernel: StorageKernel<DB>): { kernel: StorageKernel<DB>; statements: RecordedStatement[] } {
  const statements: RecordedStatement[] = [];
  const wrapped: StorageKernel<DB> = {
    ...kernel,
    run: fn => kernel.run(db => {
      const plugin: KyselyPlugin = {
        transformQuery: ({ node, queryId }) => {
          const compiled = db.getExecutor().compileQuery(node as RootOperationNode, queryId);
          statements.push({ kind: node.kind, sql: compiled.sql, parameters: compiled.parameters });
          return node;
        },
        transformResult: async ({ result }) => result,
      };
      return fn(db.withPlugin(plugin));
    }),
    query: statement => { statements.push({ kind: "Raw", sql: "", parameters: [] }); return kernel.query(statement); },
    execute: statement => { statements.push({ kind: "Raw", sql: "", parameters: [] }); return kernel.execute(statement); },
    transaction: fn => kernel.transaction(fn),
  };
  return { kernel: wrapped, statements };
}

/** The plan of one recorded statement, flattened to text: SQLite `EXPLAIN QUERY PLAN`, Postgres
 * `EXPLAIN (FORMAT JSON)` with sequential scans disabled so a usable index is always preferred
 * (tiny fixture tables would otherwise be scanned regardless of the indexes). */
export async function explainPlan(kernel: StorageKernel<unknown>, statement: RecordedStatement): Promise<string> {
  if (kernel.dialect === "sqlite") {
    const parameters = statement.parameters.map(value => typeof value === "boolean" ? Number(value) : value);
    const rows = await kernel.run(db => db.executeQuery(CompiledQuery.raw(`EXPLAIN QUERY PLAN ${statement.sql}`, parameters)));
    return rows.rows.map(row => (row as { detail: string }).detail).join("\n");
  }
  await kernel.execute(sql`SET enable_seqscan = off`);
  try {
    const rows = await kernel.run(db => db.executeQuery(CompiledQuery.raw(`EXPLAIN (FORMAT JSON) ${statement.sql}`, [...statement.parameters])));
    return JSON.stringify(rows.rows);
  } finally { await kernel.execute(sql`RESET enable_seqscan`); }
}

/** Asserts a Postgres `explainPlan` result reads `secrets_vault` through an index, never a Seq Scan.
 * Walks the parsed plan tree: the payload is JSON-stringified (driver may already stringify QUERY
 * PLAN too), so regexes over the raw text see escaped quotes and silently never match. A Bitmap
 * Index Scan (under a Bitmap Heap Scan) is still an index search. */
export function assertPostgresVaultPlanIndexed(plan: string, message: string): void {
  const queryPlan = (JSON.parse(plan) as Array<Record<string, unknown>>)[0]?.["QUERY PLAN"];
  const nodes: Array<Record<string, unknown>> = [];
  const walk = (node: Record<string, unknown>): void => {
    nodes.push(node);
    for (const child of (node.Plans as Array<Record<string, unknown>> | undefined) ?? []) walk(child);
  };
  walk(((typeof queryPlan === "string" ? JSON.parse(queryPlan) : queryPlan) as Array<{ Plan: Record<string, unknown> }>)[0].Plan);
  const vaultNodes = nodes.filter(node => node["Relation Name"] === "secrets_vault" || String(node["Index Name"] ?? "").startsWith("secrets_vault"));
  assert.ok(vaultNodes.length > 0, `no secrets_vault node in plan\n${message}`);
  assert.ok(!vaultNodes.some(node => node["Node Type"] === "Seq Scan"), `Seq Scan on secrets_vault\n${message}`);
  assert.ok(vaultNodes.some(node => /^(Index (Only )?Scan|Bitmap Index Scan)$/.test(String(node["Node Type"]))), `no index search on secrets_vault\n${message}`);
}

/** The route-test fakes: every vault-backed repo over ONE `InMemoryVaultRepo` holding a copy of the
 * migrated SQL rows. External MCP server rows live outside the vault, so `mcp` stays on SQL. */
export async function memoryParityDeps(mods: ParityModules, ctx: ParityContext): Promise<ParityDeps> {
  const vault = new InMemoryVaultRepo({});
  const sqlVault = new SqlSecretsVaultRepo({ kernel: ctx.kernel as StorageKernel<SecretsVaultDatabase> });
  for (const { workspace_id: workspaceId, id } of await ctx.kernel.query<{ workspace_id: string; id: string }>(sql`SELECT workspace_id, id FROM secrets_vault ORDER BY id`)) {
    const record = await sqlVault.find({ workspaceId, id });
    // A fresh insert must be revision 1; the boot re-seal already moved the SQL rows to 2.
    if (record) await vault.put({ record: { ...record, revision: 1 }, expectedRevision: null });
  }
  const base = baseDeps(ctx);
  return { ...parityDeps(mods, ctx),
    site: { ...base, repo: new InMemorySiteAssistantCredentialRepo({ vault }) },
    exec: { ...base, repo: new InMemoryAdminExecutionCredentialRepo({ vault }) },
    media: { ...base, repo: new MediaProviderCredentialVaultRepo({ vault }) },
    custom: { ...base, repo: new CustomCredentialVaultRepo({ vault }) },
    vendor: { ...base, repo: new InMemoryVendorCredentialSetRepo({ vault }) },
    source: { ...base, loadSourceControlProviders: async () => exampleRegistry({ probe: false, ids: ["github"] }), repo: new InMemorySourceControlCredentialSetRepo({ vault }) },
    peer: { ...base, repo: new VaultPublishContentPeerRepo({ vault }) },
    destination: new SealedDatabaseDestinationStore({ sealer: base.sealer, keyring: base.keyring as never, repo: vault as never }),
  } as ParityDeps;
}

export type Outcome = { ok: unknown } | { error: string };

/** A store call's outcome: the projection, or the error's class name (messages may be reworded). */
export async function outcome(call: () => Promise<unknown>): Promise<Outcome> {
  try { return { ok: project(await call()) ?? null }; } catch (error) {
    return { error: error instanceof Error ? error.constructor.name : typeof error };
  }
}

export type Transcript = Record<string, Outcome>;

/** The read transcript (§2d `vault-read-parity`): every vault kind through the store the routes
 * call, for both workspaces and both principals, plus the default-resolution and list-order reads. */
export async function readTranscript(mods: ParityModules, ctx: ParityContext): Promise<Transcript> {
  const d = parityDeps(mods, ctx);
  const t: Transcript = {};
  for (const workspaceId of ["ws", "ws2", "ws-empty"]) {
    const at = (name: string) => `${name}@${workspaceId}`;
    t[at("site.get")] = await outcome(() => mods.site.getSiteAssistantCredential(d.site, { workspaceId }));
    t[at("site.resolve")] = await outcome(() => mods.site.resolveSiteAssistantApiKey(d.site, { workspaceId }));
    t[at("media.get")] = await outcome(() => mods.media.getMediaProviderCredentials(d.media, { workspaceId }));
    for (const providerId of ["media-test", "openai"]) {
      t[at(`media.resolve.${providerId}`)] = await outcome(() => mods.media.resolveMediaProviderCredential(d.media, { workspaceId, providerId }));
    }
    t[at("custom.list")] = await outcome(() => mods.custom.listCustomCredentials(d.custom, { workspaceId }));
    for (const label of ["Custom", "AI keys"]) {
      t[at(`custom.resolve.${label}`)] = await outcome(() => mods.custom.resolveCustomCredentialByLabel(d.custom, { workspaceId, label }));
    }
    t[at("peer.list")] = await outcome(() => mods.peers.listPublishContentPeers(d.peer, { workspaceId }));
    for (const id of ["peer", "peer-empty", "peer-ws2"]) {
      t[at(`peer.resolve.${id}`)] = await outcome(() => mods.peers.resolvePeerCredential(d.peer, { workspaceId, id }));
    }
    t[at("destination.get")] = await outcome(() => d.destination.get(workspaceId));
    t[at("destination.lastRun")] = await outcome(() => d.destination.lastRun(workspaceId));
    t[at("vendor.list")] = await outcome(() => mods.publish.listPublishCredentials(d.vendor, { workspaceId }));
    for (const providerId of ["legacy-host", "tie-host"]) {
      t[at(`vendor.hasDefault.${providerId}`)] = await outcome(() => mods.publish.hasDefaultForPublish(d.vendor, { workspaceId, providerId }));
      t[at(`vendor.resolveDefault.${providerId}`)] = await outcome(() => mods.publish.resolveDefaultForPublish(d.vendor, { workspaceId, providerId }));
    }
    t[at("source.list")] = await outcome(() => mods.source.listSourceControlCredentials(d.source, { workspaceId }));
    t[at("source.resolveDefault.github")] = await outcome(() => mods.source.resolveDefaultForSourceControl(d.source, { workspaceId, providerId: "github" }));
    t[at("mcp.list")] = await outcome(() => mods.mcp.listExternalMcpServerViews(d.mcp, workspaceId));
    t[at("mcp.enabled")] = await outcome(() => mods.mcp.readEnabledExternalMcpConfigs(d.mcp, workspaceId));
  }
  for (const [workspaceId, principalId] of [["ws", "p"], ["ws", "p2"], ["ws2", "q"], ["ws2", "p"]]) {
    const at = (name: string) => `${name}@${workspaceId}/${principalId}`;
    t[at("exec.get")] = await outcome(() => mods.exec.getExecutionCredential(d.exec, { workspaceId, principalId }));
    t[at("exec.resolve")] = await outcome(() => mods.exec.resolveExecutionCredential(d.exec, { workspaceId, principalId }));
  }
  return t;
}

/** The six write sequences (§2d `vault-write-parity`), each keyed by its sequence name so a test
 * can compare one sequence at a time. Ids come from a deterministic counter. */
export const WRITE_SEQUENCES = ["vendor", "source", "custom", "peer", "media", "destination", "mcp", "assistant"] as const;
export type WriteSequence = typeof WRITE_SEQUENCES[number];

export async function writeTranscript(mods: ParityModules, ctx: ParityContext,
  options: { only?: WriteSequence; deps?: ParityDeps } = {}): Promise<Transcript> {
  const { only } = options;
  const d = options.deps ?? parityDeps(mods, ctx);
  const t: Transcript = {};
  const ws = "ws";
  const run = (name: WriteSequence) => only === undefined || only === name;
  if (run("vendor")) {
    const tie = { providerId: "tie-host" };
    const created = await outcome(() => mods.publish.createPublishCredential(d.vendor, { workspaceId: ws, label: "New",
      connection: { ...tie, token: "new-vendor-token-1234567890" }, isDefault: true }));
    t["vendor.1.create-default"] = created;
    const id = "ok" in created ? (created.ok as { id: string }).id : "missing";
    t["vendor.2.list"] = await outcome(() => mods.publish.listPublishCredentials(d.vendor, { workspaceId: ws }));
    t["vendor.3.rotate"] = await outcome(() => mods.publish.updatePublishCredential(d.vendor, { workspaceId: ws, id,
      connection: { ...tie, token: "rotated-vendor-token-1234567890" } }));
    t["vendor.4.resolve-default"] = await outcome(() => mods.publish.resolveDefaultForPublish(d.vendor, { workspaceId: ws, providerId: "tie-host" }));
    t["vendor.5.set-default-other"] = await outcome(() => mods.publish.updatePublishCredential(d.vendor, { workspaceId: ws, id: "tie-c", isDefault: true }));
    t["vendor.6.list"] = await outcome(() => mods.publish.listPublishCredentials(d.vendor, { workspaceId: ws }));
    t["vendor.7.delete-default"] = await outcome(() => mods.publish.deletePublishCredential(d.vendor, { workspaceId: ws, id: "tie-c" }));
    t["vendor.8.has-default"] = await outcome(() => mods.publish.hasDefaultForPublish(d.vendor, { workspaceId: ws, providerId: "tie-host" }));
    t["vendor.9.resolve-promoted"] = await outcome(() => mods.publish.resolveDefaultForPublish(d.vendor, { workspaceId: ws, providerId: "tie-host" }));
    t["vendor.10.label-collision"] = await outcome(() => mods.publish.createPublishCredential(d.vendor, { workspaceId: ws, label: "Tie A",
      connection: { ...tie, token: "colliding-token-1234567890" } }));
    t["vendor.11.list"] = await outcome(() => mods.publish.listPublishCredentials(d.vendor, { workspaceId: ws }));
  }
  if (run("source")) {
    const created = await outcome(() => mods.source.createSourceControlCredential({ deps: d.source, input: { workspaceId: ws, label: "Second GH",
      connection: { providerId: "github", token: "ghp-second-token-1234567890", username: "second" }, isDefault: true } }));
    t["source.1.create-default"] = created;
    const id = "ok" in created ? (created.ok as { id: string }).id : "missing";
    t["source.2.resolve-default"] = await outcome(() => mods.source.resolveDefaultForSourceControl(d.source, { workspaceId: ws, providerId: "github" }));
    t["source.3.rotate"] = await outcome(() => mods.source.updateSourceControlCredential({ deps: d.source, input: { workspaceId: ws, id,
      connection: { providerId: "github", token: "ghp-rotated-token-1234567890" } } }));
    t["source.4.describe"] = await outcome(() => mods.source.describeCredential(d.source, { workspaceId: ws, id }));
    t["source.5.delete-default"] = await outcome(() => mods.source.deleteSourceControlCredential(d.source, { workspaceId: ws, id }));
    t["source.6.resolve-promoted"] = await outcome(() => mods.source.resolveDefaultForSourceControl(d.source, { workspaceId: ws, providerId: "github" }));
    t["source.7.label-collision"] = await outcome(() => mods.source.createSourceControlCredential({ deps: d.source, input: { workspaceId: ws, label: "GitHub",
      connection: { providerId: "github", token: "ghp-colliding-token-1234567890" } } }));
    t["source.8.list"] = await outcome(() => mods.source.listSourceControlCredentials(d.source, { workspaceId: ws }));
  }
  if (run("custom")) {
    const created = await outcome(() => mods.custom.createCustomCredential(d.custom, { workspaceId: ws, label: "Ops", category: "ops",
      baseUrl: "https://ops.example.test", connection: { token: "ops-token-1234567890", username: "ops-user" } }));
    t["custom.1.create"] = created;
    const id = "ok" in created ? (created.ok as { id: string }).id : "missing";
    t["custom.2.same-label-other-category"] = await outcome(() => mods.custom.createCustomCredential(d.custom, { workspaceId: ws, label: "Ops",
      category: "general", baseUrl: "https://other.example.test", connection: { token: "other-token-1234567890" } }));
    t["custom.3.rename"] = await outcome(() => mods.custom.updateCustomCredential(d.custom, { workspaceId: ws, id, label: "Ops renamed" }));
    t["custom.4.rename-onto-existing"] = await outcome(() => mods.custom.updateCustomCredential(d.custom, { workspaceId: ws, id, label: "AI keys" }));
    t["custom.5.resolve"] = await outcome(() => mods.custom.resolveCustomCredentialByLabel(d.custom, { workspaceId: ws, label: "Ops renamed" }));
    t["custom.6.clear-username"] = await outcome(() => mods.custom.updateCustomCredential(d.custom, { workspaceId: ws, id, username: null }));
    t["custom.7.resolve"] = await outcome(() => mods.custom.resolveCustomCredentialByLabel(d.custom, { workspaceId: ws, label: "Ops renamed" }));
    t["custom.8.delete"] = await outcome(() => mods.custom.deleteCustomCredential(d.custom, { workspaceId: ws, id }));
    t["custom.9.list"] = await outcome(() => mods.custom.listCustomCredentials(d.custom, { workspaceId: ws }));
  }
  if (run("peer")) {
    const created = await outcome(() => mods.peers.createPublishContentPeer(d.peer, { workspaceId: ws, label: "New peer",
      baseUrl: "https://new-peer.example.test", remoteWorkspaceId: "remote-new", apiKey: "new-peer-key-1234567890" }));
    t["peer.1.create"] = created;
    const id = "ok" in created ? (created.ok as { id: string }).id : "missing";
    t["peer.2.rename-keeps-key"] = await outcome(() => mods.peers.updatePublishContentPeer(d.peer, { workspaceId: ws, id, label: "Renamed peer" }));
    t["peer.3.resolve"] = await outcome(() => mods.peers.resolvePeerCredential(d.peer, { workspaceId: ws, id }));
    t["peer.4.rekey"] = await outcome(() => mods.peers.updatePublishContentPeer(d.peer, { workspaceId: ws, id, apiKey: "rekeyed-peer-key-1234567890" }));
    t["peer.5.resolve"] = await outcome(() => mods.peers.resolvePeerCredential(d.peer, { workspaceId: ws, id }));
    t["peer.6.key-the-keyless"] = await outcome(() => mods.peers.updatePublishContentPeer(d.peer, { workspaceId: ws, id: "peer-empty", apiKey: "late-key-1234567890" }));
    t["peer.7.resolve-keyless"] = await outcome(() => mods.peers.resolvePeerCredential(d.peer, { workspaceId: ws, id: "peer-empty" }));
    t["peer.8.duplicate-label"] = await outcome(() => mods.peers.createPublishContentPeer(d.peer, { workspaceId: ws, label: "Peer",
      baseUrl: "https://dup.example.test", remoteWorkspaceId: "dup", apiKey: "dup-key-1234567890" }));
    t["peer.9.delete"] = await outcome(() => mods.peers.deletePublishContentPeer(d.peer, { workspaceId: ws, id }));
    t["peer.10.resolve-deleted"] = await outcome(() => mods.peers.resolvePeerCredential(d.peer, { workspaceId: ws, id }));
    t["peer.11.list"] = await outcome(() => mods.peers.listPublishContentPeers(d.peer, { workspaceId: ws }));
  }
  if (run("media")) {
    t["media.1.save"] = await outcome(() => mods.media.saveMediaProviderCredentials(d.media, { workspaceId: ws, providers: {
      openai: { apiKey: "openai-media-key-1234567890" }, grok: { apiKey: "grok-media-key-1234567890", model: "grok-imagine" } } }));
    t["media.2.batch-with-unknown"] = await outcome(() => mods.media.saveMediaProviderCredentials(d.media, { workspaceId: ws, providers: {
      openai: { apiKey: "should-not-land-1234567890" }, "not-a-provider": { apiKey: "x-1234567890" } } }));
    t["media.3.get-unchanged"] = await outcome(() => mods.media.getMediaProviderCredentials(d.media, { workspaceId: ws }));
    t["media.4.resolve"] = await outcome(() => mods.media.resolveMediaProviderCredential(d.media, { workspaceId: ws, providerId: "openai" }));
    t["media.5.model-only"] = await outcome(() => mods.media.saveMediaProviderCredentials(d.media, { workspaceId: ws, providers: { grok: { model: "grok-2" } } }));
    t["media.6.resolve"] = await outcome(() => mods.media.resolveMediaProviderCredential(d.media, { workspaceId: ws, providerId: "grok" }));
  }
  if (run("destination")) {
    const summary = { copied: true, snapshotAt: stamp, tableCount: 3, rowCount: 9 };
    t["destination.1.record-missing"] = await outcome(() => d.destination.recordRun("ws-empty", summary));
    t["destination.2.last-run-missing"] = await outcome(() => d.destination.lastRun("ws-empty"));
    t["destination.3.get-missing"] = await outcome(() => d.destination.get("ws-empty"));
    t["destination.4.record"] = await outcome(() => d.destination.recordRun(ws, summary));
    t["destination.5.last-run"] = await outcome(() => d.destination.lastRun(ws));
    t["destination.6.get"] = await outcome(() => d.destination.get(ws));
    t["destination.7.replace"] = await outcome(() => d.destination.save(ws, { connectionString: "postgres://new:pw@new.example.test/db",
      description: { host: "new.example.test", port: "5432", database: "db", user: "new" }, savedAt: stamp }));
    t["destination.8.get"] = await outcome(() => d.destination.get(ws));
    t["destination.9.last-run-forgotten"] = await outcome(() => d.destination.lastRun(ws));
  }
  if (run("mcp")) {
    const base = { workspaceId: ws, transport: "stdio", enabled: true, command: "mcp-new", args: "", allowedToolNames: "", writeAllowedToolNames: "" };
    t["mcp.1.save-env"] = await outcome(() => mods.mcp.saveExternalMcpServer(d.mcp, { ...base, serverId: "new-env", label: "New env", authMode: "static_env", env: "A=one" }));
    t["mcp.2.save-keeps-env"] = await outcome(() => mods.mcp.saveExternalMcpServer(d.mcp, { ...base, serverId: "new-env", label: "Renamed env", authMode: "static_env" }));
    t["mcp.3.enabled"] = await outcome(() => mods.mcp.readEnabledExternalMcpConfigs(d.mcp, ws));
    const lease = { workspaceId: ws, serverId: "server", nowIso: stamp, leaseUntil: "2026-10-11T12:05:00.000Z" };
    t["mcp.4.claim"] = await outcome(() => d.mcp.repo.tryClaimOAuthRefreshLease(lease));
    t["mcp.5.claim-again"] = await outcome(() => d.mcp.repo.tryClaimOAuthRefreshLease(lease));
    t["mcp.6.release"] = await outcome(() => d.mcp.repo.releaseOAuthRefreshLease({ workspaceId: ws, serverId: "server" }));
    t["mcp.7.claim-after-release"] = await outcome(() => d.mcp.repo.tryClaimOAuthRefreshLease(lease));
    t["mcp.8.delete"] = await outcome(() => mods.mcp.deleteExternalMcpServer(d.mcp, { workspaceId: ws, serverId: "server" }));
    t["mcp.9.delete-again"] = await outcome(() => mods.mcp.deleteExternalMcpServer(d.mcp, { workspaceId: ws, serverId: "server" }));
    t["mcp.10.list"] = await outcome(() => mods.mcp.listExternalMcpServerViews(d.mcp, ws));
  }
  if (run("assistant")) {
    t["assistant.1.site-set"] = await outcome(() => mods.site.setSiteAssistantCredential(d.site, { workspaceId: "ws2", apiKey: "ws2-new-site-key-1234567890" }));
    t["assistant.2.site-resolve"] = await outcome(() => mods.site.resolveSiteAssistantApiKey(d.site, { workspaceId: "ws2" }));
    t["assistant.3.site-metadata-only"] = await outcome(() => mods.site.setSiteAssistantCredential(d.site, { workspaceId: "ws2", model: "ws2-next" }));
    t["assistant.4.site-delete"] = await outcome(() => mods.site.deleteSiteAssistantCredential(d.site, { workspaceId: "ws2" }));
    t["assistant.5.site-get"] = await outcome(() => mods.site.getSiteAssistantCredential(d.site, { workspaceId: "ws2" }));
    t["assistant.6.exec-set"] = await outcome(() => mods.exec.setExecutionCredential(d.exec, { workspaceId: ws, principalId: "p2", model: "next-model" }));
    t["assistant.7.exec-resolve"] = await outcome(() => mods.exec.resolveExecutionCredential(d.exec, { workspaceId: ws, principalId: "p2" }));
    t["assistant.8.exec-delete"] = await outcome(() => mods.exec.deleteExecutionCredential(d.exec, { workspaceId: ws, principalId: "p2" }));
    t["assistant.9.exec-other-untouched"] = await outcome(() => mods.exec.resolveExecutionCredential(d.exec, { workspaceId: ws, principalId: "p" }));
  }
  return t;
}

/** The transfer and key-probe boundary (§2d `vault-boundary-parity`), SQLite only: the snapshot
 * plan needs a serialized SQLite file. Table lists are sorted; the plan's own order has its tests. */
export async function boundaryTranscript(mods: ParityModules, ctx: ParityContext): Promise<Record<string, unknown>> {
  const source = mods.snapshotSource.openSqliteSnapshotSource(sqliteConnectionOf(ctx.kernel)!.serialize());
  try {
    const plan = mods.tableCatalog.planSnapshotTables(source);
    return {
      copied: plan.tables.map((table: { name: string }) => table.name).sort(),
      leftOut: plan.leftOut.map((entry: { table: string }) => entry.table).sort(),
      excluded: Object.keys(mods.exclusions.EXCLUDED_CORE_TABLES).sort(),
      partiallyExcluded: Object.keys(mods.exclusions.PARTIALLY_EXCLUDED_TABLES).sort(),
      keyDependent: await mods.keyDependent.hasKeyDependentData(ctx.kernel),
    };
  } finally { source.close(); }
}

/** Raw deletes compare as accepted/rejected: driver error classes differ between dialects. */
async function rawOutcome(call: () => Promise<unknown>): Promise<Outcome> {
  try { await call(); return { ok: "deleted" }; } catch { return { error: "rejected" }; }
}

/** The cascade transcript (§2d `vault-cascade-parity`): purge a user, delete a principal, delete a
 * workspace, then read what the stores still see. */
export async function cascadeTranscript(mods: ParityModules, ctx: ParityContext): Promise<Transcript> {
  const d = parityDeps(mods, ctx);
  const t: Transcript = {};
  const purge = new mods.userPurge.SqlUserPurge(ctx.kernel);
  t["purge.1.user-p2"] = await outcome(() => purge.purgeUser({ workspaceId: "ws", principalId: "p2",
    buildEvent: (removed: unknown) => ({ id: "purge-event", name: "identity.user.deleted", occurredAt: stamp, aggregateId: "p2",
      workspaceId: "ws", actorId: "parity", payload: { principalId: "p2", removed } }) }));
  t["purge.2.p2-key"] = await outcome(() => mods.exec.resolveExecutionCredential(d.exec, { workspaceId: "ws", principalId: "p2" }));
  t["purge.3.p-key-kept"] = await outcome(() => mods.exec.resolveExecutionCredential(d.exec, { workspaceId: "ws", principalId: "p" }));
  t["principal.1.delete-p"] = await rawOutcome(() => ctx.kernel.execute(sql`DELETE FROM principals WHERE id = 'p'`));
  t["principal.2.p-key"] = await outcome(() => mods.exec.getExecutionCredential(d.exec, { workspaceId: "ws", principalId: "p" }));
  t["principal.3.mcp"] = await outcome(() => mods.mcp.listExternalMcpServerViews(d.mcp, "ws"));
  t["principal.4.site-kept"] = await outcome(() => mods.site.resolveSiteAssistantApiKey(d.site, { workspaceId: "ws" }));
  t["workspace.1.delete-ws2"] = await rawOutcome(() => ctx.kernel.execute(sql`DELETE FROM workspaces WHERE id = 'ws2'`));
  t["workspace.2.site"] = await outcome(() => mods.site.getSiteAssistantCredential(d.site, { workspaceId: "ws2" }));
  t["workspace.3.q-key"] = await outcome(() => mods.exec.getExecutionCredential(d.exec, { workspaceId: "ws2", principalId: "q" }));
  t["workspace.4.sources"] = await outcome(() => mods.source.listSourceControlCredentials(d.source, { workspaceId: "ws2" }));
  t["workspace.5.ws-untouched"] = await outcome(() => mods.source.listSourceControlCredentials(d.source, { workspaceId: "ws" }));
  return t;
}

/** Read-transcript groups: one per vault kind (primary workspace/principal), isolation, order. */
const primary = (key: string) => key.endsWith("@ws") || key.endsWith("@ws/p");

export const READ_KINDS: [string, RegExp][] = [
  ["site-assistant", /^site\./], ["personal-execution", /^exec\./], ["media-provider", /^media\./], ["custom", /^custom\./],
  ["publish-peer", /^peer\./], ["database-destination", /^destination\./],
  ["vendor (with the folded publish_credential_sets)", /^vendor\./], ["source-control", /^source\./],
  ["mcp-env (enabled configs)", /^mcp\.enabled@/], ["mcp-auth (server views)", /^mcp\.list@/],
];
export const READ_GROUPS: { name: string; select: (key: string) => boolean; ordered: boolean }[] = [
  ...READ_KINDS.map(([name, pattern]) => ({ name, select: (key: string) => pattern.test(key) && primary(key), ordered: false })),
  { name: "isolation: a second and an empty workspace see only their own rows", ordered: false,
    select: (key: string) => /@ws2$|@ws-empty$/.test(key) },
  { name: "isolation: personal keys stay per principal and per workspace", ordered: false,
    select: (key: string) => key.startsWith("exec.") && !key.endsWith("@ws/p") },
  { name: "order: custom-credential and peer lists", ordered: true, select: (key: string) => /^(custom|peer)\.list@/.test(key) },
  { name: "order: vendor and source-control lists, defaults first-class", ordered: true,
    select: (key: string) => /^(vendor|source)\.(list|hasDefault|resolveDefault)/.test(key) },
  { name: "order: MCP server views and enabled configs", ordered: true, select: (key: string) => /^mcp\./.test(key) },
];

/** One reviewed behaviour change: the golden outcome at each matching key is rewritten into the
 * reviewed new one before comparing. Anything else that differs fails the test. The P0 audit
 * (`post-release-plans-2026-10-11/P0-ASSERTION-AUDIT.md`, "PARITY_DELTAS seed") lists the deltas
 * outside these transcripts (OAuth replay, sealed state, checkKey, commerce); they are pinned by
 * their own suites. */
export interface ParityDelta {
  transcript: "read" | "write" | "cascade";
  keys: RegExp;
  before: string;
  after: string;
  reason: string;
  apply: (golden: Outcome) => Outcome;
}

type Row = Record<string, unknown>;
const mapOk = (map: (value: Loose) => unknown) => (golden: Outcome): Outcome => "ok" in golden ? { ok: map(structuredClone(golden.ok)) } : golden;
const dropTokenHint = mapOk((value: Row | null) => { if (value) delete value.tokenHint; return value; });

/** 1d96267e3 adds explicit compatibility to summaries, not decrypted connection results.
 * Expected fields come only from the pre-vault transcript, independently of today's stores.
 */
const customCompatibility = mapOk((value: Row | Row[]) => {
  const add = (row: Row) => ({ ...row, credentialType: "custom", worksFor: [] });
  return Array.isArray(value) ? value.map(add) : add(value);
});
const publishCompatibility = mapOk((value: Row | Row[]) => {
  const add = (row: Row) => ({ ...row, credentialType: "vendor", worksFor: [row.vendorId],
    publishHosts: [row.providerId], defaultFor: row.isDefault ? [row.providerId] : [] });
  return Array.isArray(value) ? value.map(add) : add(value);
});

export const PARITY_DELTAS: readonly ParityDelta[] = [
  { transcript: "read", keys: /^custom\.list@ws$/, before: "legacy row with NULL column hides the sealed login", after: "username 'login'",
    reason: "P0 audit H1 fix: a NULL column never meant a clear; boot moves the sealed login to metadata (vault-boot.integration.test.ts)",
    apply: mapOk((rows: Row[]) => rows.map(row => row.id === "custom" ? { ...row, username: "login" } : row)) },
  { transcript: "write", keys: /^custom\.9\.list$/, before: "legacy login hidden", after: "username 'login'", reason: "same as H1 above",
    apply: mapOk((rows: Row[]) => rows.map(row => row.id === "custom" ? { ...row, username: "login" } : row)) },
  { transcript: "write", keys: /^vendor\.9\.resolve-promoted$/, before: "promotion picked the newest-created row", after: "updatedAt desc, then binary id desc",
    reason: "DBMERGE-PLAN §2b: deterministic promotion tie-break (equal updatedAt here, so the highest id wins)",
    apply: () => ({ ok: { id: "tie-b", label: "Tie B", connection: { token: "tie-b-token-1234567890", providerId: "tie-host" } } }) },
  { transcript: "write", keys: /^vendor\.11\.list$/, before: "'New' promoted", after: "'Tie B' promoted", reason: "same tie-break",
    apply: mapOk((rows: Row[]) => rows.map(row => row.vendorId === "vendor-tie" ? { ...row, isDefault: row.id === "tie-b" } : row)) },
  { transcript: "write", keys: /^custom\.(3|6)\./, before: "update summary had no token hint", after: "hint from vault last4/tokenLength",
    reason: "additive: every vault summary derives the hint; the list view already showed it",
    apply: mapOk((row: Row) => ({ ...row, tokenHint: { length: 20, last4: "7890" } })) },
  { transcript: "read", keys: /^destination\.get@/, before: "hint derived from the address", after: "no hint",
    reason: "P0 audit delta 3: an address is not a token (probes-and-cards.test.ts:92)", apply: dropTokenHint },
  { transcript: "write", keys: /^destination\.[68]\.get$/, before: "hint", after: "no hint", reason: "same", apply: dropTokenHint },
  { transcript: "cascade", keys: /^workspace\.2\.site$/, before: "deleted workspace's site key orphaned and still readable", after: "unset",
    reason: "intended (2026-10-12): secrets_vault.workspace_id is ON DELETE CASCADE (9b20083b6), like every other workspace key; site_assistant_credentials had no FK",
    apply: () => ({ ok: { isSet: false, masked: null, tokenHint: null, provider: "google", baseUrl: null, model: null, updatedAt: null } }) },
  { transcript: "read", keys: /^custom\.list@/, before: "custom summary", after: "explicit custom subtype and empty compatibility",
    reason: "1d96267e3: unmigrated custom credentials default to worksFor []", apply: customCompatibility },
  { transcript: "write", keys: /^custom\.(1\.create|3\.rename|6\.clear-username|9\.list)$/, before: "custom summary", after: "explicit subtype and compatibility",
    reason: "1d96267e3: the same summary contract applies to writes", apply: customCompatibility },
  { transcript: "read", keys: /^vendor\.list@/, before: "publish summary", after: "subtype, vendor compatibility and per-host defaults",
    reason: "1d96267e3: legacy vendor rows retain their provider compatibility", apply: publishCompatibility },
  { transcript: "write", keys: /^vendor\.(1\.create-default|2\.list|3\.rotate|5\.set-default-other|6\.list|11\.list)$/, before: "publish summary", after: "explicit compatibility and per-host defaults",
    reason: "1d96267e3: the same summary contract applies to writes", apply: publishCompatibility },
  { transcript: "write", keys: /^media\.3\.get-unchanged$/, before: "whole-map save tombstoned the omitted legacy 'media-test' row", after: "'media-test' kept",
    reason: "7bb4f6c3/7a1447ab: an admin save tombstones only omitted BUILT-IN ids; any other row (a plugin vendor's key) is kept",
    apply: mapOk((map: Row) => ({ ...map, "media-test": { model: "media-model", apiKeyConfigured: true, apiKeyHint: { length: 5, last4: null } } })) },
];

/** Real behaviour differences these transcripts found (2026-10-11). Each is pinned by a `todo`
 * test that asserts the OLD behaviour and is excluded from the other parity assertions, so the
 * rest of the transcript stays guarded. Fixing one = deleting its entry. */
export interface KnownParityIssue { id: string; transcript: "read" | "write"; keys: RegExp; note: string; orderOnly?: boolean }
export const KNOWN_PARITY_ISSUES: readonly KnownParityIssue[] = [
  // R1-R3 fixed 2026-10-12: destination singleton read, label-ordered lists, source-control username.
];

/** The golden transcript with every reviewed delta applied. */
export function expectedTranscript(golden: Transcript, transcript: ParityDelta["transcript"], deltas: readonly ParityDelta[] = PARITY_DELTAS): Transcript {
  const out: Transcript = structuredClone(golden);
  for (const delta of deltas) {
    if (delta.transcript !== transcript) continue;
    for (const key of Object.keys(out)) if (delta.keys.test(key)) out[key] = delta.apply(out[key]);
  }
  return out;
}

/** Lists compared as sets: rows sorted by id (order has its own assertions). */
export function unordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unordered).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, unordered(entry)]));
  return value;
}

export function knownIssue(transcript: "read" | "write", key: string): KnownParityIssue | undefined {
  return KNOWN_PARITY_ISSUES.find(issue => issue.transcript === transcript && issue.keys.test(key));
}
