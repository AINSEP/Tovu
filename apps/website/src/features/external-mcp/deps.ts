import type { AuthorizeFn, ClockPort, UUID } from "@jini-ai/cms/core";

// `#src/*` maps to `./src/*.ts` (package.json `imports`), so the subpath carries no `.js`
// suffix — unlike a relative specifier, which does. `#src/assistant/index` below is the same shape.
import type { KeyringPort, SecretSealerPort } from "#src/features/webhooks/index";
import type { ExternalMcpOAuthService, ExternalMcpServerRepoPort } from "#src/assistant/index";

/**
 * @file The exact slice of a composition root's deps bag this domain's tool handlers read.
 *
 * Declared STRUCTURALLY (not `Pick<RouteDeps, ...>`) for the same reason `features/site-inspection/
 * deps.ts` gives: this module carries no back-edge into `server/routes/types.ts`'s `RouteDeps` god
 * type. `server/routes/admin/external-mcp/deps.ts` (the HTTP route's own narrow slice) satisfies
 * this structurally by passing its existing `RouteDeps` object — nothing there changes.
 *
 * `ExternalMcpServerRepoPort`/`ExternalMcpOAuthService` are type-imported from `#src/assistant/
 * index` rather than restated, unlike `AuthorizeFn`/`ClockPort` (an external package) and
 * `SecretSealerPort`/`KeyringPort` (restated as a type-only import from `#src/features/webhooks/index.js`,
 * ADR-058's shared sealer/keyring types, the same instances the Composio/BYOK/media-provider stores
 * share). This domain's `tool-registrations.ts` ALREADY value-imports `saveExternalMcpServer`/
 * `listExternalMcpServerViews`/etc. from that same `#src/assistant/index` barrel — the identical
 * seam `server/routes/admin/external-mcp/put.ts` uses — so importing their types from there too adds
 * no new edge, it is the same one already being crossed.
 *
 * ## `externalMcpOAuth` is OPTIONAL here, unlike the HTTP route's own narrowing
 *
 * `server/routes/admin/external-mcp/oauth.ts` narrows it to REQUIRED on its own deps type, because
 * that file registers nothing but OAuth routes — a composition root that mounts them without the
 * service could not compile. This domain is different: `external_mcp_list`/`external_mcp_save`/
 * `external_mcp_test_connection` need no OAuth service at all (test_connection degrades to reporting
 * "no OAuth token resolver wired" for an oauth-mode row rather than failing to build), and only
 * `external_mcp_oauth_connect`/`external_mcp_oauth_poll_device` require one — checked at the top of
 * each of those two handlers, fail-closed, the same posture `content_post_delete` takes for a missing
 * `ctx.emitSurface`.
 *
 * ## The cross-process caveat this domain does NOT solve
 *
 * `external-mcp-oauth.ts`'s own header states its `pending`/`devices` stores are in-memory and must
 * therefore live in the SAME process as the public OAuth callback route
 * (`server/routes/external-mcp/oauth-callback.ts`), which today is the admin web server's process.
 * If THIS domain is wired into a composition root running in a DIFFERENT process from that callback
 * route — the spawned agent-daemon path (`server/agent-daemon/agent-daemon-server.ts`), as opposed to
 * the in-process BYOK path (`server/modules/assistant-byok.ts`) — an `authorization_code` connect
 * started via `external_mcp_oauth_connect` mints a `pending` authorization the callback route's
 * process can never see, and the human's completed browser sign-in fails to redeem. This is a
 * pre-existing tradeoff (`external-mcp-oauth.ts` names it as a known limitation of the in-memory
 * stores), not something introduced or silently worked around here, and it is disclosed again on
 * `tool-registrations.ts`'s `external_mcp_oauth_connect` handler. The `device_code` grant is
 * unaffected — this domain owns both its begin and poll steps in the same process either way.
 */
export interface ExternalMcpToolDeps {
  workspaceId: UUID;
  authorize: AuthorizeFn;
  clock: ClockPort;
  externalMcpServerRepo: ExternalMcpServerRepoPort;
  siteAssistantSecretSealer: SecretSealerPort;
  siteAssistantSecretKeyring: KeyringPort;
  /** See this file's own header for why this is optional here but required for the two OAuth tools. */
  externalMcpOAuth?: ExternalMcpOAuthService;
  /**
   * This process's own best-effort public origin, absent an operator-set `TOVU_PUBLIC_URL` — see
   * `routes/types.ts`'s `derivedPublicOrigin` doc for the full derivation and
   * `tool-registrations.ts`'s `resolveExternalMcpOAuthRedirectUri` for the one reader. Optional for
   * the same structural reason `externalMcpOAuth` above is: a caller that never sets it (a narrower
   * test double, say) just gets no fallback, not a broken build.
   */
  derivedPublicOrigin?: string;
}
