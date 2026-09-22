import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";
import type {
  ConnectorCredentialMaterial,
  ConnectorCredentialRecord,
  ConnectorCredentialStore,
} from "@jini-ai/integrations/composio";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "../../features/webhooks/index.js";
import { buildConnectorCredentialAad } from "./connector-credential-aad.js";

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
 *  state the table's CHECK still permits; see `db/schema.sqlite.ts`'s header. */
export interface ConnectorCredentialRow {
  workspaceId: UUID;
  connectorId: string;
  accountLabel: string | null;
  sealed: SealedSecret | null;
  /** `0` = `sealed` (when non-null) was sealed with NO aad — open with none either, or auth-tag
   *  verification fails. `1` = sealed under `connector-credential-aad.ts`'s
   *  `buildConnectorCredentialAad`; open MUST supply the byte-identical string. Meaningless (and
   *  always `0`) when `sealed` is `null`. Added 2026-09-02 (AAD gap closure) — see `db/schema.sqlite.ts`'s
   *  `composioConnectorCredentials.aad_version` doc for the full migration story. */
  aadVersion: number;
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
   * Resolves once every write queued so far has hit the database, or REJECTS with the first failure
   * among the writes THIS call is responsible for. Routes await this before responding — see this
   * file's header for why these writes are not fire-and-forget.
   *
   * A failure is reported exactly once: each call claims the writes enqueued since the previous
   * call, so one connector's failure cannot surface as a 500 on an unrelated connector's request,
   * and a failed write never becomes a permanent error every later flush re-throws.
   */
  flush(): Promise<void>;
}

function toMaterial(parsed: unknown): ConnectorCredentialMaterial | undefined {
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as ConnectorCredentialMaterial)
    : undefined;
}

/**
 * Decrypts and validates one stored row into a {@link ConnectorCredentialRecord}, or `undefined`
 * when the row cannot become one — the degenerate pre-credential state (`sealed: null`), a seal
 * that fails to open (wrong aad, rotated root key, a hand-edited row), or plaintext that doesn't
 * parse into credential-shaped material. Every failure is logged and swallowed here rather than
 * thrown, matching {@link SnapshotConnectorCredentialStore.hydrate}'s documented "skip, don't fail"
 * contract — extracted verbatim out of `hydrate`'s loop body so the loop stays flat.
 */
async function openConnectorCredentialRow(
  row: ConnectorCredentialRow,
  input: { workspaceId: UUID; sealer: SecretSealerPort }
): Promise<ConnectorCredentialRecord | undefined> {
  if (row.sealed === null) return undefined;
  let credentials: ConnectorCredentialMaterial | undefined;
  try {
    // `aad` only when this row was sealed under one (`aadVersion === 1`) — a legacy row
    // (`aadVersion === 0`, every row written before the 2026-09-02 AAD gap closure) was sealed
    // with NO aad and must be opened the same way, or auth-tag verification fails closed.
    const aad =
      row.aadVersion === 1
        ? buildConnectorCredentialAad({ workspaceId: input.workspaceId, connectorId: row.connectorId })
        : undefined;
    credentials = toMaterial(JSON.parse(await input.sealer.open({ sealed: row.sealed, aad })));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `composio credentials for "${row.connectorId}" could not be opened; treating the connector as disconnected: ${err instanceof Error ? err.message : String(err)}`
    );
    return undefined;
  }
  if (credentials === undefined) return undefined;
  return {
    schemaVersion: 1,
    connectorId: row.connectorId,
    accountLabel: row.accountLabel ?? row.connectorId,
    credentials,
    updatedAt: row.updatedAt,
  };
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
 * The chain sequences work but deliberately does NOT propagate failure through itself. One queue
 * serves every connector in the workspace for the process's whole life, so a failing write must
 * isolate to the request that caused it: a locked database or an absent root key on connector A
 * cannot be allowed to stop connector B's later, independent write from running, nor to surface as
 * a 500 on B's request. Failures ride alongside the chain and are claimed by `flush`.
 *
 * @complexity `get`/`set`/`delete` are O(1) in memory. `deleteByProvider` is O(n) over connected
 *   accounts, itself bounded by the catalog. Each write costs one AEAD seal plus one upsert.
 *   `flush` is O(w) in the writes enqueued since the previous flush.
 * @tradeoffs A failed write leaves the in-memory snapshot holding the credential it could not
 *   persist, so `get` keeps reporting the connector as connected until the next `hydrate`. Rolling
 *   the snapshot back here would be worse: the rollback would itself be unordered relative to
 *   later writes for the same connector and could discard a subsequent successful one. Callers
 *   that need the snapshot to match storage after a failure should re-`hydrate`.
 * @overallScore 100
 */
export function createSnapshotConnectorCredentialStore(
  deps: SnapshotConnectorCredentialStoreDeps
): SnapshotConnectorCredentialStore {
  const records = new Map<string, ConnectorCredentialRecord>();
  // Never rejects. `queue.then(work)` on a REJECTED promise skips `work` entirely and re-propagates
  // the old reason, so a rejecting tail would permanently poison the chain: every later write
  // silently never runs and every later flush() re-throws a stale, unrelated error. Failures are
  // therefore diverted into `unreported` and the chain itself always resolves.
  let queue: Promise<void> = Promise.resolve();
  /** One settled outcome per write not yet claimed by a {@link SnapshotConnectorCredentialStore.flush}. */
  let unreported: Promise<{ error: unknown } | undefined>[] = [];

  const enqueue = (work: () => Promise<void>): void => {
    const outcome = queue.then(work).then(
      () => undefined,
      (error: unknown) => ({ error })
    );
    queue = outcome.then(() => undefined);
    unreported.push(outcome);
  };

  const sealCredentials = async (connectorId: string, credentials: ConnectorCredentialMaterial): Promise<SealedSecret> =>
    deps.sealer.seal({
      plaintext: JSON.stringify(credentials),
      key: await deps.keyring.activeKey(),
      aad: buildConnectorCredentialAad({ workspaceId: deps.workspaceId, connectorId }),
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
          sealed: await sealCredentials(record.connectorId, record.credentials),
          // A fresh seal every write (never a re-wrap), so the row always ends up bound to the new
          // aad — including a legacy (aadVersion 0) row this write just re-sealed for free.
          aadVersion: 1,
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
        const record = await openConnectorCredentialRow(row, { workspaceId: deps.workspaceId, sealer: deps.sealer });
        if (record !== undefined) records.set(row.connectorId, record);
      }
    },

    async flush(): Promise<void> {
      // Claimed synchronously, before the first await, so two concurrent requests split the
      // outstanding writes between them instead of both reporting — or both missing — the same one.
      const claimed = unreported;
      const barrier = queue;
      unreported = [];

      await barrier;
      const failure = (await Promise.all(claimed)).find((outcome) => outcome !== undefined);
      if (failure !== undefined) throw failure.error;
    },
  };
}
