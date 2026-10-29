import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import { createConsoleLogger, type Logger } from "@jini-ai/core/primitives";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { AesGcmSecretSealer, type KeyringPort, type SecretSealerPort } from "@jini-ai/platform/secrets";
import { SecretsVaultService, VAULT_KINDS, VaultError, type VaultKind, type VaultCopyResult,
  type VaultMetaParsers } from "@jini-ai/platform/secrets/credential-sets";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openSqliteFileKernel, sqliteConnectionOf } from "#src/platform/db/kernel/drivers/sqlite";
import { tableExists } from "#src/platform/db/kernel/dialect";
import { createSitesWorkspace, type SitesWorkspace } from "#src/platform/site-dir/sites-home";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import { EnvOrFileKeyring, inspectSiteKeyMaterial } from "#src/features/webhooks/keyring.env";
import { resolveSiteKeyFingerprint, siteKeySourcesForSiteDir } from "#src/features/webhooks/site-key-sources";
import { bootLocalOwnerSignIn } from "../boot/local-owner-signin.js";
import { isLocalTovuHost, registeredSources, type RegisteredSiteSource as Source } from "./registered-sites.js";
import type { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import type { DeployTargetRegistry } from "#src/features/deployments/deploy-targets/types";
import { publishHostsForCredential } from "#src/features/deployments/publish-credentials/index";

export class LocalCredentialCopyError extends Error {
  constructor({ reasonCode, message }: { reasonCode: string; message: string }, _options = {}) {
    super(message);
    this.reasonCode = reasonCode;
  }
  readonly reasonCode: string;
}
export interface CredentialCopyChoice {
  siteId: string; name: string;
  keys: { kind: VaultKind; id: string; label: string; provider: string | null; last4?: string; worksFor: string[]; publishHosts?: string[] }[];
  reasonCode?: string; message?: string;
  /** Desktop's existing startSite(id) uses the canonical project folder as its ID. Never logged. */
  actionHint?: { action: "start-site"; siteId: string; desktopSiteId: string };
}
type Selection = { id: string; kind: VaultKind; revision: number; label: string; provider: string | null;
  owner_key: string; principal_id: string | null; binding: string | null; last4: string | null; token_length: number | null; meta: string | Record<string, unknown> };

/** Bind local folder discovery to Jini's existing vault operation. No source boot or key writes.
 * Inventory is O(sites + rows); copy performs bounded sequential SELECTs/CAS writes per selected ID.
 * Source connections are owning, read-only kernels and always close, including failed preflight.
 * @throws LocalCredentialCopyError for refused/unavailable sources. @complexity O(sites + selected rows).
 */
export function createLocalCredentialCopy(required: {
  targetKernel: ContentKernel; targetWorkspaceId: string; targetSiteDir: string;
  keyring: KeyringPort; sealer: SecretSealerPort; registry: ReturnType<typeof createTovuVaultKinds>;
  loadDeployTargets?: (workspaceId: string) => Promise<DeployTargetRegistry>;
}, { workspace = createSitesWorkspace({}), home = homedir(), localHost = isLocalTovuHost({}, {}),
  desktopStartAvailable = Boolean(bootLocalOwnerSignIn.acceptsCapability), logger = createConsoleLogger({ prefix: "" }),
  openSource = openSqliteFileKernel, operationId = randomUUID,
}: { workspace?: SitesWorkspace; home?: string; localHost?: boolean; desktopStartAvailable?: boolean;
  logger?: Pick<Logger, "info">; openSource?: typeof openSqliteFileKernel; operationId?: () => string } = {}) {
  const targetIdentity = resolveSiteDatabasePaths({ dir: required.targetSiteDir }, { workspace, reserveIdentity: false }).siteId;
  const targetFile = sqliteConnectionOf(required.targetKernel)?.name;
  const target = vault({ kernel: required.targetKernel, workspaceId: required.targetWorkspaceId,
    keyring: required.keyring, sealer: required.sealer, metaParsers: required.registry.metaParsers });
  const assertLocal = () => {
    if (!localHost) throw new LocalCredentialCopyError({ reasonCode: "local-host-only", message: "Copy keys on a local Tovu host." });
  };
  const sources = () => {
    assertLocal();
    return registeredSources({ workspace, targetSiteId: targetIdentity, targetSiteDir: required.targetSiteDir, targetFile });
  };
  const readSource = async <T>({ source, read }: { source: Source;
    read: (input: { service: SecretsVaultService; rows: Selection[]; workspaceId: string }) => Promise<T> }): Promise<T> => {
    if (resolveSiteStorage(source.dir).kind !== "sqlite") throw new LocalCredentialCopyError({
      reasonCode: "source-unsupported", message: "Only local SQLite sources are supported." });
    const resolved = resolveSiteDatabasePaths({ dir: source.dir }, { workspace, reserveIdentity: false });
    const kernel = openSource<SecretsVaultDatabase>(resolved.contentDbPath, { readOnly: true });
    try {
      if (!(await tableExists(kernel, "secrets_vault"))) throw needsUpgrade({ source });
      // Refuse the whole source: mixing normalized and legacy rows must never become a partial upgrade.
      // Stream metadata only: O(rows) inspection without buffering another site's whole vault.
      await kernel.run(async db => {
        for await (const row of db.selectFrom("secrets_vault").select(["kind", "meta"]).stream()) {
          const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
          if (Object.hasOwn(meta, "legacyAad") || row.kind === "custom") throw needsUpgrade({ source });
          if (row.kind === "vendor" && (meta.credentialType == null || !Array.isArray(meta.worksFor))) throw needsUpgrade({ source });
        }
      });
      const workspaceId = (await resolveWorkspace({ kernel: kernel as unknown as ContentKernel })).id;
      // EMPTY source env on both inspection and derivation: the target's TOVU_SITE_KEY is irrelevant.
      const keySources = siteKeySourcesForSiteDir({ siteDir: source.dir, mode: "local", env: {}, home, cwd: source.dir });
      const status = inspectSiteKeyMaterial({ sources: keySources }, { env: () => ({}) });
      const fingerprint = resolveSiteKeyFingerprint({ siteDir: source.dir });
      if (!status.active || (fingerprint !== undefined && fingerprint !== status.fingerprint)) throw new LocalCredentialCopyError({
        reasonCode: "source-key-unavailable", message: "Recover this source site's key in Tovu, then copy." });
      const keyring = new EnvOrFileKeyring({ sources: keySources }, { env: () => ({}) });
      const service = vault({ kernel: kernel as unknown as ContentKernel, workspaceId, keyring,
        sealer: new AesGcmSecretSealer({ keyring }), metaParsers: required.registry.metaParsers });
      // Selection metadata only; neither GET nor selection needs to hydrate an envelope.
      const rows = await kernel.query<Selection>(sql`SELECT id,kind,revision,label,provider,owner_key,principal_id,binding,last4,token_length,meta
        FROM secrets_vault WHERE workspace_id=${workspaceId} ORDER BY kind,id`);
      return await read({ service, rows, workspaceId });
    } finally { await kernel.close(); }
  };
  return {
    localHost,
    /** Safe source choices; per-source refusals do not hide other usable sources. */
    async list(_required: Record<string, never>, _options = {}): Promise<CredentialCopyChoice[]> {
      const choices: CredentialCopyChoice[] = [];
      let deployTargets: DeployTargetRegistry | undefined;
      try {
        deployTargets = await required.loadDeployTargets?.(required.targetWorkspaceId);
      } catch {
        // Host compatibility is optional enrichment; a registry failure must not hide copyable keys.
      }
      for (const source of sources()) {
        try {
          const keys = await readSource({ source, read: async ({ rows }) => rows.filter(row => {
            if (!(VAULT_KINDS as readonly VaultKind[]).includes(row.kind) || !required.registry.isCopyableKind[row.kind]) return false;
            return row.owner_key === "tovu" && row.principal_id === null && row.binding === null;
          }).map(row => {
              assertCredentialFreeField({ value: row.label, field: "label" });
              if (row.provider !== null) assertCredentialFreeField({ value: row.provider, field: "provider" });
              const meta = required.registry.metaParsers[row.kind]({ meta: typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta });
              const worksFor = Array.isArray(meta.worksFor) ? [...meta.worksFor as string[]] : [];
              const publicToken = row.kind !== "database-destination" && row.token_length !== null && row.token_length >= 12;
              return { kind: row.kind, id: row.id, label: row.label, provider: row.provider, worksFor,
                ...(deployTargets ? { publishHosts: publishHostsForCredential({ credential: { ...row, meta }, registry: deployTargets }) } : {}),
                // Keep the copy-card field present without exposing destination or short-token hints.
                last4: publicToken && row.last4 ? row.last4.slice(-4) : undefined };
            }) });
          choices.push({ siteId: source.siteId, name: source.name, keys });
        } catch (error) {
          const safe = sourceError({ error });
          choices.push({ siteId: source.siteId, name: source.name, keys: [], reasonCode: safe.reasonCode, message: safe.message,
            ...(desktopStartAvailable && safe.reasonCode === "source-needs-upgrade"
              ? { actionHint: { action: "start-site" as const, siteId: source.siteId, desktopSiteId: source.dir } } : {}) });
        }
      }
      return choices;
    },
    /** Re-resolve registered identity on submission; Jini owns resealing, conflicts and default rules. */
    async copy({ sourceSiteId, ids, overwrite, actorId }: {
      sourceSiteId: string; ids: readonly string[]; overwrite: boolean; actorId: string;
    }, _options = {}): Promise<VaultCopyResult[]> {
      const results: VaultCopyResult[] = [];
      let refusal: string | undefined;
      let registeredSourceId: string | null = null;
      try {
        const source = sources().find(source => source.siteId === sourceSiteId);
        if (!source) throw new LocalCredentialCopyError({ reasonCode: "source-unavailable", message: "Choose an available source site." });
        registeredSourceId = source.siteId;
        await readSource({ source, read: async ({ service, rows, workspaceId }) => {
          const selected = new Map(rows.map(row => [row.id, row]));
          const uniqueIds = [...new Set(ids)];
          if (uniqueIds.some(id => !selected.has(id))) throw new LocalCredentialCopyError({
            reasonCode: "source-missing", message: "A selected key is no longer available. Refresh the source list." });
          for (const id of uniqueIds) {
            const row = selected.get(id);
            if (!row || !VAULT_KINDS.some(kind => kind === row.kind)) throw new LocalCredentialCopyError({
              reasonCode: "source-missing", message: "A selected key is no longer available. Refresh the source list." });
            // Personal contexts require a principal in Jini; never invent/reuse a target principal to call it.
            if (!required.registry.isCopyableKind[row.kind]) {
              results.push({ kind: row.kind, id, status: "skipped", reasonCode: row.kind === "mcp-env" || row.kind === "mcp-auth"
                ? "requires-mcp-configuration" : "kind-not-copyable" });
              continue;
            }
            const context = { kind: row.kind, ownerKey: "tovu", principalId: null, binding: null };
            results.push(...await target.copyToSite({ source: service, sourceContext: { ...context, workspaceId },
              targetContext: { ...context, workspaceId: required.targetWorkspaceId }, ids: [id], overwrite,
              sourceRevisions: { [id]: row.revision } }));
          }
        } });
        return results;
      } catch (error) {
        const safe = sourceError({ error });
        refusal = safe.reasonCode;
        throw safe;
      } finally {
        logger.info({ message: "credentials.copy" }, { meta: { operationId: operationId(), actorId, sourceSiteId: registeredSourceId,
          targetSiteId: targetIdentity, copied: results.filter(row => row.status === "copied").length,
          skipped: results.filter(row => row.status === "skipped").length,
          failed: results.filter(row => row.status === "failed").length + (refusal ? new Set(ids).size - results.length : 0),
          reasonCodes: [...new Set([...results.flatMap(row => row.reasonCode ? [row.reasonCode] : []), ...(refusal ? [refusal] : [])])] } });
      }
    },
  };
}
export type LocalCredentialCopy = ReturnType<typeof createLocalCredentialCopy>;

function needsUpgrade({ source }: { source: Source }, _options = {}): LocalCredentialCopyError {
  return new LocalCredentialCopyError({ reasonCode: "source-needs-upgrade",
    message: `Start ${source.name} once in Tovu to upgrade it, then copy.` });
}
/** Only fixed failure codes/prose leave this adapter; SQLite/crypto exceptions can carry paths/secrets. */
function sourceError({ error }: { error: unknown }, _options = {}): LocalCredentialCopyError {
  if (error instanceof LocalCredentialCopyError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED"
    ? new LocalCredentialCopyError({ reasonCode: "source-busy", message: "The source is busy. Try copying again shortly." })
    : new LocalCredentialCopyError({ reasonCode: "source-unavailable", message: "This source cannot be read. Open it in Tovu and try again." });
}
/** Restrict the internal service to this host's site scope; route authorization precedes its use. */
function vault({ kernel, workspaceId, keyring, sealer, metaParsers }: {
  kernel: ContentKernel; workspaceId: string; keyring: KeyringPort; sealer: SecretSealerPort; metaParsers: VaultMetaParsers;
}, _options = {}): SecretsVaultService {
  return new SecretsVaultService({ repo: new SqlSecretsVaultRepo({ kernel: kernel as unknown as import("@jini-ai/db/kernel").StorageKernel<SecretsVaultDatabase> }), keyring, sealer, metaParsers,
    now: () => new Date().toISOString(), newId: () => { throw new VaultError({ code: "invalid-record" }); },
    authorize: async ({ context }) => {
      if (context.workspaceId !== workspaceId || context.ownerKey !== "tovu" || context.principalId !== null) throw new VaultError({ code: "context" });
      if ("binding" in context && context.binding !== null) throw new VaultError({ code: "context" });
    } });
}
