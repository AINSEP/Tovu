import { buildConfirmationSurface as buildJiniConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { DatabaseTransferPlan } from "./plan-store.js";

/**
 * @file The card `database_transfer_run` raises before anything is written. Same held-open exchange
 * as `site-backup/confirmation-ui.ts`: Copy/Cancel carry `SURFACE_EXCHANGE_ID_PARAM` back to the same
 * tool call. Plain words only (no "schema", "role" or "connection string"): where the copy goes, how
 * much, what is left out, and that the site itself does not change.
 */

export const DATABASE_TRANSFER_RUN_TOOL_ID = "database_transfer_run";

export function databaseTransferConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/database-transfer-run/${exchangeId}` as UIResourceUri;
}

/** `3:41 PM, Sep 27` in the server's locale-neutral English. */
export function formatSnapshotTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** `spec.expiresAtMs` is the exchange's deadline, so the chat counts the card down and closes it — as
 *  `requireHumanConfirm` does. @complexity O(left-out tables). */
export function buildConfirmationSurface(spec: { plan: DatabaseTransferPlan; exchangeId: string; expiresAtMs?: number }): UIResource {
  const { plan, exchangeId, expiresAtMs } = spec;
  const where = `${plan.destination.database} on ${plan.destination.host}`;
  const leftOutRows = plan.leftOut.reduce((sum, entry) => sum + entry.rows, 0);
  const details = [
    { label: "Destination", value: where },
    { label: "Copies", value: `${plural(plan.tableCount, "table", "tables")}, ${plural(plan.rowCount, "row", "rows")}, as of ${formatSnapshotTime(plan.snapshotAt)}` },
    { label: "Goes into", value: `A private area named "${plan.schema}". Nothing else in that database is touched.` },
    { label: "Replaces", value: plan.replaces === null ? "Nothing. This is the first copy." : `The earlier copy from ${formatSnapshotTime(plan.replaces)}` },
    { label: "Left out", value: `Logins and saved keys (${plural(leftOutRows, "row", "rows")}). Photos and files stay where they are.` },
  ];
  return buildJiniConfirmationSurface({
    uri: databaseTransferConfirmationUri(exchangeId),
    title: `Copy this site's data to ${where}?`,
    description: "Your site keeps running on its built-in storage. This only makes a copy.",
    details,
    ...(plan.replaces === null ? {} : { warning: `The earlier copy from ${formatSnapshotTime(plan.replaces)} is replaced once this copy has been checked.` }),
    confirm: { label: "Copy", toolName: DATABASE_TRANSFER_RUN_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" } },
    cancel: { label: "Cancel", toolName: DATABASE_TRANSFER_RUN_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" } },
    app: { appName: "tovu-database-transfer-run", appVersion: "1" },
    preferredFrameSize: ["100%", "420px"],
    ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
  });
}
