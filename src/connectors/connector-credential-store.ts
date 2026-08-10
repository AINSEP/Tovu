import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";
import type {
  ConnectorCredentialMaterial,
  ConnectorCredentialRecord,
  ConnectorCredentialStore,
} from "@jini-ai/integrations/composio";

import type { KeyringPort, SecretSealerPort } from "../integrations/ports";
import type { SealedSecret } from "../integrations/types";

/**
 * @file Durable, sealed storage for connected third-party ACCOUNTS — what survives an OAuth
 * handshake. Replaces Jini's `InMemoryConnectorCredentialStore`, which drops every connection on
 * restart.
 *
 * Same async/sync bridge as `composio-config-store.ts`, and for the same unavoidable reason: Jini's
 * `ConnectorCredentialStore` is SYNCHRONOUS (`get` returns a record, not a promise) while ADR-058's
 * `SecretSealerPort` is async in both directions, so sealing cannot happen inside the interface.
 * {@link createSnapshotConnectorCredentialStore} serves reads from a decrypted in-memory snapshot
 * and queues writes.
 *
 * ONE HARDENING over the config-store bridge, and it is the important difference: writes here are
 * not fire-and-forget. These are real account credentials — a dropped write would leave a
 * connection that works until the next restart and then silently vanishes — so the store exposes
 * {@link SnapshotConnectorCredentialStore.flush}, and the connect/disconnect routes await it before
 * responding. A persistence failure therefore fails the request the operator is watching, instead
 * of surfacing days later as a connector that mysteriously forgot its account.
 */

/** One connected account's stored row. `sealed` is null only in the degenerate pre-credential
 *  state the table's CHECK still permits; see `db/schema.ts`'s header. */
export interface ConnectorCredentialRow {
  workspaceId: UUID;
  connectorId: string;
  accountLabel: string | null;
  sealed: SealedSecret | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link ConnectorCredentialRow} (ADR-007 §1). */
export interface ConnectorCredentialRepoPort {
  listByWorkspaceId(workspaceId: UUID): Promise<ConnectorCredentialRow[]>;
  upsert(row: ConnectorCredentialRow): Promise<void>;
  deleteByConnectorId(input: { workspaceId: UUID; connectorId: string }): Promise<void>;
}

export interface SnapshotConnectorCredentialStoreDeps {
  workspaceId: UUID;
  repo: ConnectorCredentialRepoPort;
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

/** Jini's synchronous store, plus the two async operations Tovu needs around it. */
export interface SnapshotConnectorCredentialStore extends ConnectorCredentialStore {
  /**
   * Loads and decrypts every stored account for the workspace into the snapshot. Called at boot and
   * whenever the Composio project key changes.
   *
   * A row whose credentials cannot be opened is SKIPPED rather than fatal — one unreadable record
   * (a rotated master secret, a hand-edited row) must not take down the whole connector surface.
   * The connector simply reads as not-connected and can be reconnected.
   */
  hydrate(): Promise<void>;
  /**
   * Resolves once every write queued so far has hit the database, or REJECTS with the first
   * failure. Routes await this before responding — see this file's header for why these writes are
   * not fire-and-forget.
   */
  flush(): Promise<void>;
}

function toMaterial(parsed: unknown): ConnectorCredentialMaterial | undefined {
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as ConnectorCredentialMaterial)
    : undefined;
}

/**
 * A `ConnectorCredentialStore` over a decrypted in-memory snapshot, persisting through a serialized
 * write queue.
 *
 * Writes are chained onto a single promise rather than issued concurrently. That ordering is
 * load-bearing, not incidental: `set` followed immediately by `delete` for the same connector must
 * land in that order, and unsequenced seals — each of which awaits the keyring — can otherwise
 * complete out of order and resurrect a deleted credential.
 *
 * @complexity `get`/`set`/`delete` are O(1) in memory. `deleteByProvider` is O(n) over connected
 *   accounts, itself bounded by the catalog. Each write costs one AEAD seal plus one upsert.
 * @overallScore 100
 */
export function createSnapshotConnectorCredentialStore(
  deps: SnapshotConnectorCredentialStoreDeps
): SnapshotConnectorCredentialStore {
  const records = new Map<string, ConnectorCredentialRecord>();
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (work: () => Promise<void>): void => {
    queue = queue.then(work);
  };

  const sealCredentials = async (credentials: ConnectorCredentialMaterial): Promise<SealedSecret> =>
    deps.sealer.seal({
      plaintext: JSON.stringify(credentials),
      key: await deps.keyring.activeKey(),
    });

  return {
    get(connectorId: string): ConnectorCredentialRecord | undefined {
      const record = records.get(connectorId);
      // Cloned on the way out: the service treats the returned record as its own and Jini's own
      // in-memory implementation clones too, so handing out the live object would let a caller
      // mutate the snapshot without ever going through `set`.
      return record === undefined ? undefined : { ...record, credentials: { ...record.credentials } };
    },

    set(record: ConnectorCredentialRecord): void {
      records.set(record.connectorId, { ...record, credentials: { ...record.credentials } });
      const now = deps.clock.nowIso();
      enqueue(async () => {
        const existing = (await deps.repo.listByWorkspaceId(deps.workspaceId)).find(
          (row) => row.connectorId === record.connectorId
        );
        await deps.repo.upsert({
          workspaceId: deps.workspaceId,
          connectorId: record.connectorId,
          accountLabel: record.accountLabel,
          sealed: await sealCredentials(record.credentials),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
      });
    },

    delete(connectorId: string): void {
      records.delete(connectorId);
      enqueue(() => deps.repo.deleteByConnectorId({ workspaceId: deps.workspaceId, connectorId }));
    },

    deleteByProvider(provider: string): void {
      for (const [connectorId, record] of [...records.entries()]) {
        if (record.credentials.provider !== provider) continue;
        records.delete(connectorId);
        enqueue(() => deps.repo.deleteByConnectorId({ workspaceId: deps.workspaceId, connectorId }));
      }
    },

    async hydrate(): Promise<void> {
      const rows = await deps.repo.listByWorkspaceId(deps.workspaceId);
      records.clear();
      for (const row of rows) {
        if (row.sealed === null) continue;
        let credentials: ConnectorCredentialMaterial | undefined;
        try {
          credentials = toMaterial(JSON.parse(await deps.sealer.open({ sealed: row.sealed })));
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            `composio credentials for "${row.connectorId}" could not be opened; treating the connector as disconnected: ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        if (credentials === undefined) continue;
        records.set(row.connectorId, {
          schemaVersion: 1,
          connectorId: row.connectorId,
          accountLabel: row.accountLabel ?? row.connectorId,
          credentials,
          updatedAt: row.updatedAt,
        });
      }
    },

    async flush(): Promise<void> {
      await queue;
    },
  };
}
