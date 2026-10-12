import { homedir } from "node:os";
import { join } from "node:path";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import { resolveSiteKeyId, siteKeySources } from "#src/features/webhooks/site-key-sources";
import { createTovuAgentPluginLifecycle, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import { resolveAgentPluginLayout } from "#src/features/agent-plugins/layout";
import { loadDeployTargetRegistry, loadDeployTargetRegistryFromSource } from "#src/features/deployments/deploy-targets/registry";
import { sql } from "kysely";
import type { Clock } from "@jini-ai/core/primitives";
import { deriveAvailableName } from "@jini-ai/core/naming";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { AesGcmSecretSealer, credentialTokenHint, type KeyringPort, type SiteKeyHandle, type SecretSealerPort } from "@jini-ai/platform/secrets";
import { buildVaultAad, SecretsVaultService, VaultError, VAULT_KINDS, type VaultKind, type VaultMeta, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import type { StorageKernel } from "#src/platform/db/kernel/port";
import { legacyVaultAad, normalizeLegacyVaultPayload, type VaultLegacyContext } from "./vault-legacy-codecs.js";
import { createTovuVaultKinds } from "./vault-kinds.js";

type BlockReason = "missing-key" | "unopenable" | "invalid-meta" | "catalog-unavailable" | "conflict";
export interface VaultKindCoverage {
  rows: number; envelopes: number; attempted: number; succeeded: number; blocked: number;
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
  const value = record.meta.legacyAad;
  const migration = record.meta.migration;
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    migration === null || typeof migration !== "object" || Array.isArray(migration) || migration?.mappedId !== record.id ||
    typeof value.table !== "string" || typeof value.workspaceId !== "string" || typeof value.id !== "string" ||
    typeof value.aadVersion !== "number" ||
    ![value.principalId, value.provider, value.serverId].every(field => field === null || typeof field === "string") ||
    ["table", "workspaceId", "id", "principalId", "provider", "serverId", "aadVersion"].some(key => migration[key] !== value[key])) {
    throw new RowBlocked("invalid-meta");
  }
  return value as unknown as VaultLegacyContext;
}

/** Resolve a moved legacy group or repair its old machine label in the exact existing scope.
 * Preserve conflicting defaults; machine identity stays in migration provenance.
 * @complexity O(group size) time/space; one metadata-only scope read, no ciphertext hydration.
 */
async function targetGroup({ input, record, provider }: { input: VaultBootInput; record: VaultRecord; provider: string | null },
  { preferred = record.label, legacyCopy = false }: { preferred?: string; legacyCopy?: boolean } = {},
): Promise<{ label: string; isDefault: boolean }> {
  if (provider === record.provider && !legacyCopy) return { label: record.label, isDefault: record.isDefault };
  const rows = await input.kernel.query<{ id: string; label: string; is_default: boolean | number }>(sql`
    SELECT id,label,is_default FROM secrets_vault WHERE workspace_id=${record.workspaceId} AND kind=${record.kind}
      AND owner_key=${record.ownerKey}
      AND ${record.principalId === null ? sql`principal_id IS NULL` : sql`principal_id=${record.principalId}`}
      AND ${provider === null ? sql`provider IS NULL` : sql`provider=${provider}`} AND id<>${record.id}`);
  const taken = new Set(rows.map(row => row.label));
  if (legacyCopy) taken.add(preferred);
  const label = await deriveAvailableName({ base: preferred,
    isTaken: async ({ candidate }) => taken.has(candidate),
    withSuffix: ({ base, suffix }) => `${base} (legacy copy${suffix === 2 ? "" : ` ${suffix - 1}`})`,
    exhaustionMessage: () => "vault normalization: conflict",
  }, { maxAttempts: taken.size + 1, onExhausted: () => { throw new RowBlocked("conflict"); } });
  return { label, isDefault: record.isDefault && !rows.some(row => row.is_default === true || row.is_default === 1) };
}

/** Repair previously persisted machine labels through Jini's revision CAS, with payload omitted.
 * Labels are outside buildVaultAad: no key read, open or seal; ciphertext and hints stay intact.
 * @throws VaultError on validation/CAS failure, or a host scope-read error.
 * @complexity O(group size + metadata size) time/space for affected rows; O(1) otherwise.
 */
async function repairLegacyLabel({ input, record, vault }: {
  input: VaultBootInput; record: VaultRecord; vault: SecretsVaultService;
}, _options = {}): Promise<VaultRecord> {
  const preferred = record.label.replace(/ \(legacy:.*:\d+\)$/, "");
  if (preferred === record.label) return record;
  assertCredentialFreeField({ value: preferred, field: "label" });
  const { label } = await targetGroup({ input, record, provider: record.provider }, { preferred, legacyCopy: true });
  const { configured: _configured, ...saved } = await vault.put({
    workspaceId: record.workspaceId, id: record.id, kind: record.kind, ownerKey: record.ownerKey,
    principalId: record.principalId, binding: record.binding, provider: record.provider,
    label, isDefault: record.isDefault, expectedRevision: record.revision, meta: record.meta,
  });
  return { ...record, ...saved };
}

/** Open under precisely one historical AAD, normalize, validate, re-seal and reopen/compare.
 * No failed row is written with new ciphertext. Metadata-only rows need no key.
 * @complexity O(payload + metadata + target group size), at most two opens and one seal.
 */
async function normalizedRecord({ input, record, legacy, previous = input.sealer }: { input: VaultBootInput; record: VaultRecord; legacy: VaultLegacyContext; previous?: Pick<SecretSealerPort, "open"> }): Promise<VaultRecord> {
  let plaintext: string | null = null;
  let key: SiteKeyHandle | undefined;
  if (record.sealed) {
    try { key = await input.keyring.activeKey({}); } catch { throw new RowBlocked("missing-key"); }
    try { plaintext = await previous.open({ sealed: record.sealed }, { aad: legacyVaultAad({ record, legacy }) }); }
    catch { throw new RowBlocked("unopenable"); }
  } else {
    // Even an empty envelope must not erase an unsupported or mismatched lineage marker.
    try { legacyVaultAad({ record, legacy }); } catch { throw new RowBlocked("invalid-meta"); }
  }
  let normalized: ReturnType<typeof normalizeLegacyVaultPayload>;
  let meta: VaultMeta;
  try {
    normalized = normalizeLegacyVaultPayload({ record, legacy, plaintext, policy: input.registry.policy });
    meta = input.registry.metaParsers[record.kind]({ meta: normalized.meta });
    assertCredentialFreeField({ value: record.label, field: "label" });
  } catch (error) {
    throw new RowBlocked(error instanceof Error && error.message === "VAULT_CATALOG_UNAVAILABLE" ? "catalog-unavailable" : "invalid-meta");
  }
  const group = await targetGroup({ input, record, provider: normalized.provider });
  if (meta.migration !== null && typeof meta.migration === "object" && !Array.isArray(meta.migration)) {
    meta = { ...meta, migration: { ...meta.migration, mappedLabel: group.label, mappedProvider: normalized.provider } };
  }
  const replacement: VaultRecord = { ...record, ...group, provider: normalized.provider, meta,
    revision: record.revision + 1, updatedAt: new Date(input.clock.nowMs()).toISOString(), last4: null, tokenLength: null };
  if (normalized.payload !== null) {
    if (!key) throw new RowBlocked("missing-key");
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
  return replacement;
}

/** CAS the whole normalization result. The raw host write permits legacy provider reassignment,
 * which Jini's ordinary put correctly rejects as an immutable-identity change. Writers still
 * share the exact Jini workspace lock; no second vault repository or crypto implementation.
 */
async function saveNormalized({ input, before, after }: { input: VaultBootInput; before: VaultRecord; after: VaultRecord }): Promise<void> {
  const rows = await input.kernel.query<{ id: string }>(sql`UPDATE secrets_vault SET
    provider=${after.provider}, label=${after.label}, is_default=${input.kernel.dialect === "sqlite" ? Number(after.isDefault) : after.isDefault},
    sealed_key_id=${after.sealed?.keyId ?? null}, sealed_ciphertext=${after.sealed?.ciphertext ?? null},
    sealed_nonce=${after.sealed?.nonce ?? null}, sealed_alg=${after.sealed?.alg ?? null},
    last4=${after.last4}, token_length=${after.tokenLength}, meta=${JSON.stringify(after.meta)},
    revision=${after.revision}, updated_at=${after.updatedAt}
    WHERE workspace_id=${before.workspaceId} AND id=${before.id} AND revision=${before.revision} RETURNING id`);
  if (rows.length !== 1) throw new RowBlocked("conflict");
}

/** Safe flag-only CAS leaves ciphertext, legacy identity and other metadata intact for recovery. */
async function flagRecord({ input, record, reason }: { input: VaultBootInput; record: VaultRecord; reason: BlockReason }): Promise<void> {
  if (record.meta.normalization === reason) return;
  await input.kernel.execute(sql`UPDATE secrets_vault SET meta=${JSON.stringify({ ...record.meta, normalization: reason })}, revision=revision+1
    WHERE workspace_id=${record.workspaceId} AND id=${record.id} AND revision=${record.revision}`);
}

/** Boot runs before consumers are constructed. The shared operation lock is the first effect;
 * the transaction then locks `secrets_vault:<workspaceId>` exactly as ALL Jini SQL writers do.
 * Missing keys keep rows flagged, and normal envelopes are checked too: no false green report.
 * @throws Lock denial, I/O errors or commit failure; row failures have safe flagged outcomes.
 * @complexity O(n) row reads/writes plus payload work; O(n) identities/report memory. This is a
 * one-time normalization pass, not a per-request inventory path. No old-process draining.
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
      const vault = new SecretsVaultService({ repo, keyring: input.keyring, sealer: input.sealer,
        metaParsers: input.registry.metaParsers, now: () => new Date(input.clock.nowMs()).toISOString(),
        authorize: async ({ context }) => {
          if (context.workspaceId !== input.workspaceId) throw new VaultError({ code: "context" });
        }, newId: () => { throw new VaultError({ code: "invalid-record" }); } });
      const report: VaultBootReport = { green: false, flagged: [], kinds: Object.fromEntries(VAULT_KINDS.map(kind => [kind,
        { rows: 0, envelopes: 0, attempted: 0, succeeded: 0, blocked: 0, legacyRemaining: 0, unopenable: 0 }])) as VaultBootReport["kinds"] };
      const identities = await input.kernel.query<{ id: string }>(sql`SELECT id FROM secrets_vault WHERE workspace_id=${input.workspaceId} ORDER BY id`);
      for (const { id } of identities) {
        let record = await repo.find({ workspaceId: input.workspaceId, id });
        if (!record) throw new RowBlocked("conflict");
        const coverage = report.kinds[record.kind];
        if (!coverage) throw new RowBlocked("invalid-meta");
        coverage.rows += 1;
        if (record.sealed) coverage.envelopes += 1;
        const hasLegacy = record.meta.legacyAad !== undefined;
        if (hasLegacy) coverage.attempted += 1;
        try {
          const legacy = legacyContext({ record });
          if (legacy) {
            const after = await normalizedRecord({ input, record, legacy });
            await saveNormalized({ input, before: record, after });
            record = after;
            record = await repairLegacyLabel({ input, record, vault });
            coverage.succeeded += 1;
          } else {
            record = await repairLegacyLabel({ input, record, vault });
            // Ordinary feature reads have no legacy fallback; readiness proves that exact path.
            const { normalization: _flag, ...meta } = record.meta;
            try { input.registry.metaParsers[record.kind]({ meta }); } catch { throw new RowBlocked("invalid-meta"); }
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
        } catch (error) {
          if (!(error instanceof RowBlocked) && !(error instanceof Error && error.name === "VaultError")) throw error;
          const reason = error instanceof RowBlocked ? error.reason
            : error instanceof VaultError && error.code === "conflict" ? "conflict" : "invalid-meta";
          await flagRecord({ input, record, reason });
          coverage.blocked += 1;
          if (hasLegacy) coverage.legacyRemaining += 1;
          if (reason === "unopenable" || reason === "missing-key") coverage.unopenable += 1;
          report.flagged.push({ id, kind: record.kind, reason });
        }
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
    loadDeployTargetRegistryFromSource({ pluginId: "deploy", packageRoot: join(resolveProductRoot(), "content", "agent-plugins", "deploy") }),
  ]);
  const registry = createTovuVaultKinds({ policy: {
    validateMeta: ({ meta }) => meta,
    legacyPublishCredential: ({ providerId }) => registries.map(registry => registry.get(providerId)?.descriptor.credential).find(spec => spec !== undefined),
    tokenField: ({ kind, provider }) => kind === "vendor"
      ? registries.flatMap(registry => registry.list()).find(target => target.descriptor.credential?.vendorId === provider)?.descriptor.credential?.tokenField
      : kind === "custom" || kind === "source-control" ? "token" : undefined,
  } });
  return registry;
}

/** Recover a legacy envelope through the same validation, normalization and verifying seal as boot.
 * Caller holds the Jini workspace writer lock; the original revision still guards the commit.
 */
export async function recoverLegacyVaultRecord(required: {
  input: VaultBootInput; record: VaultRecord; previous: Pick<SecretSealerPort, "open">;
}, _options = {}): Promise<void> {
  const legacy = legacyContext({ record: required.record });
  if (!legacy) throw new RowBlocked("invalid-meta");
  const after = await normalizedRecord({ ...required, legacy });
  await saveNormalized({ input: required.input, before: required.record, after });
}
