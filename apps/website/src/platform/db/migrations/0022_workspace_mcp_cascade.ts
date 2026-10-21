import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file ADR-066: order SQLite's workspace cascade without weakening vault protection.
 * PostgreSQL at 0021 already deletes workspaces with linked MCP secrets successfully, with
 * ON DELETE RESTRICT intact. SQLite checks RESTRICT immediately and, after 0020's vault rebuild,
 * reaches the vault before the servers. Delete those servers first, including their approval
 * children, so the existing cascades can finish. Direct vault deletion must still be refused.
 */
export const WORKSPACE_MCP_CASCADE_ID = "0022_workspace_mcp_cascade";

/** Fixed SQLite DDL shared with the synchronous fresh-database constructor. */
export const WORKSPACE_MCP_CASCADE_SQLITE = `CREATE TRIGGER workspaces_mcp_delete_first
  BEFORE DELETE ON workspaces
  BEGIN
    DELETE FROM external_mcp_servers WHERE workspace_id = OLD.id;
  END`;

/** Install the ordering trigger through the instrumented kernel; Postgres already has parity.
 * The runner owns transaction/rollback. DDL errors propagate. @complexity O(1) migration DDL.
 */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect === "sqlite") await kernel.execute(sql.raw(WORKSPACE_MCP_CASCADE_SQLITE));
}

/** Return the immutable workspace cascade step. @example workspaceMcpCascade({ checksum }) */
export function workspaceMcpCascade(required: { checksum: string }, _options = {}): MigrationStep {
  return { id: WORKSPACE_MCP_CASCADE_ID, checksum: required.checksum, up };
}
