import { homedir } from "node:os";
import { join } from "node:path";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import { resolveSiteKeyId, siteKeySources } from "#src/features/webhooks/site-key-sources";
import { createTovuAgentPluginLifecycle, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { loadBundledDeployTargetRegistry, loadDeployTargetRegistry } from "#src/features/deployments/deploy-targets/registry";
import { sql } from "kysely";
import type { Clock } from "@jini-ai/core/primitives";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { AesGcmSecretSealer, credentialTokenHint, type KeyringPort, type SiteKeyHandle, type SecretSealerPort } from "@jini-ai/platform/secrets";
import { buildVaultAad, VaultError, VAULT_KINDS, type VaultKind, type VaultMeta, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { legacyTargetProvider, legacyVaultAad, normalizeLegacyVaultPayload, type VaultLegacyContext } from "./vault-legacy-codecs.js";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";

const INVALID_META = "invalid-meta";


type BlockReason = "missing-key" | "unopenable" | typeof INVALID_META | "catalog-unavailable" | "conflict";
export interface VaultKindCoverage {
  rows: number; envelopes: number; attempted: number; succeeded: number; dropped: number; blocked: number;
  legacyRemaining: number; unopenable: number;
}
export interface VaultBootReport {
  green: boolean;
  kinds: Record<VaultKind, VaultKindCoverage>;
  /** Safe identity/reason only; errors, plaintext and ciphertext never enter diagnostics. */
  flagged: { id: string; kind: VaultKind; reason: BlockReason }[];
}
export interface VaultBootInput {
  kernel: StorageKernel<unknown>; siteId: string; workspaceId: string; clock: Clock;
  keyring: KeyringPort; sealer: SecretSealerPort; registry: ReturnType<typeof createTovuVaultKinds>;
}
class RowBlocked extends Error {
  constructor(readonly reason: BlockReason) { super(`vault normalization: ${reason}`); }
}

/** Original context is host metadata, structurally checked before calling an old codec. */
export function legacyContext({ record }: { record: VaultRecord }): VaultLegacyContext | null {
  if (record.meta.legacyAad === undefined) return null;
  const value = legacyMetadataObject({ value: record.meta.legacyAad });
  const migration = legacyMetadataObject({ value: record.meta.migration });
  if (migration.mappedId !== record.id || !hasLegacyIdentityFields({ value }) ||
    ![value.principalId, value.provider, value.serverId].every(field => field === null || typeof field === "string") ||
    ["table", "workspaceId", "id", "principalId", "provider", "serverId", "aadVersion"].some(key => migration[key] !== value[key])) {
    throw new RowBlocked(INVALID_META);
  }
  return value as unknown as VaultLegacyContext;
}

function legacyMetadataObject({ value }: { value: unknown }, _options = {}): VaultMeta {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new RowBlocked(INVALID_META);
  return value as VaultMeta;
}

function hasLegacyIdentityFields({ value }: { value: VaultMeta }, _options = {}): boolean {
  return typeof value.table === "string" && typeof value.workspaceId === "string" &&
    typeof value.id === "string" && typeof value.aadVersion === "number";
}

/** Resolve a moved legacy row's exact target scope. A taken label means the moved row is a
 * duplicate and is dropped; otherwise keep its label and preserve conflicting defaults.
 * @complexity O(group size) time/space; one metadata-only scope read, no ciphertext hydration.
 */
async function targetGroup({ input, record, provider }: { input: VaultBootInput; record: VaultRecord; provider: string | null },
  _options = {},
): Promise<{ label: string; isDefault: boolean } | null> {
  if (provider === record.provider) return { label: record.label, isDefault: record.isDefault };
  const principalCondition = record.principalId === null ? sql`principal_id IS NULL` : sql`principal_id=${record.principalId}`;
  const providerCondition = provider === null ? sql`provider IS NULL` : sql`provider=${provider}`;
  const rows = await input.kernel.query<{ id: string; label: string; is_default: boolean | number }>(sql`
    SELECT id,label,is_default FROM secrets_vault WHERE workspace_id=${record.workspaceId} AND kind=${record.kind}
      AND owner_key=${record.ownerKey}
      AND ${principalCondition}
      AND ${providerCondition} AND id<>${record.id}`);
  if (rows.some(row => row.label === record.label)) return null;
  return { label: record.label, isDefault: record.isDefault && !rows.some(row => row.is_default === true || row.is_default === 1) };
}

/** Return null for a moved duplicate before crypto; otherwise open under precisely one historical
 * AAD, normalize, validate, re-seal and reopen/compare.
 * No failed row is written with new ciphertext. Metadata-only rows need no key.
 * @complexity O(payload + metadata + target group size) time/space, at most two opens and one seal.
 */
async function normalizedRecord({ input, record, legacy, previous = input.sealer }: LegacyRecordInput): Promise<VaultRecord | null> {
  const provider = normalizationProvider({ input, record, legacy });
  const group = await targetGroup({ input, record, provider });
  if (group === null) return null;
  const { plaintext, key } = await openLegacyRecord({ input, record, legacy, previous });
  const { normalized, meta: parsedMeta } = parseLegacyRecord({ input, record, legacy, plaintext });
  let meta = parsedMeta;
  if (meta.migration !== null && typeof meta.migration === "object" && !Array.isArray(meta.migration)) {
    meta = { ...meta, migration: { ...meta.migration, mappedLabel: group.label, mappedProvider: normalized.provider } };
  }
  const replacement: VaultRecord = { ...record, ...group, provider: normalized.provider, meta,
    revision: record.revision + 1, updatedAt: new Date(input.clock.nowMs()).toISOString(), last4: null, tokenLength: null };
  await sealNormalizedRecord({ input, replacement, normalized, key });
  return replacement;
}

type LegacyRecordInput = { input: VaultBootInput; record: VaultRecord; legacy: VaultLegacyContext; previous?: Pick<SecretSealerPort, "open"> };

function normalizationProvider({ input, record, legacy }: LegacyRecordInput, _options = {}): string | null {
  let provider = record.provider;
  if (record.sealed && legacy.table === "publish_credential_sets") {
    // The catalog owns provider reassignment; detect duplicates without opening their ciphertext.
    try {
      legacyVaultAad({ record, legacy });
      provider = legacyTargetProvider({ record, legacy, policy: input.registry.policy }).provider;
    } catch (error) {
      throw new RowBlocked(error instanceof Error && error.message === "VAULT_CATALOG_UNAVAILABLE" ? "catalog-unavailable" : INVALID_META);
    }
  }
  return provider;
}

async function openLegacyRecord({ input, record, legacy, previous = input.sealer }: LegacyRecordInput, _options = {}): Promise<{ plaintext: string | null; key: SiteKeyHandle }> {
  let plaintext: string | null = null;
  let key!: SiteKeyHandle; // Non-null payloads require plaintext opened after key acquisition.
  if (record.sealed) {
    try { key = await input.keyring.activeKey({}); } catch { throw new RowBlocked("missing-key"); }
    try { plaintext = await previous.open({ sealed: record.sealed }, { aad: legacyVaultAad({ record, legacy }) }); }
    catch { throw new RowBlocked("unopenable"); }
  } else {
    // Even an empty envelope must not erase an unsupported or mismatched lineage marker.
    try { legacyVaultAad({ record, legacy }); } catch { throw new RowBlocked(INVALID_META); }
  }
  return { plaintext, key };
}

function parseLegacyRecord({ input, record, legacy, plaintext }: LegacyRecordInput & { plaintext: string | null }, _options = {}) {
  let normalized: ReturnType<typeof normalizeLegacyVaultPayload>;
  let meta: VaultMeta;
  try {
    normalized = normalizeLegacyVaultPayload({ record, legacy, plaintext, policy: input.registry.policy });
    meta = input.registry.metaParsers[record.kind]({ meta: normalized.meta, provider: normalized.provider });
    assertCredentialFreeField({ value: record.label, field: "label" });
  } catch (error) {
    throw new RowBlocked(error instanceof Error && error.message === "VAULT_CATALOG_UNAVAILABLE" ? "catalog-unavailable" : INVALID_META);
  }
  return { normalized, meta };
}

async function sealNormalizedRecord({ input, replacement, normalized, key }: {
  input: VaultBootInput; replacement: VaultRecord; normalized: ReturnType<typeof normalizeLegacyVaultPayload>; key: SiteKeyHandle;
}, _options = {}): Promise<void> {
  if (normalized.payload !== null) {
    const payloadText = JSON.stringify(normalized.payload);
    const aad = buildVaultAad(replacement);
    try {
      replacement.sealed = await input.sealer.seal({ plaintext: payloadText, key, aad });
      if (await input.sealer.open({ sealed: replacement.sealed }, { aad }) !== payloadText) throw new RowBlocked("unopenable");
    } catch { throw new RowBlocked("unopenable"); }
    if (normalized.hintToken !== undefined) {
      const hint = credentialTokenHint({ token: normalized.hintToken });
      replacement.last4 = hint.last4;
      replacement.tokenLength = hint.length;
    }
  }
}

/** CAS the whole normalization result, or delete a moved duplicate when after is null.
 * The raw host write permits legacy provider reassignment,
 * which Jini's ordinary put correctly rejects as an immutable-identity change. Writers still
 * share the exact Jini workspace lock; no second vault repository or crypto implementation.
 * @throws RowBlocked on revision conflict; propagates storage errors.
 * @complexity O(payload + metadata) time/space; one guarded write, no crypto.
 */
async function saveNormalized({ input, before, after }: { input: VaultBootInput; before: VaultRecord; after: VaultRecord | null }): Promise<void> {
  if (after === null) {
    const rows = await input.kernel.query<{ id: string }>(sql`DELETE FROM secrets_vault
      WHERE workspace_id=${before.workspaceId} AND id=${before.id} AND revision=${before.revision} RETURNING id`);
    if (rows.length !== 1) throw new RowBlocked("conflict");
    return;
  }
  const envelope = normalizedEnvelope({ record: after });
  const rows = await input.kernel.query<{ id: string }>(sql`UPDATE secrets_vault SET
    provider=${after.provider}, label=${after.label}, is_default=${input.kernel.dialect === "sqlite" ? Number(after.isDefault) : after.isDefault},
    sealed_key_id=${envelope.keyId}, sealed_ciphertext=${envelope.ciphertext},
    sealed_nonce=${envelope.nonce}, sealed_alg=${envelope.alg},
    last4=${after.last4}, token_length=${after.tokenLength}, meta=${JSON.stringify(after.meta)},
    revision=${after.revision}, updated_at=${after.updatedAt}
    WHERE workspace_id=${before.workspaceId} AND id=${before.id} AND revision=${before.revision} RETURNING id`);
  if (rows.length !== 1) throw new RowBlocked("conflict");
}

function normalizedEnvelope({ record }: { record: VaultRecord }, _options = {}) {
  return { keyId: record.sealed?.keyId ?? null, ciphertext: record.sealed?.ciphertext ?? null,
    nonce: record.sealed?.nonce ?? null, alg: record.sealed?.alg ?? null };
}

/** Safe flag-only CAS leaves ciphertext, legacy identity and other metadata intact for recovery. */
async function flagRecord({ input, record, reason }: { input: VaultBootInput; record: VaultRecord; reason: BlockReason }): Promise<void> {
  if (record.meta.normalization === reason) return;
  await input.kernel.execute(sql`UPDATE secrets_vault SET meta=${JSON.stringify({ ...record.meta, normalization: reason })}, revision=revision+1
    WHERE workspace_id=${record.workspaceId} AND id=${record.id} AND revision=${record.revision}`);
}

/** Boot runs before consumers are constructed. The shared operation lock is the first effect;
 * the transaction then locks `secrets_vault:<workspaceId>` exactly as ALL Jini SQL writers do.
 * Moved duplicates are counted and dropped; missing keys keep surviving rows flagged, and normal
 * envelopes are checked too: no false green report.
 * @throws Lock denial, I/O errors or commit failure; row failures have safe flagged outcomes.
 * @complexity O(n + sum of moved target group sizes + payload work) time; O(n + largest group +
 * largest payload) space. One pass over n workspace rows, not a per-request inventory path.
 * No old-process draining.
 */
export async function normalizeVaultAtBoot(input: VaultBootInput,
  { report: observe = () => {} }: { report?: (input: VaultBootReport) => void } = {},
): Promise<VaultBootReport> {
  const deps = { clock: input.clock };
  const acquired = await acquireOperationLock({ deps, input: { siteId: input.siteId, operationKind: "vault-normalization" } });
  if (!acquired.ok) throw new Error(acquired.error.code);
  try {
    const report = await input.kernel.transaction(async () => {
      await input.kernel.lockKey(`secrets_vault:${input.workspaceId}`);
      const repo = new SqlSecretsVaultRepo({ kernel: input.kernel as StorageKernel<SecretsVaultDatabase> });
      // Unopened sites retain the old kind until 0013 is activated for their database. Count it
      // without changing authenticated identity; only an explicit legacyAad marker requests resealing.
      const report: VaultBootReport = { green: false, flagged: [], kinds: Object.fromEntries([...VAULT_KINDS, "custom" as const].map(kind => [kind,
        { rows: 0, envelopes: 0, attempted: 0, succeeded: 0, dropped: 0, blocked: 0, legacyRemaining: 0, unopenable: 0 }])) as VaultBootReport["kinds"] };
      const identities = await input.kernel.query<{ id: string }>(sql`SELECT id FROM secrets_vault WHERE workspace_id=${input.workspaceId} ORDER BY id`);
      for (const { id } of identities) {
        await normalizeBootRow({ input, repo, report, id });
      }
      report.green = report.flagged.length === 0 && Object.values(report.kinds).every(kind => kind.legacyRemaining === 0 && kind.unopenable === 0);
      return report;
    });
    observe(report);
    return report;
  } finally {
    await releaseOperationLock({ deps, input: { siteId: input.siteId, handle: acquired.value } });
  }
}

async function validateCurrentRecord({ input, record }: { input: VaultBootInput; record: VaultRecord }, _options = {}): Promise<void> {
  // Ordinary feature reads have no legacy fallback; readiness proves that exact path.
  try { input.registry.metaParsers[record.kind]({ meta: record.meta, provider: record.provider }); } catch { throw new RowBlocked(INVALID_META); }
  const { normalization: _flag, ...meta } = record.meta;
  if (record.sealed) {
    try { await input.keyring.activeKey({}); } catch { throw new RowBlocked("missing-key"); }
    try {
      const payload = JSON.parse(await input.sealer.open({ sealed: record.sealed }, { aad: buildVaultAad(record) }));
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) throw new RowBlocked("unopenable");
    }
    catch { throw new RowBlocked("unopenable"); }
  }
  if (record.meta.normalization !== undefined) await input.kernel.execute(sql`UPDATE secrets_vault
    SET meta=${JSON.stringify(meta)}, revision=revision+1 WHERE workspace_id=${record.workspaceId} AND id=${record.id} AND revision=${record.revision}`);
}

async function normalizeBootRow({ input, repo, report, id }: {
  input: VaultBootInput; repo: Pick<VaultRepoPort, "find">; report: VaultBootReport; id: string;
}, _options = {}): Promise<void> {
  let record = await repo.find({ workspaceId: input.workspaceId, id });
  if (!record) throw new RowBlocked("conflict");
  const coverage = report.kinds[record.kind];
  coverage.rows += 1;
  if (record.sealed) coverage.envelopes += 1;
  const hasLegacy = record.meta.legacyAad !== undefined;
  if (hasLegacy) coverage.attempted += 1;
  try {
    const legacy = legacyContext({ record });
    if (legacy) {
      const after = await normalizedRecord({ input, record, legacy });
      await saveNormalized({ input, before: record, after });
      if (after === null) { coverage.dropped += 1; return; }
      record = after;
      coverage.succeeded += 1;
    } else {
      await validateCurrentRecord({ input, record });
    }
  } catch (error) {
    await reportBlockedRow({ input, record, error, coverage, hasLegacy, report, id });
  }
}

function blockedRowReason({ error }: { error: unknown }, _options = {}): BlockReason {
  if (error instanceof RowBlocked) return error.reason;
  return error instanceof VaultError && error.code === "conflict" ? "conflict" : INVALID_META;
}

async function reportBlockedRow({ input, record, error, coverage, hasLegacy, report, id }: {
  input: VaultBootInput; record: VaultRecord; error: unknown; coverage: VaultKindCoverage;
  hasLegacy: boolean; report: VaultBootReport; id: string;
}, _options = {}): Promise<void> {
  if (!(error instanceof RowBlocked) && !(error instanceof Error && error.name === "VaultError")) throw error;
  const reason = blockedRowReason({ error });
  await flagRecord({ input, record, reason });
  coverage.blocked += 1;
  if (hasLegacy) coverage.legacyRemaining += 1;
  if (reason === "unopenable" || reason === "missing-key") coverage.unopenable += 1;
  report.flagged.push({ id, kind: record.kind, reason });
}

/** Host wiring shared by folder boot and direct composition; both await it before consumers.
 * Reuses the installed contribution loader and the bundled deploy fallback from the old backfill.
 * Missing keys are resolved only inside normalization, so a flagged report remains observable.
 * @complexity O(plugin catalog + vault rows); normalization owns the lock, CAS and crypto work.
 */
export async function normalizeSiteVaultAtBoot<Database>(required: {
  kernel: StorageKernel<Database>; workspaceId: string; siteDir?: string; clock: Clock;
}, optional: {
  keyring?: KeyringPort; sealer?: SecretSealerPort; loadContributions?: LoadPluginContributions;
  report?: (report: VaultBootReport) => void;
} = {}): Promise<VaultBootReport> {
  const keyring = optional.keyring ?? new EnvOrFileKeyring({ sources: siteKeySources({
    mode: resolveRuntimeMode(), env: process.env, home: homedir(), cwd: process.cwd(),
    siteKeyId: required.siteDir ? resolveSiteKeyId({ siteDir: required.siteDir }) : undefined,
  }) });
  const sealer = optional.sealer ?? new AesGcmSecretSealer({ keyring });
  const registry = await loadSiteVaultKinds(required, { loadContributions: optional.loadContributions });
  // Normalization uses raw SQL, independent of the caller's typed content-query surface.
  return normalizeVaultAtBoot({ ...required, kernel: required.kernel as unknown as StorageKernel<unknown>,
    siteId: required.workspaceId, keyring, sealer, registry }, {
    report: optional.report ?? (report => {
      // Safe coverage only: neither crypto errors nor secret material belong in boot logs.
      if (report.green) console.info("vault boot coverage", report);
      else console.warn("vault boot coverage flagged", report);
    }),
  });
}

/** Shared catalog resolution for boot and key recovery; no second legacy provider owner. */
export async function loadSiteVaultKinds(input: { workspaceId: string; siteDir?: string },
  { loadContributions: loadContributionsOverride }: { loadContributions?: LoadPluginContributions } = {},
): Promise<ReturnType<typeof createTovuVaultKinds>> {
  const loadContributions = loadContributionsOverride ?? createTovuAgentPluginLifecycle({
    layout: resolveAgentPluginLayout({ siteDir: input.siteDir }),
  }).loadPluginContributions;
  const registries = await Promise.all([
    loadDeployTargetRegistry({ workspaceId: input.workspaceId }, { loadContributions }),
    // Every bundled plugin's source, not one: a legacy publish row must resolve its vendor even
    // before the hosting plugin that now owns its target has been seeded and switched on.
    loadBundledDeployTargetRegistry({ sourceRoot: join(resolveProductRoot(), "content", "agent-plugins") }),
  ]);
  return createTovuVaultKinds({ policy: {
    validateMeta: ({ meta }) => meta,
    legacyPublishCredential: ({ providerId }) => registries.map(registry => registry.get(providerId)?.descriptor.credential).find(spec => spec !== undefined),
    tokenField: ({ kind, provider }) => {
      if (kind === "vendor") return registries.flatMap(registry => registry.list()).find(target => target.descriptor.credential?.vendorId === provider)?.descriptor.credential?.tokenField;
      return kind === "custom" || kind === "source-control" ? "token" : undefined;
    },
  } });
}

/** Recover through boot's shared normalization: delete moved duplicates, otherwise validate and
 * re-seal/reopen the legacy envelope.
 * Caller holds the Jini workspace writer lock; the original revision still guards the commit.
 * @complexity O(payload + metadata + target group size) time/space; one CAS write, no crypto for drops.
 */
export async function recoverLegacyVaultRecord(required: {
  input: VaultBootInput; record: VaultRecord; previous: Pick<SecretSealerPort, "open">;
}, _options = {}): Promise<void> {
  const legacy = legacyContext({ record: required.record });
  if (!legacy) throw new RowBlocked(INVALID_META);
  const after = await normalizedRecord({ ...required, legacy });
  await saveNormalized({ input: required.input, before: required.record, after });
}
