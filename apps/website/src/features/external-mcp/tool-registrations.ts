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
import { ToolInputError } from "@jini-ai/core";

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
 * closed.
 *
 * ### 2026-09-09: an unset `TOVU_PUBLIC_URL` no longer blocks EVERY grant
 *
 * This handler used to resolve a redirect URI UNCONDITIONALLY and refuse when the env var was unset.
 * That was wrong for `device_code`, which uses no redirect URI at all (RFC 8628: the human types a
 * code at the provider; nothing redirects back) — so the one grant that needed nothing was refused
 * along with the one that did, and in dev (`TOVU_PUBLIC_URL` unset by default) that was every
 * connect. Worse, the refusal was a bare `Error`, which `@jini-ai/daemon` redacts: the message
 * naming the env var never reached the model, making it a silent refusal in practice.
 *
 * ### 2026-09-10: `authorization_code` no longer refuses just because the env var is unset either
 *
 * The previous fix still left every `authorization_code` connect refusing outright in dev (the env
 * var is unset by default) and, worse, in the Electron desktop app, whose non-technical owner has no
 * way to set an environment variable at all — the exact case a 2026-09-09 product review flagged: "it
 * should be automatic". `resolveExternalMcpOAuthRedirectUri` now falls back to
 * `routeDeps.derivedPublicOrigin` — this PROCESS's own known bind origin (`server/routes/types.ts`'s
 * own doc has the derivation), populated by the composition root — when `TOVU_PUBLIC_URL` is unset.
 * Precedence is explicit and one-directional: the operator override always wins when present, the
 * derived origin only fills the gap when it is absent, never the reverse.
 *
 * This reopens a case an earlier version of this file's header rejected as "deriving a localhost
 * origin in dev", on the reasoning that a guessed redirect URI not matching what the provider was
 * registered with fails at the vendor with a confusing error, strictly harder to act on than a
 * refusal naming the variable. That reasoning does not change here — a redirect URI still has to
 * match the provider's registration to work — but the derived origin is no longer a blind guess: it
 * is this process's OWN bind origin, the one thing that matches "what the provider was registered
 * with" in precisely the two cases this fallback ever runs (local dev, and the desktop app's fixed
 * loopback origin). A real deployment behind a proxy or custom domain sets `TOVU_PUBLIC_URL`, per the
 * precedence above, so the derived guess never even reaches that case.
 *
 * NOT fixed by this: `deps.ts`'s own "cross-process caveat" — an `authorization_code` connect started
 * from the spawned agent-daemon still mints a `pending` record the public callback route's process
 * (the main web server) cannot see, so that grant still cannot complete from a chat tool call running
 * in the daemon, regardless of how correct the redirect URI is. That is a separate, pre-existing,
 * still-open gap this change does not touch; `beginConnect`'s in-process BYOK path is unaffected by
 * it. The last-resort refusal (still naming `TOVU_PUBLIC_URL`, now also naming the derived attempt)
 * fires only when a caller's `ExternalMcpToolDeps` never wires `derivedPublicOrigin` at all — in every
 * real composition root today, it always does, so the honest case for that refusal is a future
 * composition root that forgot to, not "the operator forgot an env var".
 */

const CATALOG_BY_ID = indexCatalogById(externalMcpAgentToolCatalog);

/** Mirrors `oauth-callback-url.ts`'s own constant — restated, not imported. See this file's header
 *  ("no live HTTP request") for why. Both must keep naming the SAME path: `mcp-federation/registrations.ts`'s
 *  public callback route (`server/inbound/public-http/routes/external-mcp/oauth-callback.ts`) is the
 *  only thing listening on it. */
const EXTERNAL_MCP_OAUTH_CALLBACK_PATH = "/api/mcp-servers/oauth/callback";

/**
 * Resolves `TOVU_PUBLIC_URL` into an absolute origin, or `undefined` when it is unset or blank — the
 * identical local re-implementation `assistant/admin-screen-link-tool.ts`'s
 * `resolveConfiguredPublicOrigin` already uses for the same structural reason (see this file's
 * header). Duplicated rather than shared, matching this codebase's own "duplicate the tiny helper,
 * never share it across features/files" convention (that file's own header cites the precedent).
 *
 * Unlike that helper, a PRESENT-but-invalid value throws here rather than degrading to `undefined`:
 * a bad value there only costs a relative link, but here returning `undefined` for a malformed value
 * would make `resolveExternalMcpOAuthRedirectUri` silently fall back to the derived origin —
 * localhost in dev — handing the provider a callback the operator never configured. The operator
 * override must win whenever it is present, so its invalidity cannot be indistinguishable from its
 * absence. `server/inbound/public-http/routes/oauth/public-origin.ts`'s `resolvePublicOrigin` fails
 * the same way for the same reason.
 *
 * @throws {ToolInputError} `TOVU_PUBLIC_URL` is set but is not a valid `http(s)` URL — named so the
 *   misconfiguration reaches the operator instead of silently resolving to the wrong origin.
 * @complexity O(1).
 */
function resolveConfiguredPublicOrigin(): string | undefined {
  const configured = process.env.TOVU_PUBLIC_URL?.trim();
  if (!configured) return undefined;
  let url: URL | undefined;
  try {
    url = new URL(configured);
  } catch {
    url = undefined;
  }
  if (url === undefined) {
    throw new ToolInputError(`TOVU_PUBLIC_URL must be an absolute http(s) URL, but "${configured}" is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolInputError(`TOVU_PUBLIC_URL must be an http(s) URL, got "${configured}".`);
  }
  return url.origin;
}

/**
 * Builds `external_mcp_oauth_connect`'s redirect URI for one server id, or `undefined` when NEITHER
 * an operator-configured origin nor a derived one is available.
 *
 * @param derivedPublicOrigin - `routeDeps.derivedPublicOrigin` — this process's own best-effort
 *   origin, read only when `TOVU_PUBLIC_URL` is unset. See this file's header ("2026-09-10") for why
 *   the precedence is one-directional: the operator override always wins when present.
 *
 * `undefined` rather than a throw when the derived origin is ALSO absent — see this file's header ("an
 * unset TOVU_PUBLIC_URL no longer blocks EVERY grant") for why `beginConnect`, not this function, is
 * what decides whether the caller's grant actually needs one. A PRESENT-but-invalid
 * `TOVU_PUBLIC_URL`, by contrast, throws (see {@link resolveConfiguredPublicOrigin}): it is never
 * masked by the derived origin.
 * @complexity O(1).
 */
function resolveExternalMcpOAuthRedirectUri(serverId: string, derivedPublicOrigin: string | undefined): string | undefined {
  const origin = resolveConfiguredPublicOrigin() ?? (derivedPublicOrigin || undefined);
  if (!origin) return undefined;
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
  "writeAllowedToolNames",
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
 * case. `writeAllowedToolNames` is read from the submitted form the same tri-state way
 * `allowedToolNames` is (`optionalStringField(params, ...) ?? ""`) — see `save-form.ts`'s
 * `buildWriteAllowedToolNamesField`/`mergeExternalMcpSavePrefill` for the field this reads and its
 * prefill-from-existing-row behavior. 2026-09-08 fix: this used to hardcode `""` unconditionally,
 * silently dropping every write grant on any save performed through the assistant — this domain's
 * form now has the field `SaveExternalMcpServerInput`'s own doc always assumed an un-migrated caller
 * would eventually grow (ADS-memory/reports/2026-09-08-dock-recovery-product-test.md).
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
    writeAllowedToolNames: optionalStringField(params, "writeAllowedToolNames") ?? "",
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

      const redirectUri = resolveExternalMcpOAuthRedirectUri(id, routeDeps.derivedPublicOrigin);
      try {
        return await routeDeps.externalMcpOAuth.beginConnect({ serverId: id, ...(redirectUri === undefined ? {} : { redirectUri }) });
      } catch (error) {
        // `ExternalMcpValidationError` is exactly "the caller named something this connection cannot
        // do, and a different input or one config change fixes it" — an unknown id, a non-OAuth row,
        // or (since 2026-09-09) an authorization_code grant with no configured public origin. As a
        // bare `Error` those all reach the model redacted, which is how a clearly-worded refusal
        // naming TOVU_PUBLIC_URL became, in practice, a silent one. Nothing internal is in these
        // messages beyond the server id the caller already sent.
        if (error instanceof ExternalMcpValidationError) throw new ToolInputError(error.message);
        throw error;
      }
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
