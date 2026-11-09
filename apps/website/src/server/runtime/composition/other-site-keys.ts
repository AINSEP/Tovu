import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { sql } from "kysely";
import { ToolInputError } from "@jini-ai/core";
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from "@jini-ai/db/secrets-vault";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { SecretsVaultService, VaultError, type VaultKind, type VaultMeta, type VaultRecord, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { tableExists } from "#src/platform/db/kernel/dialect";
import { createSitesWorkspace, type SitesWorkspace } from "#src/platform/site-dir/sites-home";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";
import { resolveSiteStorage } from "#src/platform/site-dir/site-storage";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { EnvOrFileKeyring, inspectSiteKeyMaterial } from "#src/features/webhooks/keyring.env";
import { resolveSiteKeyFingerprint, siteKeySourcesForSiteDir } from "#src/features/webhooks/site-key-sources";
import { SITE_KEY_ID_PREFIX, type SiteKeyChoice, type SiteKeySource } from "#src/features/project-keys/service";
import { registeredSources, type RegisteredSiteSource as Source } from "./registered-sites.js";
import { PROJECT_WORKSPACE_ID, type ProjectVaultScope } from "./project-store.js";

/** @file Keys saved in a site's own vault, offered on any other site of this install. Reading is
 * metadata-only until the owner approves one key; only then is it opened with its own site's key and
 * re-sealed into the owner's Shared Keys store, where the existing per-site grant takes over.
 * Reasons in this file are plain, fixed sentences: driver and crypto errors can carry paths or secrets.
 */

/** Sharing kinds: single API keys. OAuth, MCP and per-person rows belong to their sign-in or server. */
const SHARED_KINDS: readonly VaultKind[] = ["vendor", "source-control"];
const MAX_ROWS_PER_SITE = 50;
const metaParsers = createTovuVaultKinds({ policy: { validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined } }).metaParsers;

type MetaRow = { id: string; kind: VaultKind; provider: string | null; label: string; meta: string | Record<string, unknown> };
type Target = { siteId: string; name: string; dir: string; file: string | undefined };

const refused = (message: string) => new ToolInputError({ message });
const couldNotRead = (site: string) => `${site} can't be read right now. Open it in Tovu, then try again. Details: P25_SITE_KEYS_UNREADABLE; secret values omitted.`;
const unlockHelp = (site: string) => `${site}'s keys can't be unlocked on this computer. Open ${site} in Tovu and recover its key, then try again. Details: P25_SITE_KEY_LOCKED.`;
const upgradeHelp = (site: string) => `Open ${site} once in Tovu so it can update this key, then try again. Details: P25_SITE_KEY_NEEDS_UPGRADE.`;
const renameHelp = (site: string) => `This key has an unsafe name. Rename it on ${site}, then try again. Details: P25_SITE_KEY_LABEL.`;

function parseMeta({ row }: { row: MetaRow }, _options = {}): Record<string, unknown> {
  return typeof row.meta === "string" ? JSON.parse(row.meta) as Record<string, unknown> : row.meta;
}

function needsUpgrade({ kind, meta }: { kind: VaultKind; meta: Record<string, unknown> }, _options = {}): boolean {
  return Object.hasOwn(meta, "legacyAad") || (kind === "vendor" && (meta.credentialType == null || !Array.isArray(meta.worksFor)));
}

/** "Vercel, thetayway": provider, then the label when it says something more, then the site. */
function keyName({ row, site }: { row: MetaRow; site: string }, _options = {}): string {
  const provider = row.provider ? row.provider[0]!.toUpperCase() + row.provider.slice(1) : "";
  const parts = [provider, row.label.toLowerCase() === row.provider?.toLowerCase() ? "" : row.label, site];
  return parts.filter(Boolean).join(", ");
}

function siteVaultService({ kernel, workspaceId, keyring }: { kernel: ContentKernel; workspaceId: string; keyring: EnvOrFileKeyring }, _options = {}): SecretsVaultService {
  return new SecretsVaultService({ repo: new SqlSecretsVaultRepo({ kernel: kernel as unknown as import("@jini-ai/db/kernel").StorageKernel<SecretsVaultDatabase> }), keyring, sealer: new AesGcmSecretSealer({ keyring }), metaParsers,
    now: () => new Date().toISOString(), newId: () => { throw new VaultError({ code: "invalid-record" }); },
    authorize: async ({ context }) => {
      if (context.workspaceId !== workspaceId || context.ownerKey !== "tovu" || context.principalId !== null) throw new VaultError({ code: "context" });
      if ("binding" in context && context.binding !== null) throw new VaultError({ code: "context" });
    } });
}

/** Lists keys saved on registered sites (this one included) and adopts one into Shared Keys.
 * Reading cost is one read-only open + one bounded metadata query per registered site, on picker
 * open only; the connection is always closed. No site is booted, migrated, repaired or written.
 * @param required.target This site; its rows read as "this site" and are never excluded.
 * @param required.project The opened owner store. Only this module re-seals into it.
 * @returns A {@link SiteKeySource}. Listing never throws for one bad site: that row carries `locked`.
 * @throws ToolInputError on adopt, with fixed plain words; never a driver or crypto message.
 * @complexity list O(sites + rows), rows capped at 50 per site. adopt O(project rows of that kind).
 */
export function createOtherSiteKeys({ target, project }: { target: Target; project: ProjectVaultScope }, { workspace = createSitesWorkspace({}), home = homedir(), openSource = openSqliteFileKernel }: {
  workspace?: SitesWorkspace; home?: string; openSource?: typeof openSqliteFileKernel;
} = {}): SiteKeySource {
  const projectVault = new SecretsVaultService({ repo: project.repo, keyring: project.keyring, sealer: project.sealer, metaParsers,
    now: () => new Date().toISOString(), newId: () => { throw new VaultError({ code: "invalid-record" }); },
    authorize: async ({ context }) => { if (context.workspaceId !== PROJECT_WORKSPACE_ID) throw new VaultError({ code: "context" }); } });
  const sources = (): (Source & { isTarget?: boolean })[] => [
    { siteId: target.siteId, name: target.name, dir: target.dir, isTarget: true },
    ...registeredSources({ workspace, targetSiteId: target.siteId, targetSiteDir: target.dir, targetFile: target.file }),
  ];
  const label = (source: Source & { isTarget?: boolean }) => source.isTarget ? "this site" : source.name;

  /** Open one source read-only, read its metadata, and always close it. */
  async function readSource<T>({ source, read }: { source: Source; read: (input: { kernel: ContentKernel; workspaceId: string; rows: MetaRow[]; keyStatus: boolean; keyring: EnvOrFileKeyring }) => Promise<T> }): Promise<T> {
    if (resolveSiteStorage(source.dir).kind !== "sqlite") throw refused(couldNotRead(source.name));
    const resolved = resolveSiteDatabasePaths({ dir: source.dir }, { workspace, reserveIdentity: false });
    const kernel = openSource<SecretsVaultDatabase>(resolved.contentDbPath, { readOnly: true });
    try {
      const empty = !(await tableExists(kernel, "secrets_vault"));
      const workspaceId = empty ? "" : (await resolveWorkspace({ kernel: kernel as unknown as ContentKernel })).id;
      const rows = empty ? [] : await kernel.query<MetaRow>(sql`SELECT id, kind, provider, label, meta FROM secrets_vault
        WHERE workspace_id=${workspaceId} AND owner_key='tovu' AND principal_id IS NULL AND binding IS NULL
        AND kind IN (${sql.join(SHARED_KINDS)}) ORDER BY kind, id LIMIT ${MAX_ROWS_PER_SITE}`);
      // EMPTY source env on both inspection and derivation: this process's TOVU_SITE_KEY is another site's.
      const keySources = siteKeySourcesForSiteDir({ siteDir: source.dir, mode: "local", env: {}, home, cwd: source.dir });
      const status = inspectSiteKeyMaterial({ sources: keySources }, { env: () => ({}) });
      const fingerprint = resolveSiteKeyFingerprint({ siteDir: source.dir });
      const keyStatus = status.active && (fingerprint === undefined || fingerprint === status.fingerprint);
      const keyring = new EnvOrFileKeyring({ sources: keySources }, { env: () => ({}) });
      return await read({ kernel: kernel as unknown as ContentKernel, workspaceId, rows, keyStatus, keyring });
    } finally { await kernel.close(); }
  }

  /** A row's reason it cannot be used yet, in plain words; undefined when it can. */
  function lockedReason({ row, source, keyStatus }: { row: MetaRow; source: Source; keyStatus: boolean }, _options = {}): string | undefined {
    if (!keyStatus) return unlockHelp(source.name);
    const meta = parseMeta({ row });
    if (needsUpgrade({ kind: row.kind, meta })) return upgradeHelp(source.name);
    try { assertCredentialFreeField({ value: row.label, field: "label" }); if (row.provider !== null) assertCredentialFreeField({ value: row.provider, field: "provider" }); }
    catch { return renameHelp(source.name); }
    return undefined;
  }

  function keyId({ source, row }: { source: Source; row: { id: string } }, _options = {}): string {
    return `${SITE_KEY_ID_PREFIX}${source.siteId}:${row.id}`;
  }
  function parseKeyId({ keyId }: { keyId: string }, _options = {}): { siteId: string; rowId: string } | undefined {
    const rest = keyId.slice(SITE_KEY_ID_PREFIX.length);
    const colon = rest.indexOf(":");
    return colon < 1 ? undefined : { siteId: rest.slice(0, colon), rowId: rest.slice(colon + 1) };
  }
  /** Registered identity re-resolved on every submission; a submitted site path is never trusted. */
  function resolveKeyId({ keyId }: { keyId: string }, _options = {}): { source: Source; rowId: string } {
    const parsed = keyId.startsWith(SITE_KEY_ID_PREFIX) ? parseKeyId({ keyId }) : undefined;
    const source = parsed && sources().find(item => item.siteId === parsed.siteId);
    if (!parsed || !source) throw refused("This saved key is no longer on any site here. Open Use a saved key again.");
    return { source, rowId: parsed.rowId };
  }

  /** Same-secret keys reuse the existing Shared Key; otherwise a free id and label are chosen. */
  async function promote({ summary, payload, source }: { summary: VaultSummary; payload: VaultMeta; source: Source }): Promise<string> {
    const context = { workspaceId: PROJECT_WORKSPACE_ID, kind: summary.kind, ownerKey: "tovu", principalId: null } as const;
    const rows = (await projectVault.list(context)).filter(row => row.provider === summary.provider && row.binding === null);
    for (const row of rows.filter(row => row.last4 === summary.last4 && row.tokenLength === summary.tokenLength)) {
      const existing = await projectVault.get({ ...context, id: row.id, binding: null });
      if (isDeepStrictEqual(existing?.payload ?? null, payload)) return row.id;
    }
    const suffix = createHash("sha256").update(source.siteId).digest("hex").slice(0, 8);
    const taken = await project.repo.find({ workspaceId: PROJECT_WORKSPACE_ID, id: summary.id });
    const labels = new Set(rows.map(row => row.label));
    const withSite = `${summary.label} (${source.name})`;
    const newLabel = !labels.has(summary.label) ? summary.label : labels.has(withSite) ? `${withSite} ${suffix}` : withSite;
    const id = taken ? `${summary.id}-${suffix}` : summary.id;
    await projectVault.put({ ...context, id, binding: null, provider: summary.provider, label: newLabel, meta: summary.meta, payload,
      expectedRevision: null, isDefault: false, ...(typeof payload.token === "string" ? { hintToken: payload.token } : {}) });
    return id;
  }

  return {
    /** Per-source failures never hide other sites: that site gets one locked, plain-words row. */
    async list(_required: Record<string, never>, _options = {}): Promise<SiteKeyChoice[]> {
      const choices: SiteKeyChoice[] = [];
      for (const source of sources()) {
        try {
          await readSource({ source, read: async ({ rows, keyStatus }) => {
            for (const row of rows) {
              const locked = lockedReason({ row, source, keyStatus });
              choices.push({ keyId: keyId({ source, row }), kind: row.kind, name: keyName({ row, site: label(source) }), siteName: source.name, ...(locked ? { locked } : {}) });
            }
          } });
        } catch {
          choices.push({ keyId: `${SITE_KEY_ID_PREFIX}${source.siteId}:`, kind: "vendor", name: `Keys saved on ${source.name}`, siteName: source.name, locked: couldNotRead(source.name) });
        }
      }
      return choices;
    },
    /** Metadata only, for the permission check that precedes a grant. */
    async find({ keyId }: { keyId: string }, _options = {}): Promise<VaultRecord | null> {
      const { source, rowId } = resolveKeyId({ keyId });
      return readSource({ source, read: async ({ rows }) => {
        const row = rows.find(item => item.id === rowId);
        if (!row) return null;
        return { workspaceId: PROJECT_WORKSPACE_ID, id: row.id, kind: row.kind, label: row.label, ownerKey: "tovu", principalId: null, binding: null, provider: row.provider, isDefault: false, revision: 1, sealed: null, last4: null, tokenLength: null, meta: parseMeta({ row }) as VaultMeta, createdAt: "", updatedAt: "" };
      } });
    },
    /** After owner approval, re-seal the source key into Shared Keys; the plaintext stays in this function. */
    async adopt({ keyId }: { keyId: string }, _options = {}): Promise<{ keyId: string }> {
      const { source, rowId } = resolveKeyId({ keyId });
      return readSource({ source, read: async ({ kernel, workspaceId, rows, keyStatus, keyring }) => {
        const row = rows.find(item => item.id === rowId);
        if (!row) throw refused(`This saved key is no longer on ${source.name}. Open Use a saved key again.`);
        const locked = lockedReason({ row, source, keyStatus });
        if (locked) throw refused(locked);
        const opened = await siteVaultService({ kernel, workspaceId, keyring }).get({ workspaceId, id: row.id, kind: row.kind, ownerKey: "tovu", principalId: null, binding: null })
          .catch(() => { throw refused(unlockHelp(source.name)); });
        if (!opened?.payload) throw refused(`This saved key on ${source.name} is empty. Save it there again, then try again. Details: P25_SITE_KEY_EMPTY.`);
        return { keyId: await promote({ summary: opened.summary, payload: opened.payload, source }) };
      } }).catch(error => {
        if (error instanceof ToolInputError) throw error;
        throw refused(couldNotRead(source.name));
      });
    },
  };
}
