import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0024: `domain_binding`, one row per (workspace, hostname) a site wants served
 * (domains & DNS lots D1–D3, Jini `@jini-ai/devops/dns`).
 *
 * - `requirements_json` persists the DomainRequirement[] (routing AND mail records) at the moment
 *   they are known, so verification compares against what the host/mail provider asked for instead
 *   of re-deriving host IPs (the `domain_check_dns` gap).
 * - `status` has ONE writer: the verify path (`dns_verify` and its due sweep). `unknown` is a
 *   transport failure to retry, never a failed domain; `timeout` is the 48 h propagation cap.
 * - `delegation_state` records the last NS delegation read (registrar vs DNS host split).
 * - `attempt` / `started_at` / `next_check_at` drive the 30 s → 10 min backoff; the index serves the
 *   due-bindings sweep.
 *
 * Rows go with their workspace (ON DELETE CASCADE, as `mail_send_ledger`). Portable DDL
 * (text/integer only) for SQLite and Postgres, shared with the fresh-database bootstrap.
 */
export const DOMAIN_BINDINGS_ID = "0024_domain_bindings";

export const DOMAIN_BINDINGS_STATEMENTS = [
  `CREATE TABLE domain_binding (workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, hostname text NOT NULL, provider_id text NOT NULL DEFAULT 'manual', zone text NOT NULL, requirements_json text NOT NULL, status text NOT NULL CHECK (status IN ('pending', 'propagated', 'mismatch', 'timeout', 'unknown')), delegation_state text CHECK (delegation_state IN ('delegated', 'not_delegated', 'unknown')), attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0), started_at text NOT NULL, next_check_at text, last_checked_at text, last_result_json text, created_at text NOT NULL, updated_at text NOT NULL, PRIMARY KEY (workspace_id, hostname))`,
  // The due sweep reads bindings still waiting for their next check, earliest first.
  "CREATE INDEX idx_domain_binding_next_check ON domain_binding (workspace_id, next_check_at)",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of DOMAIN_BINDINGS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example domainBindings({ checksum: pinnedChecksum }) */
export function domainBindings(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: DOMAIN_BINDINGS_ID, checksum: required.checksum, up };
}
