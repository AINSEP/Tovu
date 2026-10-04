import type { SealedSecret } from "#src/features/webhooks/index";

/**
 * @file The external-MCP domain's auth-mode readers, moved here from `assistant/external-mcp-store.ts`
 * (2026-10-03, owner decision C) so `features/agent-plugins/{connect-tool,federate-mcp}.ts` can read a
 * row's credential mode without value-importing from `src/assistant/` — the edge
 * `assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts` forbids. The store
 * imports these and re-exports them, so every existing `#src/assistant/index` importer is unchanged.
 *
 * Parameters are declared STRUCTURALLY (the two fields each reader touches) rather than as
 * `Pick<ExternalMcpServerRecord, ...>`: the record type lives in the store, which imports THIS file,
 * so naming it here would close an import cycle. `ExternalMcpServerRecord` satisfies both shapes.
 */

/**
 * How a server's credentials are obtained — independent of `ExternalMcpTransport`.
 *
 * - `none` — no credentials at all. Common for local developer tooling.
 * - `static_env` — the operator pasted a `KEY=VALUE` block. What this store has always done, and
 *   the default for every row that predates this field.
 * - `oauth` — Tovu holds a token it obtained itself and must keep alive. See
 *   `assistant/external-mcp-oauth.ts`.
 */
export const EXTERNAL_MCP_AUTH_MODES = ["none", "static_env", "oauth"] as const;
export type ExternalMcpAuthMode = (typeof EXTERNAL_MCP_AUTH_MODES)[number];

/**
 * Reads a row's auth mode, defaulting a row written before the column existed.
 *
 * `static_env` is the correct default rather than `none`: every pre-existing row was written by a
 * form whose only credential mechanism was the env block, and a row with an empty block behaves
 * identically under either mode. Defaulting to `none` would silently relabel rows that DO carry a
 * sealed block as credential-free.
 *
 * @complexity O(1).
 */
export function resolveExternalMcpAuthMode(record: { authMode: string }): ExternalMcpAuthMode {
  const mode = record.authMode;
  return EXTERNAL_MCP_AUTH_MODES.includes(mode as ExternalMcpAuthMode) ? (mode as ExternalMcpAuthMode) : "static_env";
}

/**
 * Whether a row holds a `static_env` access token — answered from plaintext columns, never by unsealing.
 *
 * Truthful because a `static_env` row's sealed OAuth blob only ever holds that token: leaving `oauth`
 * clears the client secret and token set (`assistant/external-mcp-store.ts`'s `resolveSealedOAuthBlob`),
 * and entering `oauth` never carries this token forward (`openExternalMcpOAuthPayload`'s callers
 * rebuild the payload from `clientSecret`/`tokens` alone).
 *
 * @complexity O(1).
 */
export function externalMcpRecordHasStaticAccessToken(record: { authMode: string; sealedOAuth: SealedSecret | null }): boolean {
  return resolveExternalMcpAuthMode(record) === "static_env" && Boolean(record.sealedOAuth);
}
