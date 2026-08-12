import {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  saveExternalMcpServer,
} from "#src/assistant/index";
import type { ExternalMcpRouteRegistrar } from "./deps";
import { guardExternalMcpRequest } from "./guard";

/**
 * PUT one external MCP server — creates it, or replaces the stored row for an existing id.
 *
 * Idempotent-by-id rather than POST-creates/PATCH-updates, because the admin tab's add form and its
 * expand-to-edit card are the same shape submitting the same fields; two routes would be two
 * validators of one contract.
 *
 * `env` is the one field with three distinct meanings, and the route preserves all three rather
 * than collapsing them: ABSENT keeps whatever credentials are stored (what an enable/disable toggle
 * sends, since the UI never received the values to send back), a STRING replaces them, and an EMPTY
 * string clears them. Collapsing absent into empty is how a toggle would silently wipe a token.
 *
 * A saved row does NOT take effect until the agent daemon restarts — the admitted tool set is
 * frozen at connect (`mcp-federation/trust.ts` R5), so re-reading this roster mid-process would
 * have to re-establish that guarantee. The response says so explicitly via `restartRequired` rather
 * than letting the tab imply the server is already live.
 */
export const registerAdminExternalMcpPutRoute: ExternalMcpRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const asString = (value: unknown): string => (typeof value === "string" ? value : "");

      const server = await saveExternalMcpServer(
        {
          repo: deps.externalMcpServerRepo,
          sealer: deps.siteAssistantSecretSealer,
          keyring: deps.siteAssistantSecretKeyring,
          clock: deps.clock,
        },
        {
          workspaceId: deps.workspaceId,
          serverId: String(req.params.serverId ?? ""),
          ...(typeof body.label === "string" ? { label: body.label } : {}),
          // Defaulted rather than required so a caller that omits it gets the only transport that
          // exists, instead of a validation error naming a choice it was never offered.
          transport: typeof body.transport === "string" ? body.transport : "stdio",
          enabled: body.enabled !== false,
          command: asString(body.command),
          args: asString(body.args),
          allowedToolNames: asString(body.allowedToolNames),
          // Deliberately NOT `asString` — see this route's doc comment. `undefined` must survive.
          ...(typeof body.env === "string" ? { env: body.env } : {}),
        },
      );

      res.json({ server, restartRequired: true });
    } catch (err) {
      if (err instanceof ExternalMcpValidationError) {
        res.status(400).json({ error: err.message, code: "INVALID_MCP_SERVER", details: { field: err.field } });
        return;
      }
      if (err instanceof ExternalMcpSecretStoreUnconfiguredError) {
        res.status(503).json({ error: err.message, code: "SECRET_STORE_UNCONFIGURED" });
        return;
      }
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
};
