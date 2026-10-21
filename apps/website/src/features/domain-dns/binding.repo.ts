/** @file Thin SQL adapter for `domain_binding` (migrations 0024, 0026), on the host's instrumented kernel. */
import { sql } from "kysely";
import type { DelegationState, DnsPlanRequirement } from "@jini-ai/devops/dns";
import type { StorageKernel } from "#src/platform/db/kernel/port";

/** `unknown` = transport failure, retried; `timeout` = the 48 h propagation cap was reached. */
export type DomainBindingStatus = "pending" | "propagated" | "mismatch" | "timeout" | "unknown";

/** One hostname the workspace wants served, with the records it needs and the last check. */
export interface DomainBinding {
  hostname: string;
  providerId: string;
  zone: string;
  requirements: DnsPlanRequirement[];
  status: DomainBindingStatus;
  delegation: DelegationState | null;
  attempt: number;
  startedAt: string;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  lastResult: unknown;
  /** Compare-and-swap counter (migration 0026): bumped by every write; 0 for rows that predate it. */
  version: number;
}

/** Workspace-scoped store. `put` is the verify path's alone: it is the single writer of `status`. */
export interface DomainBindingStore {
  get(required: { hostname: string }): Promise<DomainBinding | null>;
  /**
   * Compare-and-swap write: succeeds only while the stored row is still at `expectedVersion`
   * (`null` = no row yet), storing `binding.version`. False means another writer got there first;
   * nothing was changed and the caller's observation is stale.
   */
  put(required: { binding: DomainBinding; now: string; expectedVersion: number | null }): Promise<boolean>;
  /** Bindings whose next check is due at `now`, earliest first. */
  listDue(required: { now: string; limit: number }): Promise<DomainBinding[]>;
}

interface Stored {
  hostname: string; provider_id: string; zone: string; requirements_json: string; status: DomainBindingStatus;
  delegation_state: DelegationState | null; attempt: number | string; started_at: string; next_check_at: string | null;
  last_checked_at: string | null; last_result_json: string | null; version: number | string;
}

const COLUMNS = sql.raw("hostname, provider_id, zone, requirements_json, status, delegation_state, attempt, started_at, next_check_at, last_checked_at, last_result_json, version");

function fromRow(row: Stored): DomainBinding {
  return {
    hostname: row.hostname, providerId: row.provider_id, zone: row.zone,
    requirements: JSON.parse(row.requirements_json) as DnsPlanRequirement[],
    status: row.status, delegation: row.delegation_state,
    // Postgres drivers may hand integers back as strings; the column is integer on both dialects.
    attempt: Number(row.attempt), startedAt: row.started_at, nextCheckAt: row.next_check_at,
    lastCheckedAt: row.last_checked_at, lastResult: row.last_result_json === null ? null : JSON.parse(row.last_result_json),
    version: Number(row.version),
  };
}

/**
 * Bind the store to one workspace; every statement is tenant scoped.
 * @complexity O(1) keyed reads/writes; `listDue` O(limit) over the (workspace, next_check_at) index.
 * @example createDomainBindingStore({ kernel, workspaceId: "site-a" })
 */
export function createDomainBindingStore({ kernel, workspaceId }: { kernel: Pick<StorageKernel<unknown>, "query" | "execute">; workspaceId: string }, _options = {}): DomainBindingStore {
  return {
    async get({ hostname }) {
      const [row] = await kernel.query<Stored>(sql`SELECT ${COLUMNS} FROM domain_binding WHERE workspace_id = ${workspaceId} AND hostname = ${hostname}`);
      return row ? fromRow(row) : null;
    },
    async put({ binding: b, now, expectedVersion }) {
      const requirements = JSON.stringify(b.requirements);
      const lastResult = b.lastResult === null ? null : JSON.stringify(b.lastResult);
      // RETURNING tells a write that happened from one that lost the race (no row matched).
      const written = expectedVersion === null
        ? await kernel.query(sql`INSERT INTO domain_binding (workspace_id, hostname, provider_id, zone, requirements_json, status, delegation_state, attempt, started_at, next_check_at, last_checked_at, last_result_json, version, created_at, updated_at)
            VALUES (${workspaceId}, ${b.hostname}, ${b.providerId}, ${b.zone}, ${requirements}, ${b.status}, ${b.delegation}, ${b.attempt}, ${b.startedAt}, ${b.nextCheckAt}, ${b.lastCheckedAt}, ${lastResult}, ${b.version}, ${now}, ${now})
            ON CONFLICT (workspace_id, hostname) DO NOTHING RETURNING version`)
        : await kernel.query(sql`UPDATE domain_binding SET provider_id = ${b.providerId}, zone = ${b.zone}, requirements_json = ${requirements}, status = ${b.status},
            delegation_state = ${b.delegation}, attempt = ${b.attempt}, started_at = ${b.startedAt}, next_check_at = ${b.nextCheckAt},
            last_checked_at = ${b.lastCheckedAt}, last_result_json = ${lastResult}, version = ${b.version}, updated_at = ${now}
            WHERE workspace_id = ${workspaceId} AND hostname = ${b.hostname} AND version = ${expectedVersion} RETURNING version`);
      return written.length === 1;
    },
    async listDue({ now, limit }) {
      const rows = await kernel.query<Stored>(sql`SELECT ${COLUMNS} FROM domain_binding WHERE workspace_id = ${workspaceId} AND next_check_at IS NOT NULL AND next_check_at <= ${now} ORDER BY next_check_at, hostname LIMIT ${limit}`);
      return rows.map(fromRow);
    },
  };
}
