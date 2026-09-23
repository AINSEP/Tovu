/**
 * @file The ONE place `external_mcp_servers`' AES-GCM additional authenticated data (AAD) strings
 * are formatted — same convention as `execution-credential-aad.ts` and its siblings: every
 * `seal()`/`open()` call for this table MUST go through these functions so sealing and opening can
 * never drift onto two different formats (which would make every row permanently unopenable, since
 * AAD is authenticated but never stored — see `../features/webhooks/secret-sealer.aesgcm.ts`).
 *
 * ## Why this table needs TWO builders, unlike every sibling
 *
 * `external_mcp_servers` carries **two independent sealed blobs on the same row**:
 *
 * - `sealed_*` — the static env block (`{NAME: value}`) handed to a stdio child process.
 * - `oauth_sealed_*` — `{ clientSecret?, tokens? }` for an OAuth-authorized connection.
 *
 * They are different secret classes with different lifecycles: an env block is operator-entered and
 * changes when the operator edits it, while the OAuth blob is rotated by a refresh flow. Sealing
 * both under one AAD would make them interchangeable *within a row* — an attacker able to move
 * column values could present the env blob in the OAuth slot and vice versa. The distinct
 * `external-mcp-env:` / `external-mcp-oauth:` prefixes are domain separation, and they are why this
 * table also carries two independent version discriminators rather than one.
 *
 * Format: `external-mcp-{env,oauth}:v1:${workspaceId}:${serverId}`. This table has no surrogate
 * `id` column — `(workspace_id, server_id)` IS the primary key (`db/schema.sqlite.ts`'s
 * `externalMcpServers`) — so the AAD binds that composite PK directly. A ciphertext sealed for one
 * server fails auth-tag verification if presented as any other server's, in the same workspace or
 * any other.
 *
 * This table's rows predate AAD entirely: both `.seal()` call sites in `external-mcp-store.ts`
 * passed no AAD until the 2026-09-02 follow-up gap closure, and the table was not in `ffb5ce44`'s
 * five. See `aad_version`/`oauth_aad_version` in `db/schema.sqlite.ts` and
 * `development/scripts/backfill-external-mcp-aad.ts` for how existing rows migrate without becoming
 * unreadable.
 */

/** The composite primary key an `external_mcp_servers` AAD binds. */
export interface ExternalMcpAadIdentity {
  readonly workspaceId: string;
  readonly serverId: string;
}

const AAD_VERSION = "v1";

/**
 * The current AAD version for newly sealed blobs. Rows still at `0` were sealed before AAD existed
 * and are opened through the legacy no-AAD path — see the store's `open*` helpers.
 */
export const EXTERNAL_MCP_AAD_VERSION = 1;

/**
 * Builds the AAD for a row's sealed **env block** (`sealed_*`).
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildExternalMcpEnvAad(input: ExternalMcpAadIdentity): string {
  return `external-mcp-env:${AAD_VERSION}:${input.workspaceId}:${input.serverId}`;
}

/**
 * Builds the AAD for a row's sealed **OAuth blob** (`oauth_sealed_*`, holding `clientSecret` and
 * `tokens`). Deliberately a different string from {@link buildExternalMcpEnvAad} for the same row.
 *
 * @complexity O(1) — a fixed-shape string template.
 */
export function buildExternalMcpOAuthAad(input: ExternalMcpAadIdentity): string {
  return `external-mcp-oauth:${AAD_VERSION}:${input.workspaceId}:${input.serverId}`;
}
