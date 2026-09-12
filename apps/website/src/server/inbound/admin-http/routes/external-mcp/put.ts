import {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  type SaveExternalMcpOAuthInput,
  saveExternalMcpServer,
} from "#src/assistant/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { triggerFederationReload } from "#src/server/runtime/composition/modules/assistant-daemon-client";
import type { ExternalMcpRouteRegistrar } from "./deps.js";
import { guardExternalMcpRequest } from "./guard.js";

/** `undefined`/non-string collapses to `""` — the ordinary (non tri-state) field default this
 *  route uses for `command`/`args`/`allowedToolNames`. @complexity O(1). */
function asStringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Carries a string field ONLY when the caller actually sent one, so `undefined` (keep what is
 *  stored) stays distinguishable from `""` (clear it). The `env` rule, applied to every field that
 *  shares its three-way meaning. @complexity O(1). */
function optionalStringField(value: unknown, key: string): Record<string, string> {
  return typeof value === "string" ? { [key]: value } : {};
}

/**
 * The OAuth block of a PUT body.
 *
 * Every member is tri-state for the same reason `env` is: an operator renaming a connection, or
 * toggling it off, sends no OAuth fields at all, and collapsing that into `""` would clear the
 * client id and secret of a working connection. So absent keys are dropped rather than defaulted,
 * and `saveExternalMcpServer` applies the keep/replace/clear rule.
 *
 * `clientSecret` is read here and never written back — no read model in this subsystem returns it.
 *
 * @complexity O(1).
 */
function parseExternalMcpOAuthBody(rawOAuth: unknown): { oauth?: SaveExternalMcpOAuthInput } {
  if (rawOAuth === null || typeof rawOAuth !== "object" || Array.isArray(rawOAuth)) return {};
  const oauth = rawOAuth as Record<string, unknown>;

  const parsed: SaveExternalMcpOAuthInput = {
    ...optionalStringField(oauth.providerId, "providerId"),
    ...optionalStringField(oauth.grant, "grant"),
    ...optionalStringField(oauth.clientId, "clientId"),
    ...optionalStringField(oauth.clientSecret, "clientSecret"),
    ...optionalStringField(oauth.scopes, "scopes"),
    ...optionalStringField(oauth.tokenEnvName, "tokenEnvName"),
    ...optionalStringField(oauth.authorizationEndpoint, "authorizationEndpoint"),
    ...optionalStringField(oauth.tokenEndpoint, "tokenEndpoint"),
    ...optionalStringField(oauth.deviceAuthorizationEndpoint, "deviceAuthorizationEndpoint"),
  };

  return Object.keys(parsed).length === 0 ? {} : { oauth: parsed };
}

/**
 * This route's writable PUT fields, read off an untyped body in one place. `label`, `url`,
 * `authMode`, `env` and the whole `oauth` block stay spreadable-optional (an absent key vs. an
 * explicit value are different things — see this route's own doc comment on `env`'s three-way
 * meaning); everything else gets its default here.
 *
 * @complexity O(1).
 */
function parseExternalMcpPutBody(rawBody: unknown) {
  const body = (rawBody ?? {}) as Record<string, unknown>;
  return {
    ...(typeof body.label === "string" ? { label: body.label } : {}),
    // Defaulted rather than required so a caller that omits it gets the transport that every row
    // written before a second one existed effectively had, instead of a validation error naming a
    // choice it was never offered.
    transport: typeof body.transport === "string" ? body.transport : "stdio",
    enabled: body.enabled !== false,
    command: asStringField(body.command),
    // Only meaningful for a remote transport, and tri-state so a stdio-shaped PUT does not clear a
    // stored endpoint.
    ...optionalStringField(body.url, "url"),
    // Absent keeps an existing row's mode rather than silently demoting an OAuth connection to
    // `static_env` — which is what a toggle or rename would otherwise do.
    ...optionalStringField(body.authMode, "authMode"),
    args: asStringField(body.args),
    allowedToolNames: asStringField(body.allowedToolNames),
    // Same `asStringField` treatment as `allowedToolNames` above — resent in full on every save, not
    // tri-state. NOTE (task #30, R-3): a non-string body value (e.g. an array) collapses to `""`
    // here, which for THIS field silently clears every write grant. Known, pre-existing behaviour of
    // `asStringField` on the sibling field too — undesirable, but it fails CLOSED, so it is not fixed
    // in this change. See `admin-external-mcp-routes.test.ts` for the pinned regression.
    writeAllowedToolNames: asStringField(body.writeAllowedToolNames),
    // Deliberately NOT `asStringField` — see this route's doc comment. `undefined` must survive.
    ...optionalStringField(body.env, "env"),
    ...parseExternalMcpOAuthBody(body.oauth),
  };
}

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
 * A saved row does NOT necessarily take effect until the agent daemon restarts — the admitted tool
 * set for any ONE connection is still frozen at connect (`mcp-federation/trust.ts` R5) and this route
 * does not, and cannot, change that: editing an already-admitted connection's allowlist, credentials,
 * or transport here still needs a real restart, because that connection's one-time admission already
 * happened. `restartRequired: true` in the response reflects exactly that — it is conservative by
 * design, not stale: it stays true even for a brand-new row, because whether the SECONDARY hot-reload
 * trigger below actually admitted it depends on facts this route does not read back (daemon
 * reachability, whether the connection is `authMode: "oauth"` and therefore not yet authorized).
 *
 * Federation hot-reload trigger (2026-09-11), fired unconditionally after every successful save,
 * fire-and-forget (never awaited by the response): the daemon-side coordinator
 * (`mcp-federation/reload.ts`) is what actually decides whether anything changed — a save that only
 * edited fields on an ALREADY-admitted connection is a genuine no-op there (R5, restated above), and
 * a fresh `authMode: "oauth"` row is a no-op too until its own callback later completes and fires
 * the PRIMARY trigger (`public-http/routes/external-mcp/oauth-callback.ts`). The one case this
 * actually helps is a brand-new, immediately-usable connection (`static_env`/no-OAuth transport) —
 * exactly the "operator save/approve" trigger the feature's own spec calls out as the SECONDARY path,
 * next to a completed OAuth sign-in as the primary one.
 */
export const registerAdminExternalMcpPutRoute: ExternalMcpRouteRegistrar = (app, deps) => {
  app.put("/api/admin/v1/workspaces/:workspaceId/mcp-servers/:serverId", async (req, res) => {
    try {
      if (!(await guardExternalMcpRequest(deps, req.params.workspaceId, res))) return;

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
          // The guard above already authorized this same principal — a second, cheap read off
          // `res.locals` (`getAuthedPrincipal` does no I/O), used ONLY to attribute a change to
          // `writeAllowedToolNames` if this save makes one.
          principalId: getAuthedPrincipal(res).id,
          ...parseExternalMcpPutBody(req.body),
        },
      );

      // Fire-and-forget: never awaited, so this route's own response time and shape are unaffected
      // by daemon reachability — see this file's own header for why `restartRequired` stays `true`
      // unconditionally regardless of what this trigger ends up doing.
      void triggerFederationReload();
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
