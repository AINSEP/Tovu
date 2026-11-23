# P9-BREAKS row — X-external-mcp-1 (rv-d Integrations 3)

Fold this row into `plans/P9-BREAKS.md` (branch `plan/whats-left-1122`) before the X-external-mcp-1
Jini/Tovu pair is combined. It replaces the existing X-external-mcp-1 row, whose last two columns are
empty. Recorded here because unattended runs may not push `plan/*` branches.

| step | file:line (Tovu, before the move) | literal | new name (implementer) | what breaks for existing installs (implementer) |
|---|---|---|---|---|
| X-external-mcp-1 | `apps/website/src/features/external-mcp/built-in-connections.ts:7` | `const value: unknown = JSON.parse(env.TOVU_BUILT_IN_MCP_SERVER_IDS ?? "[]");` | `JINI_BUILT_IN_MCP_SERVER_IDS` — read by Jini `packages/mcp/src/external/built-in-connections.ts:7` (`readBuiltInExternalMcpServerIds`), written by Tovu `apps/desktop/src/tovu-server.ts:485` (`buildServeEnv`) | Desktop-launched sites: none (the desktop shell writes the new name). A site process launched manually or by a custom supervisor that still sets only `TOVU_BUILT_IN_MCP_SERVER_IDS` now reads an empty managed roster: every external MCP server is reported `builtIn: false` by `GET` external-mcp list (`describeExternalMcpOwnership`), and the permanent-delete guard (`permanent-delete-deps.ts`, `isBuiltInExternalMcpServer`) no longer protects the managed Sites server. Fix: rename the variable to `JINI_BUILT_IN_MCP_SERVER_IDS` in that launch configuration. No stored data changes. |
