import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { UUID } from "@jini-ai/cms/core";

import {
  SURFACE_DISMISSED_PARAM,
  askOnce,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
  type SurfaceMessage,
} from "../../contracts/core/tool-surface-exchanges.js";
import type { ToolContributor } from "#src/assistant/index";
// Value imports from `#src/assistant/index` — the same seam `server/inbound/admin-http/routes/
// external-mcp/{put,probe}.ts` already use for the identical operations. See `deps.ts`'s own header,
// which anticipates exactly this: "This domain's `tool-registrations.ts` ALREADY value-imports
// `saveExternalMcpServer`/`listExternalMcpServerViews`/etc. from that same `#src/assistant/index`
// barrel". Verified empirically (not assumed) against `.dependency-cruiser.mjs`'s
// `domain-no-direct-assistant-tool-registration` rule, which bans a `features/**` value-import of
// `assistant/**` in general but exists specifically to stop a domain calling
// `registerToolContributor` directly — this file never does that (only `server/runtime/composition/
// tool-catalog-manifest.ts` may), and `npm run check:boundaries` confirms this import adds no new
// violation. `external-mcp-store.ts`/`external-mcp-oauth.ts` own this domain's actual read/write
// logic; nothing here re-implements it.
import {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  listExternalMcpServerViews,
  readEnabledExternalMcpConfigs,
  saveExternalMcpServer,
  type SaveExternalMcpOAuthInput,
  type SaveExternalMcpServerInput,
} from "#src/assistant/index";
import type { ExternalMcpToolDeps } from "./deps.js";
import { externalMcpAgentToolCatalog, EXTERNAL_MCP_MANAGE_PERMISSION } from "./agent-tools.js";
import { buildExternalMcpSaveForm, mergeExternalMcpSavePrefill, EXTERNAL_MCP_SAVE_TOOL_ID, type ExternalMcpSaveInput } from "./save-form.js";

/**
 * @file Wires `agent-tools.ts`'s 5-entry External MCP catalog to real handlers — the domain's own
 * header states the whole reason this file exists: "a non-technical site owner should be able to
 * type 'connect me to Higgsfield' into the admin assistant chat", which required this file and did
 * not work before it (no `contributeExternalMcpTools`, no manifest entry — confirmed by
 * `ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md`, Gap #1). Only the narrower,
 * already-wired `external_mcp_reauth_prompt` (`external-mcp-reauth-tool.ts`) reached the assistant
 * before this file.
 *
 * The catalog is wired in FULL — there is no `unwiredToolIds` set here, matching `agent-tools.ts`'s
 * own header ("All five are wired"), which means the kit treats any future catalog entry added
 * without a handler as a build failure.
 *
 * ## `external_mcp_save`: one call, held open, exactly like `content_post_delete`
 *
 * The model's own call never writes anything by itself — it opens an MCP-UI form
 * (`save-form.ts`'s `buildExternalMcpSaveForm`) and parks on `askOnce` until the human submits or
 * cancels it, or it expires. `mergeExternalMcpSavePrefill` fills the form with an existing row's
 * current (non-secret) values when `id` already names one, so an update shows the human accurate
 * state for anything the model did not restate. Every secret field (`env`, `oauthClientSecret`)
 * exists ONLY in the rendered form, never in the model's own input schema — see `agent-tools.ts`'s
 * header for why that is load-bearing, not incidental.
 *
 * ## `external_mcp_test_connection` never opens a socket
 *
 * It reuses `readEnabledExternalMcpConfigs` — the SAME resolver the daemon runs at boot and
 * `probe.ts` resolves its target through — but, unlike `probe.ts`, stops there: no
 * `connectMcpHttpSession` call. That matches `agent-tools.ts`'s own description: "This does NOT
 * launch the command or make a network call to the remote server".
 *
 * ## `external_mcp_oauth_connect` has no live HTTP request to build a redirect URL from
 *
 * The admin route (`server/inbound/admin-http/routes/external-mcp/oauth.ts`) derives the callback's
 * absolute origin from the LIVE request (`externalMcpOAuthCallbackUrl`/`resolvePublicOrigin(req)`).
 * A tool-call handler has no `req` at all — the identical structural gap
 * `assistant/admin-screen-link-tool.ts`'s own header already worked through for a different tool.
 * This file follows that same precedent rather than inventing a new one: a small, LOCAL
 * `resolveConfiguredPublicOrigin()` reads only `TOVU_PUBLIC_URL` (the one branch of
 * `resolvePublicOrigin` that does not need `req`), duplicated rather than imported for the same
 * reason `admin-screen-link-tool.ts` gives — importing `server/inbound/public-http/routes/
 * external-mcp/oauth-callback-url.ts` would need a `Request` this file cannot supply and would pull
 * an `assistant -> server` edge into a domain module, reopening the exact composition-root/domain
 * cycle the tool-contribution registry (`tool-contribution-registry.ts`'s own header) exists to keep
 * closed. Unset `TOVU_PUBLIC_URL` is a hard refusal here (unlike `admin-screen-link-tool.ts`'s
 * "degrade to a relative path" choice): with no absolute origin, there is no OAuth authorization to
 * start at all, so the honest outcome is a clear, actionable error rather than a broken call.
 */

const CATALOG_BY_ID = indexCatalogById(externalMcpAgentToolCatalog);

/** Mirrors `oauth-callback-url.ts`'s own constant — restated, not imported. See this file's header
 *  ("no live HTTP request") for why. Both must keep naming the SAME path: `mcp-federation/registrations.ts`'s
 *  public callback route (`server/inbound/public-http/routes/external-mcp/oauth-callback.ts`) is the
 *  only thing listening on it. */
const EXTERNAL_MCP_OAUTH_CALLBACK_PATH = "/api/mcp-servers/oauth/callback";

/**
 * Resolves `TOVU_PUBLIC_URL` into an absolute origin, or `undefined` when it is unset, blank, or not
 * a valid `http(s)` URL — the identical local re-implementation `assistant/admin-screen-link-tool.ts`'s
 * `resolveConfiguredPublicOrigin` already uses for the same structural reason (see this file's
 * header). Duplicated rather than shared, matching this codebase's own "duplicate the tiny helper,
 * never share it across features/files" convention (that file's own header cites the precedent).
 *
 * @complexity O(1).
 */
function resolveConfiguredPublicOrigin(): string | undefined {
  const configured = process.env.TOVU_PUBLIC_URL?.trim();
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Builds `external_mcp_oauth_connect`'s redirect URI for one server id.
 *
 * @throws {Error} `TOVU_PUBLIC_URL` is not configured — see this file's header for why that is a
 * hard refusal here rather than a degrade.
 * @complexity O(1).
 */
function resolveExternalMcpOAuthRedirectUri(serverId: string): string {
  const origin = resolveConfiguredPublicOrigin();
  if (!origin) {
    throw new Error(
      "external_mcp_oauth_connect: TOVU_PUBLIC_URL is not configured, so no absolute OAuth redirect URL can be " +
        "built from a chat tool call (unlike Settings, this call has no live browser request to derive one " +
        "from). Ask an operator to set TOVU_PUBLIC_URL, or connect this server from Settings → External MCP instead.",
    );
  }
  return `${origin}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${encodeURIComponent(serverId)}`;
}

/** Reads `input[key]` as a string, or `undefined` for anything else — the same tri-state reading
 *  rule every other optional field in this domain's save path already follows (see `save-form.ts`'s
 *  header). @complexity O(1). */
function optionalStringField(input: Record<string, unknown>, key: string): string | undefined {
  return typeof input[key] === "string" ? (input[key] as string) : undefined;
}

/** The model's own {@link ExternalMcpSaveInput} fields beyond `id`/`transport` — every one of
 *  `SAVE_INPUT_SCHEMA`'s optional string properties (`agent-tools.ts`), read the same tri-state way
 *  the submitted form's own params are read below. */
const SAVE_MODEL_OPTIONAL_FIELDS = [
  "label",
  "command",
  "args",
  "url",
  "allowedToolNames",
  "authMode",
  "oauthProviderId",
  "oauthGrant",
  "oauthClientId",
  "oauthScopes",
  "oauthTokenEnvName",
  "oauthAuthorizationEndpoint",
  "oauthTokenEndpoint",
  "oauthDeviceAuthorizationEndpoint",
] as const satisfies readonly (keyof ExternalMcpSaveInput)[];

/** Narrows the model's OWN `external_mcp_save` call input into {@link ExternalMcpSaveInput} — the
 *  shape `mergeExternalMcpSavePrefill`/`buildExternalMcpSaveForm` take to generate the form the
 *  human actually sees. `id` is normalized the same way `saveExternalMcpServer` itself normalizes
 *  it (trim + lowercase), so the existing-row lookup below matches what a prior save actually
 *  stored. @complexity O(1) — a fixed field list. */
function buildModelSaveInput(input: Record<string, unknown>): ExternalMcpSaveInput {
  const id = requireString(input, "id").trim().toLowerCase();
  const transport = requireString(input, "transport");
  let save: ExternalMcpSaveInput = { id, transport };
  for (const key of SAVE_MODEL_OPTIONAL_FIELDS) {
    const value = optionalStringField(input, key);
    if (value !== undefined) save = { ...save, [key]: value };
  }
  return save;
}

/** The submitted form field name -> {@link SaveExternalMcpOAuthInput} field name pairs —
 *  `save-form.ts`'s `buildOAuthCoreFields`/`buildOAuthTokenEnvField`/`buildOAuthEndpointFields` own
 *  the field NAMES on the rendered side; this is the one place that maps them back. */
const OAUTH_FORM_FIELD_MAP = [
  ["oauthProviderId", "providerId"],
  ["oauthGrant", "grant"],
  ["oauthClientId", "clientId"],
  ["oauthClientSecret", "clientSecret"],
  ["oauthScopes", "scopes"],
  ["oauthTokenEnvName", "tokenEnvName"],
  ["oauthAuthorizationEndpoint", "authorizationEndpoint"],
  ["oauthTokenEndpoint", "tokenEndpoint"],
  ["oauthDeviceAuthorizationEndpoint", "deviceAuthorizationEndpoint"],
] as const;

/** Builds the OAuth half of a save from the submitted form's params — only rendered fields are ever
 *  present (see this file's header), so an absent key here means the form never showed that field,
 *  not that the human left it blank. `undefined` when nothing OAuth-shaped was submitted.
 *  @complexity O(1) — a fixed field list. */
function buildOAuthSaveInputFromFormParams(params: Record<string, unknown>): SaveExternalMcpOAuthInput | undefined {
  let oauth: SaveExternalMcpOAuthInput = {};
  for (const [formKey, oauthKey] of OAUTH_FORM_FIELD_MAP) {
    const value = optionalStringField(params, formKey);
    if (value !== undefined) oauth = { ...oauth, [oauthKey]: value };
  }
  return Object.keys(oauth).length === 0 ? undefined : oauth;
}

/**
 * Maps the human's SUBMITTED form (`answer.params`, already past the `received`/dismissed checks)
 * onto {@link SaveExternalMcpServerInput} — `saveExternalMcpServer`'s own input shape.
 *
 * `enabled: true` always: `save-form.ts`'s rendered fields never include an enabled toggle (this
 * tool's job is "connect a server", not "flip one that already exists off/on"), so every save this
 * tool ever performs both creates and enables, or re-enables, the row — matching the admin PUT
 * route's own default (`enabled: body.enabled !== false`) for the identical "caller sent nothing"
 * case. `writeAllowedToolNames` is always `""`: this form has no field for it either, and
 * `SaveExternalMcpServerInput`'s own doc states that degrading to "no write grants" for an
 * un-migrated caller is the designed default, not a bug.
 *
 * @complexity O(1) — a fixed field list.
 */
function buildSaveExternalMcpServerInputFromFormParams(
  params: Record<string, unknown>,
  workspaceId: UUID,
  principalId: string,
): SaveExternalMcpServerInput {
  const label = optionalStringField(params, "label");
  const url = optionalStringField(params, "url");
  const authMode = optionalStringField(params, "authMode");
  const env = optionalStringField(params, "env");
  const oauth = buildOAuthSaveInputFromFormParams(params);

  const serverIdRaw = params.id;
  const transportRaw = params.transport;
  if (typeof serverIdRaw !== "string" || typeof transportRaw !== "string") {
    // Both ride in `baseParams` on every render (`save-form.ts`'s `buildExternalMcpSaveForm`) — their
    // absence means the submitted params were not actually produced by this tool's own form.
    throw new Error("external_mcp_save: the submitted form is missing 'id' or 'transport'.");
  }

  return {
    workspaceId,
    serverId: serverIdRaw,
    ...(label !== undefined ? { label } : {}),
    transport: transportRaw,
    ...(authMode !== undefined ? { authMode } : {}),
    enabled: true,
    command: optionalStringField(params, "command") ?? "",
    ...(url !== undefined ? { url } : {}),
    args: optionalStringField(params, "args") ?? "",
    allowedToolNames: optionalStringField(params, "allowedToolNames") ?? "",
    writeAllowedToolNames: "",
    ...(env !== undefined ? { env } : {}),
    ...(oauth !== undefined ? { oauth } : {}),
    principalId,
  };
}

/**
 * `external_mcp_save`'s `askOnce` answer handling — extracted to a top-level function so its own
 * complexity is measured independently of the handler that opens the exchange and builds the form,
 * mirroring `deployment_propose_custom_provider_credential`'s identical `handleProposeCredentialAnswer`
 * split (`features/deployments/publish-agent-tools.ts`).
 *
 * `ExternalMcpValidationError` is the one rejection a DIFFERENT form submission would fix, so it is
 * turned into the documented `{ saved: false, reason: 'invalid', ... }` result rather than thrown —
 * matching `agent-tools.ts`'s own description of this tool's return shapes.
 * `ExternalMcpSecretStoreUnconfiguredError` is deliberately NOT folded into that same branch: its own
 * doc states nothing the operator types can fix it, which is the opposite of what `reason: 'invalid'`
 * promises the model — it propagates as an ordinary thrown error instead.
 *
 * @complexity O(1) plus one `saveExternalMcpServer` call.
 */
async function handleExternalMcpSaveAnswer(
  routeDeps: ExternalMcpToolDeps,
  principalId: string,
  answer: SurfaceMessage,
): Promise<unknown> {
  if (answer.status !== "received") {
    return {
      saved: false,
      cancelled: false,
      reason: answer.status,
      note:
        answer.status === "expired"
          ? "The user did not respond to the connection form before it expired. Nothing was saved."
          : "The connection form was closed because the run ended. Nothing was saved.",
    };
  }
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) {
    return { saved: false, cancelled: true };
  }

  const saveInput = buildSaveExternalMcpServerInputFromFormParams(answer.params, routeDeps.workspaceId, principalId);
  try {
    const server = await saveExternalMcpServer(
      {
        repo: routeDeps.externalMcpServerRepo,
        sealer: routeDeps.siteAssistantSecretSealer,
        keyring: routeDeps.siteAssistantSecretKeyring,
        clock: routeDeps.clock,
      },
      saveInput,
    );
    return { saved: true, server };
  } catch (err) {
    if (err instanceof ExternalMcpValidationError) {
      return { saved: false, cancelled: false, reason: "invalid", message: err.message, field: err.field };
    }
    throw err;
  }
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const externalMcpDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> listExternalMcpServerViews(): a repo read, never unseals.
  ["external_mcp_list", "none"],
  // -> saveExternalMcpServer(): repo.upsert() plus a seal, gated behind the human's own form
  //    confirmation (ADR-055-style held-open exchange, same shape as content_post_delete).
  ["external_mcp_save", "mutates-durable-state"],
  // -> readEnabledExternalMcpConfigs(): decrypts to check readiness, never writes, never connects.
  ["external_mcp_test_connection", "none"],
  // -> externalMcpOAuth.beginConnect(): writes oauthStatus 'pending' (and, for a self-configuring
  //    connection, persists a minted client identity) before returning the authorization/device
  //    start. Durable.
  ["external_mcp_oauth_connect", "mutates-durable-state"],
  // -> externalMcpOAuth.pollDeviceAuthorization(): persists the access token on the 'connected'
  //    outcome, resets state on a terminal failure. Durable.
  ["external_mcp_oauth_poll_device", "mutates-durable-state"],
]);

export function buildExternalMcpRegistrations(routeDeps: ExternalMcpToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    external_mcp_list: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: EXTERNAL_MCP_MANAGE_PERMISSION,
        entityType: "external-mcp-server",
      });

      const servers = await listExternalMcpServerViews({ repo: routeDeps.externalMcpServerRepo }, routeDeps.workspaceId);
      return { servers };
    },

    /**
     * See this file's header ("`external_mcp_save`: one call, held open"). Fails closed rather than
     * degrade when this execution context cannot show a dialog — same posture `content_post_delete`
     * and `deployment_propose_custom_provider_credential` both take for the identical case: a form
     * this tool exists specifically to render cannot be skipped without abandoning the "never saves
     * silently" guarantee `agent-tools.ts`'s own description makes.
     */
    external_mcp_save: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: EXTERNAL_MCP_MANAGE_PERMISSION,
        entityType: "external-mcp-server",
      });

      if (!ctx.emitSurface) {
        throw new Error(
          "external_mcp_save: this execution context has no interactive confirmation channel (no emitSurface), " +
            "so a connection form cannot be shown here. Nothing was saved.",
        );
      }

      const modelInput = buildModelSaveInput(input);
      const existingViews = await listExternalMcpServerViews({ repo: routeDeps.externalMcpServerRepo }, routeDeps.workspaceId);
      const existingView = existingViews.find((view) => view.serverId === modelInput.id);
      const prefill = mergeExternalMcpSavePrefill(modelInput, existingView);

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open(
        { toolId: EXTERNAL_MCP_SAVE_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface,
      );

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        const ui = buildExternalMcpSaveForm({ exchange, save: prefill, isUpdate: existingView !== undefined });
        const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });
        return await handleExternalMcpSaveAnswer(routeDeps, ctx.principal.id, answer);
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
    },

    /** See this file's header ("`external_mcp_test_connection` never opens a socket"). */
    external_mcp_test_connection: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: EXTERNAL_MCP_MANAGE_PERMISSION,
        entityType: "external-mcp-server",
        entityId: id,
      });

      const record = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: id });
      if (!record) return { ok: false, reason: `no external MCP server is configured as '${id}'` };
      if (!record.enabled) return { ok: false, reason: "this server is disabled" };

      const { configs, failures } = await readEnabledExternalMcpConfigs(
        { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer, oauth: routeDeps.externalMcpOAuth?.tokenResolver },
        routeDeps.workspaceId,
      );
      if (configs.some((config) => config.serverId === id)) return { ok: true };
      const failure = failures.find((candidate) => candidate.serverId === id);
      return { ok: false, reason: failure?.reason ?? "this server's connection could not be resolved" };
    },

    /** See this file's header ("`external_mcp_oauth_connect` has no live HTTP request"). */
    external_mcp_oauth_connect: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: EXTERNAL_MCP_MANAGE_PERMISSION,
        entityType: "external-mcp-server",
        entityId: id,
      });

      if (!routeDeps.externalMcpOAuth) {
        throw new Error(
          `external_mcp_oauth_connect: this execution context has no OAuth service wired, so an authorization ` +
            `cannot be started here. Ask the operator to connect '${id}' from Settings → External MCP instead.`,
        );
      }

      return routeDeps.externalMcpOAuth.beginConnect({ serverId: id, redirectUri: resolveExternalMcpOAuthRedirectUri(id) });
    },

    external_mcp_oauth_poll_device: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const id = requireString(input, "id");
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: EXTERNAL_MCP_MANAGE_PERMISSION,
        entityType: "external-mcp-server",
        entityId: id,
      });

      if (!routeDeps.externalMcpOAuth) {
        throw new Error(
          "external_mcp_oauth_poll_device: this execution context has no OAuth service wired, so this device " +
            "authorization cannot be polled here.",
        );
      }

      return routeDeps.externalMcpOAuth.pollDeviceAuthorization({ serverId: id });
    },
  };

  // No `unwiredToolIds`: External MCP wires its ENTIRE catalog, same tripwire discipline as
  // Posts/Themes/Plugins — a 6th catalog entry added without a handler fails the build.
  return buildDomainRegistrations({
    domain: "external-mcp",
    catalogModule: "features/external-mcp/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: externalMcpDerivedRisk,
  });
}

/**
 * Contributes External MCP's AI tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not
 * by importing this module. See this file's header for what was unreachable before this existed.
 */
export function contributeExternalMcpTools(): ToolContributor {
  return { domain: "external-mcp", build: buildExternalMcpRegistrations, risk: externalMcpDerivedRisk };
}
