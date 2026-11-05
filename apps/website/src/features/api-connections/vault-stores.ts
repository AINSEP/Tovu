import { createHash } from "node:crypto";

import { SecretsVaultService, VaultError, createVaultMetaParsers, type VaultArchiveEntry, type VaultContext, type VaultMeta, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";
import type { Clock } from "@jini-ai/core/primitives";
import {
  createApiConnectionGenerationReader, createVaultOAuthTokenStore,
  deriveApiConnectionKey, parseTokenPayload, buildTokenPayload,
  type ApiConnectionAttempt, type ApiConnectionRecord, type ApiConnectionRecordStore, type ApiConnectionTokenStore,
} from "@jini-ai/integrations/api-connections";
import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import { API_CONNECTION_RECORD_FORMAT as RECORD_FORMAT, API_CONNECTION_ATTEMPT_FORMAT as ATTEMPT_FORMAT, PLUGIN_STATE_FORMAT } from "#src/platform/secrets/vault-api-connection-meta";
export { PLUGIN_STATE_FORMAT } from "#src/platform/secrets/vault-api-connection-meta";

/**
 * @file Tovu's storage for plugin-declared API connections, all in the existing secrets vault under
 * the `api-connection` kind (migration 0020): the sealed token sets (Jini's vault token store), the
 * connection records and the single-use sign-in attempts. The same kind also holds plugin settings
 * rows (`plugin-state.ts`), so plugin state needs no new table or vault kind (no migration 0021).
 *
 * Why the vault for records and attempts too: the settings ledger is append-only and exportable,
 * and an attempt carries a PKCE verifier that must never be exported or logged. Sealed vault rows
 * give revision CAS (record writes) and a revision-checked delete (consume-once attempts) with no
 * new table. Row ids are prefixed so they can never collide with a token row, whose id is the
 * connection key itself.
 */

export const API_CONNECTION_VAULT_KIND = "api-connection" as const;
const recordId = (key: string): string => `record:${key}`;
// State is sealed inside the attempt only: row ids and labels are visible to vault listings.
const attemptId = (state: string): string => `attempt:${createHash("sha256").update(state).digest("hex")}`;
/**
 * Vault labels are unique per scope, and one scope holds every connection's record plus every open
 * sign-in attempt, so each label is derived from what makes its row unique: the record's key, and
 * for an attempt its key plus a digest of the state (the state itself is the callback's bearer
 * value and is kept out of anything listed).
 */
const recordLabel = (key: string): string => `API connection ${key}`;
const attemptLabel = (attempt: ApiConnectionAttempt): string =>
  `API connection sign-in ${attempt.key} ${createHash("sha256").update(attempt.state).digest("hex").slice(0, 16)}`;

/** The host-side record store: Jini's port plus a non-consuming read the public callback routes by. */
export interface ApiConnectionVaultRecordStore extends ApiConnectionRecordStore {
  /** The attempt a callback `state` names, without consuming it; null when unknown or used. */
  peekAttempt(required: { readonly state: string }, optional?: Record<string, never>): Promise<ApiConnectionAttempt | null>;
}

export interface ApiConnectionVaultDeps {
  readonly repo: VaultRepoPort;
  readonly keyring: KeyringPort;
  readonly sealer: SecretSealerPort;
  readonly clock: Clock;
  readonly workspaceId: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The one vault context every api-connection row of a workspace lives under. */
export function apiConnectionVaultScope(required: { readonly workspaceId: string }, _optional: Record<string, never> = {}): VaultContext {
  return { workspaceId: required.workspaceId, kind: API_CONNECTION_VAULT_KIND, ownerKey: "tovu", principalId: null, binding: null };
}

/**
 * A vault service confined to one workspace's api-connection rows. Every other kind, owner or
 * workspace is refused before any metadata parser or crypto runs.
 * @complexity O(1) setup.
 */
export function createApiConnectionVault(required: ApiConnectionVaultDeps, _optional: Record<string, never> = {}): SecretsVaultService {
  const scope = apiConnectionVaultScope({ workspaceId: required.workspaceId });
  return new SecretsVaultService({
    repo: required.repo, keyring: required.keyring, sealer: required.sealer,
    metaParsers: createVaultMetaParsers({}, { parsers: { [API_CONNECTION_VAULT_KIND]: input => parseTovuStoreMeta({ ...input, kind: API_CONNECTION_VAULT_KIND }) } }),
    authorize: async ({ context }) => {
      const wrongScope = context.workspaceId !== scope.workspaceId || context.kind !== scope.kind || context.ownerKey !== scope.ownerKey;
      if (wrongScope || context.principalId !== null || ("binding" in context && context.binding !== null)) throw new VaultError({ code: "context" });
    },
    now: () => new Date(required.clock.nowMs()).toISOString(),
    newId: () => { throw new VaultError({ code: "invalid-record" }); },
  });
}

const isConflict = (error: unknown): boolean => error instanceof VaultError && error.code === "conflict";

/**
 * Connection records and attempts as sealed vault rows. `compareAndSet` maps the record revision to
 * the vault revision (0 = create); `takeAttempt` deletes with the revision it read, so two callbacks
 * racing on one state cannot both get the attempt.
 * @complexity O(1) vault calls per operation; `putAttempt` also sweeps expired attempts, O(a) rows.
 */
export function createApiConnectionVaultRecordStore(
  required: { readonly vault: SecretsVaultService; readonly workspaceId: string; readonly clock: Clock },
  _optional: Record<string, never> = {},
): ApiConnectionVaultRecordStore {
  const scope = apiConnectionVaultScope({ workspaceId: required.workspaceId });
  const { vault } = required;
  const readPayload = async (id: string) => vault.get({ ...scope, id });
  const readAttempt = async (state: string) => {
    const found = await readPayload(attemptId(state));
    return found && isObject(found.payload?.attempt) ? { found, attempt: found.payload.attempt as unknown as ApiConnectionAttempt } : null;
  };
  async function sweepExpiredAttempts(): Promise<void> {
    const nowMs = required.clock.nowMs();
    for (const row of await vault.list({ ...scope })) {
      if (row.meta.credentialFormat !== ATTEMPT_FORMAT || (row.meta.expiresAtMs as number) > nowMs) continue;
      await vault.delete({ ...scope, id: row.id, expectedRevision: row.revision }).catch((error: unknown) => { if (!isConflict(error)) throw error; });
    }
  }
  return {
    async read({ key }) {
      const found = await readPayload(recordId(key));
      if (!found || !isObject(found.payload?.record)) return null;
      const record = found.payload.record as unknown as ApiConnectionRecord;
      // A record sealed under another key (a copied or tampered row) is never served.
      if (record.key !== key) throw new VaultError({ code: "invalid-record" });
      return { ...record, revision: found.summary.revision };
    },
    async compareAndSet({ key, expectedRevision, record }) {
      if (record.key !== key) throw new VaultError({ code: "invalid-record" });
      try {
        await vault.put({ ...scope, id: recordId(key), expectedRevision: expectedRevision === 0 ? null : expectedRevision, provider: null,
          label: recordLabel(key), meta: { credentialFormat: RECORD_FORMAT }, payload: { record: { ...record } as unknown as VaultMeta } });
        return true;
      } catch (error) {
        if (isConflict(error)) return false;
        throw error;
      }
    },
    async putAttempt({ attempt }) {
      await sweepExpiredAttempts();
      await vault.put({ ...scope, id: attemptId(attempt.state), expectedRevision: null, provider: null, label: attemptLabel(attempt),
        meta: { credentialFormat: ATTEMPT_FORMAT, expiresAtMs: Date.parse(attempt.expiresAt) }, payload: { attempt: { ...attempt } as unknown as VaultMeta } });
    },
    async takeAttempt({ state }) {
      const read = await readAttempt(state);
      if (!read) return null;
      const deleted = await vault.delete({ ...scope, id: attemptId(state), expectedRevision: read.found.summary.revision })
        .catch((error: unknown) => { if (isConflict(error)) { return false; } throw error; });
      return deleted ? read.attempt : null;
    },
    async peekAttempt({ state }) {
      return (await readAttempt(state))?.attempt ?? null;
    },
  };
}

/**
 * Jini's vault token store bound to one connection owner, fenced by the record store's generation.
 * Sign-in and switch write through its fenced `install` (no lease); only the refresher's `persist`
 * needs the refresh lease, so the host no longer wraps writes in one.
 * @complexity O(1) setup.
 */
export function createApiConnectionVaultTokenStore(
  required: {
    readonly vault: SecretsVaultService; readonly records: ApiConnectionRecordStore; readonly clock: Clock;
    readonly owner: { readonly workspaceId: string; readonly pluginId: string; readonly connectionId: string; readonly clientId: string };
  },
  _optional: Record<string, never> = {},
): ApiConnectionTokenStore {
  return createVaultOAuthTokenStore({
    vault: required.vault, vaultScope: apiConnectionVaultScope({ workspaceId: required.owner.workspaceId }), owner: required.owner,
    readGeneration: createApiConnectionGenerationReader({ records: required.records }), clock: required.clock,
  });
}

/** Verify the durable record owns its original derived key before constructing a recipient key. */
function archiveConnection(row: VaultArchiveEntry): ApiConnectionRecord {
  const record = row.payload?.record;
  if (!isObject(record)) throw new VaultError({ code: "invalid-record" });
  const ids = [record.workspaceId, record.pluginId, record.connectionId];
  if (ids.some(value => typeof value !== "string" || !value)) throw new VaultError({ code: "invalid-record" });
  const connection = record as unknown as ApiConnectionRecord;
  if (deriveApiConnectionKey(connection) !== connection.key || row.id !== recordId(connection.key)) throw new VaultError({ code: "context" });
  assertArchiveConnectionState(connection);
  return connection;
}

/** Archive transport admits connected durable state only; no pending account switch is resumed. */
function assertArchiveConnectionState(connection: ApiConnectionRecord): void {
  if (!Number.isSafeInteger(connection.generation) || connection.generation < 0 || !Array.isArray(connection.grantedScopes)) throw new VaultError({ code: "invalid-record" });
  if (!connection.grantedScopes.every(scope => typeof scope === "string") || connection.status !== "connected") throw new VaultError({ code: "invalid-record" });
}

/** Reuse the token owner's authenticated payload codec; enumerate only durable record fields. */
function reboundConnection(required: { row: VaultArchiveEntry; rows: ReadonlyMap<string, VaultArchiveEntry>; workspaceId: string }): VaultArchiveEntry[] {
  const connection = archiveConnection(required.row);
  const tokenRow = required.rows.get(connection.key);
  const payload = tokenRow?.payload, owner = payload?.owner;
  if (!tokenRow || !isObject(owner) || typeof owner.clientId !== "string") throw new VaultError({ code: "invalid-record" });
  const sourceOwner = { workspaceId: connection.workspaceId, pluginId: connection.pluginId, connectionId: connection.connectionId, clientId: owner.clientId };
  const parsed = parseTokenPayload({ payload, key: connection.key, owner: sourceOwner });
  if (parsed.generation !== connection.generation || !parsed.tokens) throw new VaultError({ code: "invalid-record" });
  const key = deriveApiConnectionKey({ ...sourceOwner, workspaceId: required.workspaceId });
  // Enumerate durable fields: staged account switches, actors, leases and source extensions die here.
  const record: ApiConnectionRecord = { key, workspaceId: required.workspaceId, pluginId: connection.pluginId, connectionId: connection.connectionId,
    status: "connected", revision: 1, generation: connection.generation, account: connection.account, grantedScopes: [...connection.grantedScopes],
    staged: null, revocationFailure: null, updatedAt: connection.updatedAt };
  return [
    { ...required.row, id: recordId(key), label: recordLabel(key), payload: { record: record as unknown as VaultMeta } },
    { ...tokenRow, id: key, label: key, meta: { credentialFormat: "oauth-token-set", status: "active", leaseHolder: null, leaseExpiresAtMs: null },
      payload: buildTokenPayload({ key, owner: { ...sourceOwner, workspaceId: required.workspaceId }, generation: parsed.generation, tokens: parsed.tokens }) },
  ];
}

/** Transient attempts/switches are deliberate exclusions; orphan durable rows deserve a notice. */
function omittedApiRow(row: VaultArchiveEntry, consumed: ReadonlySet<string>): boolean {
  const transient = row.id.endsWith("#staged") || row.meta.credentialFormat === ATTEMPT_FORMAT;
  return !consumed.has(row.id) && !transient;
}

/** One failed pair gets one notice, even when both its record and tokens are unusable. */
function markFailedApiPair(row: VaultArchiveEntry, consumed: Set<string>): void {
  consumed.add(row.id);
  const record = row.payload?.record;
  if (isObject(record) && typeof record.key === "string") consumed.add(record.key);
}

/** Owner references are site authority, never portable plugin preferences. */
function ownerReference(row: VaultArchiveEntry): boolean {
  return row.id.startsWith("plugin-state:tovu-key-references:") || row.id.startsWith("plugin-state:tovu-shared-oauth-binding:");
}

/** Transport only complete, connected record/token pairs using the live key/codec owners. Plugin
 * settings have no workspace-derived identity. Pending sign-ins, shared references and staged tokens never travel.
 * Unsupported durable connections are omitted with a count, never raw identifiers/provider text.
 * @example const rebound = rebindApiConnectionArchive({ entries, workspaceId: recipientWorkspaceId });
 * @complexity O(rows + token bytes) time/space, bounded by the archive's credential cap.
 */
export function rebindApiConnectionArchive(required: { entries: readonly VaultArchiveEntry[]; workspaceId: string }, _optional: Record<string, never> = {}): { entries: VaultArchiveEntry[]; notices: string[] } {
  const entries = required.entries.filter(row => row.kind !== "api-connection");
  const api = required.entries.filter(row => row.kind === "api-connection" && !ownerReference(row));
  const rows = new Map(api.map(row => [row.id, row]));
  let omitted = 0;
  const consumed = new Set<string>();
  for (const row of api) {
    if (row.meta.credentialFormat === PLUGIN_STATE_FORMAT && row.id.startsWith("plugin-state:")) { entries.push(row); consumed.add(row.id); }
    if (row.meta.credentialFormat !== RECORD_FORMAT) continue;
    try {
      const pair = reboundConnection({ row, rows, workspaceId: required.workspaceId });
      entries.push(...pair);
      consumed.add(row.id);
      consumed.add((row.payload!.record as VaultMeta).key as string);
    } catch {
      omitted++;
      markFailedApiPair(row, consumed);
    }
  }
  omitted += api.filter(row => omittedApiRow(row, consumed)).length;
  return { entries, notices: omitted ? [`${omitted} unsupported API connection(s) were left out.`] : [] };
}
