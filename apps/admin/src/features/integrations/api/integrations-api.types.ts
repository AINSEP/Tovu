import type { AdminAgentPluginRow } from "@jini-ai/core/contracts/site/cms-agent-plugins";
import type { ExternalMcpToolApprovalDto } from "@jini-ai/core/contracts/site/cms-external-mcp";
import type { CredentialTokenHint } from "@jini-ai/core/contracts/site/secrets-credential-token";
import type { AdminPluginFiles } from "../../plugins/api/plugins-api.types";

/**
 * One configured external MCP server, as the admin tab sees it. Mirrors
 * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpServerView`.
 *
 * `envNames` without any matching values is the whole point of the shape, not an omission: the
 * variable names are what an operator needs in order to see which credentials are set, and the
 * values are what must never leave the server.
 */
/**
 * The OAuth half of {@link AdminExternalMcpServer}. Mirrors
 * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpOAuthView` — never carries an access token, a
 * refresh token, or a client secret; `hasStoredToken` is presence only, the same technique the view
 * it mirrors uses.
 */
export interface AdminExternalMcpOAuthView {
  providerId: string | null;
  grant: string | null;
  clientId: string | null;
  scopes: string[];
  status: string;
  expiresAt: string | null;
  tokenEnvName: string | null;
  hasStoredToken: boolean;
}

/**
 * One configured external MCP server, as the admin tab sees it. Mirrors
 * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpServerView`.
 *
 * `envNames` without any matching values is the whole point of the shape, not an omission: the
 * variable names are what an operator needs in order to see which credentials are set, and the
 * values are what must never leave the server. `url`/`authMode`/`oauth` are the same posture applied
 * to the two fields the generic streamable-HTTP + OAuth transport added on top of the original
 * stdio-only shape.
 */
/** `POST .../mcp-servers/:serverId/oauth/connect`'s `auth`. Mirrors `apps/website/src/features/external-mcp/contracts.ts`'s
 *  `ExternalMcpConnectStart`; the device code itself never leaves the server. */
export type AdminExternalMcpConnectStart =
  | { kind: "redirect_required"; authorizationUrl: string; expiresAt: string }
  | { kind: "device_code"; userCode: string; verificationUri: string; verificationUriComplete: string | null; expiresAt: string; intervalSeconds: number };

/** One saved "Always allow" from `GET .../mcp-servers/tool-approvals` — a remote tool the approval
 *  card no longer asks about. Revoking it makes the card ask again. The wire shape is declared once in
 *  Jini Core (`@jini-ai/core/contracts/site/cms-external-mcp`, rv1123e K1), which the route spec answers. */
export type AdminExternalMcpToolApproval = ExternalMcpToolApprovalDto;

export interface AdminExternalMcpServer {
  /** Edit revision; sent back as `expectedVersion` so a save from an older screen is refused (409 `VERSION_CONFLICT`). */
  version: number;
  /** Source-derived runtime ownership, absent on older servers. */
  builtIn?: boolean;
  serverId: string;
  label: string;
  transport: string;
  /** One of `apps/website/src/features/external-mcp/agent-tools.ts`'s `EXTERNAL_MCP_AUTH_MODES` — `none` | `static_env` | `oauth`. */
  authMode: string;
  enabled: boolean;
  command: string;
  /** Endpoint for a `streamable_http` server. `null` for `stdio`, where `command` is used instead. */
  url: string | null;
  args: string[];
  allowedToolNames: string[];
  /**
   * The operator's SECOND, write-authorization list — mirrors
   * `apps/website/src/features/external-mcp/contracts.ts`'s `ExternalMcpServerView.writeAllowedToolNames`. A remote
   * tool declaring `readOnlyHint: false` is admitted only when it appears in BOTH this list and
   * {@link allowedToolNames} (`mcp-federation/trust.ts` R3's override). Independent of
   * `allowedToolNames`, never derived from it.
   */
  writeAllowedToolNames: string[];
  /**
   * Who last CHANGED {@link writeAllowedToolNames}, and when — mirrors the store's own view fields
   * of the identical name. Both `null` until that list is ever touched, or for a row written before
   * these columns existed. Read-only: there is no input counterpart, since a save attributes itself
   * from the authenticated principal server-side rather than accepting a caller-supplied identity.
   */
  writeGrantsUpdatedByPrincipalId: string | null;
  writeGrantsUpdatedAt: string | null;
  envNames: string[];
  /** Whether a static access token (auth mode `static_env`) is stored. Presence only — the token is
   *  sealed and never returned. Optional so an API that predates the field reads as "none stored". */
  hasAccessToken?: boolean;
  accessTokenHint?: CredentialTokenHint | null;
  envTokenHints?: Readonly<Record<string, CredentialTokenHint>>;
  /** For a `stdio` + `static_env` server: which environment variable receives that token. */
  accessTokenEnvName?: string | null;
  oauth: AdminExternalMcpOAuthView;
}

/**
 * The OAuth half of {@link AdminExternalMcpServerInput}. Every member is tri-state exactly as the
 * store's own `SaveExternalMcpOAuthInput` is: an absent key keeps whatever is stored, a string
 * replaces it. `clientSecret` is the one member that is ALSO write-only — no read model in this
 * subsystem ever returns it, so the form can only ever send a new one or say nothing.
 */
export interface AdminExternalMcpOAuthInput {
  providerId?: string;
  grant?: string;
  clientId?: string;
  clientSecret?: string;
  /** Raw operator input, comma- or space-separated. */
  scopes?: string;
  tokenEnvName?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  deviceAuthorizationEndpoint?: string;
}

/**
 * Write shape for one external MCP server. `args`/`allowedToolNames`/`env` are the operator's raw
 * strings — the server owns parsing them, so the admin never has a second, subtly different parser
 * that could accept something the store rejects.
 */
export interface AdminExternalMcpServerInput {
  /** The `version` this tab last loaded or saved for the server; absent for a create. */
  expectedVersion?: number;
  label?: string;
  transport: string;
  enabled: boolean;
  command: string;
  /** Endpoint for a `streamable_http` server. Ignored for `stdio`. */
  url?: string;
  args: string;
  allowedToolNames: string;
  /**
   * Raw operator input, comma-separated remote tool names separately authorized to write. Same
   * "resent in full on every save" convention as {@link allowedToolNames} — NOT tri-state like
   * {@link env}, since the tab always has the current list in the clear and can always resend it.
   * The server rejects a save (`ExternalMcpValidationError(field: "writeAllowedToolNames")`) if this
   * names a tool absent from {@link allowedToolNames} — mirrors
   * `src/assistant/external-mcp-store.ts`'s C-006 subset check.
   */
  writeAllowedToolNames: string;
  /** Omit to keep stored credentials; `""` to clear them. The distinction is load-bearing. */
  env?: string;
  /** Absent keeps an existing row's auth mode; otherwise one of `none` | `static_env` | `oauth`. */
  authMode?: string;
  /** SECRET, write-only, `static_env` only. Tri-state like {@link env}: omit to keep the stored token,
   *  a string replaces it, `""` clears it. Delivered as `Authorization: Bearer` to a hosted server, or
   *  as {@link accessTokenEnvName} to a local command. */
  accessToken?: string;
  /** For `stdio` + `static_env`: the environment variable that receives {@link accessToken}. */
  accessTokenEnvName?: string;
  oauth?: AdminExternalMcpOAuthInput;
}

export interface AdminWebhookDeliverySummary {
  id: string;
  status: "pending" | "delivering" | "delivered" | "failed" | "dead" | "canceled";
  attempts: number;
  lastResponseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

export interface AdminWebhookSubscription {
  id: string;
  label: string;
  targetUrl: string;
  topics: string[];
  status: "active" | "paused" | "disabled";
  secretVersion: number;
  previousSecretVersion: number | null;
  createdAt: string;
  updatedAt: string;
  disabledAt: string | null;
  lastDelivery: AdminWebhookDeliverySummary | null;
}

export interface AdminWebhookDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  topic: string;
  status: AdminWebhookDeliverySummary["status"];
  attempts: number;
  nextAttemptAt: string;
  lastResponseStatus: number | null;
  lastError: string | null;
  signedWithVersion: number | null;
  createdAt: string;
  deliveredAt: string | null;
  deadAt: string | null;
}

/** Mirrors `server/inbound/admin-http/routes/agent-plugins/list.ts`'s response shape — the
 *  `AGENT_PLUGINS_LIST` per-plugin wire shape (2026-09-09). A DIFFERENT family from {@link
 *  AdminPlugin} above: Agent Plugins (agent-plugins.org packages) versus the `.tovu-plugin`
 *  site/runtime plugins `AdminPlugin` describes — see that route's own header. `version`/
 *  `description` are nullable, not optional-absent: the wire always sends the key, `null` when the
 *  installed package's own `plugin.json` carries none (the spec itself makes both fields optional). */
export type AdminAgentPlugin = AdminAgentPluginRow<
  /** This host's maturity values; absent means normal. */
  "untested" | "soon",
  "connected" | "disconnected" | "pending" | "needs_reauth",
  "bundled" | "operator-installed"
>;

/** `AGENT_PLUGIN_FILES`' response (`server/inbound/admin-http/routes/agent-plugins/files.ts`,
 *  2026-09-13): one installed Agent Plugin's own files — the same entries and caps as
 *  {@link AdminPluginFiles}, minus the `.tovu-plugin`-only `source`. */
export type AdminAgentPluginFiles = Omit<AdminPluginFiles, "source">;
