/** The connection id, and therefore the prefix of every tool the assistant sees:
 *  `mcp__tovu-desktop__<name>` (`trust.ts` R1). Must match `trust.ts`'s `CONNECTION_ID_PATTERN`
 *  (`/^[a-z0-9][a-z0-9-]{0,39}$/`) — lowercase, no underscore, since an underscore here would blur
 *  that id's own `__` separator. */
export const SITES_MCP_SERVER_ID = "tovu-desktop";

/** Private main-to-server launch contract. These values are never settings or CLI credentials. */
export const DESKTOP_MCP_URL_ENV = "TOVU_DESKTOP_MCP_URL";
export const DESKTOP_MCP_TOKEN_ENV = "TOVU_DESKTOP_MCP_TOKEN";
export const DESKTOP_MCP_HANDOFF_ENV = "TOVU_DESKTOP_MCP_HANDOFF_TOKEN";
