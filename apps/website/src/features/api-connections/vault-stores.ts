import { SecretsVaultService, VaultError, createVaultMetaParsers, type VaultContext, type VaultMeta, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";
import type { Clock } from "@jini-ai/core/primitives";
import {
  createApiConnectionGenerationReader, createVaultOAuthTokenStore, parseOAuthTokenVaultMeta,
  type ApiConnectionAttempt, type ApiConnectionRecord, type ApiConnectionRecordStore, type ApiConnectionTokenStore,
} from "@jini-ai/integrations/api-connections";

/**
 * @file Tovu's storage for plugin-declared API connections, all in the existing secrets vault under
 * the `api-connection` kind (migration 0020): the sealed token sets (Jini's vault token store), the
 * connection records and the single-use sign-in attempts.
 *
 * Why the vault for records and attempts too: the settings ledger is append-only and exportable,
 * and an attempt carries a PKCE verifier that must never be exported or logged. Sealed vault rows
 * give revision CAS (record writes) and a revision-checked delete (consume-once attempts) with no
 * new table. Row ids are prefixed so they can never collide with a token row, whose id is the
 * connection key itself.
 */

export const API_CONNECTION_VAULT_KIND = "api-connection" as const;
const RECORD_FORMAT = "api-connection-record";
const ATTEMPT_FORMAT = "api-connection-attempt";
const recordId = (key: string): string => `record:${key}`;
const attemptId = (state: string): string => `attempt:${state}`;

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

/** Token rows keep Jini's parser; record and attempt rows carry only their format and an expiry. */
function parseApiConnectionMeta(input: { readonly meta: unknown; readonly provider?: string | null | undefined }): VaultMeta {
  const meta = input.meta;
  if (isObject(meta) && meta.credentialFormat === RECORD_FORMAT && Object.keys(meta).length === 1) return { credentialFormat: RECORD_FORMAT };
  if (isObject(meta) && meta.credentialFormat === ATTEMPT_FORMAT && Object.keys(meta).length === 2 && Number.isSafeInteger(meta.expiresAtMs)) {
    return { credentialFormat: ATTEMPT_FORMAT, expiresAtMs: meta.expiresAtMs as number };
  }
  return parseOAuthTokenVaultMeta(input);
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
    metaParsers: createVaultMetaParsers({}, { parsers: { [API_CONNECTION_VAULT_KIND]: parseApiConnectionMeta } }),
    authorize: async ({ context }) => {
      if (context.workspaceId !== scope.workspaceId || context.kind !== scope.kind || context.ownerKey !== scope.ownerKey ||
        context.principalId !== null || ("binding" in context && context.binding !== null)) throw new VaultError({ code: "context" });
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
          label: "API connection", meta: { credentialFormat: RECORD_FORMAT }, payload: { record: { ...record } as unknown as VaultMeta } });
        return true;
      } catch (error) {
        if (isConflict(error)) return false;
        throw error;
      }
    },
    async putAttempt({ attempt }) {
      await sweepExpiredAttempts();
      await vault.put({ ...scope, id: attemptId(attempt.state), expectedRevision: null, provider: null, label: "API connection sign-in",
        meta: { credentialFormat: ATTEMPT_FORMAT, expiresAtMs: Date.parse(attempt.expiresAt) }, payload: { attempt: { ...attempt } as unknown as VaultMeta } });
    },
    async takeAttempt({ state }) {
      const read = await readAttempt(state);
      if (!read) return null;
      const deleted = await vault.delete({ ...scope, id: attemptId(state), expectedRevision: read.found.summary.revision })
        .catch((error: unknown) => { if (isConflict(error)) return false; throw error; });
      return deleted ? read.attempt : null;
    },
    async peekAttempt({ state }) {
      return (await readAttempt(state))?.attempt ?? null;
    },
  };
}

/**
 * Jini's vault token store bound to one connection owner, fenced by the record store's generation.
 * @complexity O(1) setup.
 */
export function createApiConnectionVaultTokenStore(
  required: {
    readonly vault: SecretsVaultService; readonly records: ApiConnectionRecordStore; readonly clock: Clock;
    readonly owner: { readonly workspaceId: string; readonly pluginId: string; readonly connectionId: string; readonly clientId: string };
  },
  _optional: Record<string, never> = {},
): ApiConnectionTokenStore {
  const store = createVaultOAuthTokenStore({
    vault: required.vault, vaultScope: apiConnectionVaultScope({ workspaceId: required.owner.workspaceId }), owner: required.owner,
    readGeneration: createApiConnectionGenerationReader({ records: required.records }), clock: required.clock,
  });
  return {
    ...store,
    // The vault store only writes under a lease (G2 host duty 3), but the service's sign-in install
    // persists directly. Take the lease for that write; when this instance already holds it (the
    // refresher's path) acquisition fails and the held lease authorizes the write as before.
    async persist(args) {
      if (!(await store.tryAcquireRefreshLease(args))) return store.persist(args);
      try { await store.persist(args); } finally { await store.releaseRefreshLease(args); }
    },
  };
}
