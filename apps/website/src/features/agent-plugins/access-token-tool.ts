import {
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type WirableToolDefinition,
} from "@jini-ai/cms/core";
import { ToolInputError, type SurfaceEmission, type SurfaceEmitter, type ToolExecutionContext } from "@jini-ai/core";

import { askThenReport, SURFACE_DISMISSED_PARAM, type AssistantSurfaceDeps, type SurfaceExchange, type SurfaceMessage } from "../../contracts/core/tool-surface-exchanges.js";
import type { HttpClientPort } from "../../platform/http/index.js";
import {
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  saveExternalMcpServer,
  type ExternalMcpServerRecord,
} from "#src/assistant/index";

import { buildAgentPluginAccessTokenForm, buildAgentPluginAccessTokenOutcome } from "./connect-card-ui.js";
import { defaultResolveInstalledAgentPlugin, titleCaseFromPluginId, type AgentPluginConnectToolDeps } from "./connect-tool.js";
import { deriveAgentPluginConnectionId, provisionAgentPluginMcpServers } from "./federate-mcp.js";
import type { AgentPluginTokenAuth, RemoteMcpServerConfig } from "./manifest.js";

/**
 * @file `agent_plugin_set_access_token` — the generic access-token fallback for an Agent Plugin whose
 * remote server declares `tovuTokenAuth { helpUrl, probeUrl }` in its `mcp.json` (`manifest.ts`).
 * Used when `agent_plugin_connect`'s sign-in cannot start.
 *
 * Moved here on 2026-09-29 from `features/supabase-connect/` (SPEC-052's `supabase_set_access_token`),
 * so no vendor code is left in core: the tokens page and the probe URL now come from the plugin.
 *
 * A masked form (`connect-card-ui.ts`); the submitted token is probed with one GET to the declared
 * `probeUrl` (401/403 = rejected), then saved as the plugin row's sealed `static_env` access token
 * through `saveExternalMcpServer`. The store sends that token to the hosted server as
 * `Authorization: Bearer`, and switching the row's auth mode replaces any unfinished OAuth attempt on
 * it. It does not touch `enabled`, `allowedToolNames`, or `writeAllowedToolNames`.
 *
 * The tool takes only a `pluginId`: the token arrives through the form's own submission, never
 * through a model-issued call. Driven by `askThenReport`, like `custom_credential_set_token`: a second
 * send replaces the form with the real outcome once the probe and save have run. Fails closed with no
 * `emitSurface`.
 */

export const AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID = "agent_plugin_set_access_token";

/** Same permission `agent_plugin_connect` restates (`connect-tool.ts`). */
const AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION = "admin.integrations.manage";

/** Per-request bound; the guarded client's egress policy separately caps connect time and body size. */
const PROBE_TIMEOUT_MS = 10_000;

export interface AgentPluginAccessTokenToolDeps extends AgentPluginConnectToolDeps {
  /** The guarded outbound client (ADR-038) whose egress policy already admits any public HTTPS host. */
  readonly customCredentialsHttpClient: HttpClientPort;
}

const DESCRIPTION = [
  "FALLBACK ONLY: connects an Agent Plugin with a personal access token when agent_plugin_connect could not start sign-in. Never call this first.",
  "Only for a plugin whose server offers token sign-in; refused otherwise.",
  "First send the human the plugin's tokens page to create a token, then call this: it shows a masked form, the human pastes the token there, Tovu checks it and seals it.",
  "The token never reaches you, this result, or the chat. Never ask for or accept a token in chat. This ONE call waits until the human submits or cancels.",
  "Returns { saved: true, next } on success; { saved: false, reason: 'invalid', message } when the token was rejected (nothing stored);",
  "{ saved: false, reason: 'unavailable' } when the service could not be reached; { saved: false, reason: 'cancelled' | 'expired' | 'abandoned' } when nobody submitted.",
].join(" ");

export const agentPluginAccessTokenAgentToolCatalog: WirableToolDefinition[] = [
  {
    name: AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID,
    description: DESCRIPTION,
    sideEffects: "mutates-durable-state",
    authorization: { permission: AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["pluginId"],
      properties: {
        pluginId: { type: "string", minLength: 1, description: "An installed Agent Plugin's id, e.g. 'supabase'." },
      },
    },
  },
];

export const agentPluginAccessTokenDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> one outbound GET to the declared probeUrl, then saveExternalMcpServer: a sealed write, via the human's form.
  [AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID, "mutates-durable-state"],
]);

/** Plain-language messages from SPEC-052's errors.spec.md. None ever carries a token or a vendor body. */
const MESSAGES = {
  tokenInvalid: "That access token didn't work. Create a new one and try again. Nothing was saved.",
  blankToken: "The access token cannot be blank. Nothing was saved.",
  saveFailed: "The access token could not be saved. Nothing was changed.",
} as const;

type UnansweredReason = "cancelled" | "expired" | "abandoned";
type SetAccessTokenResult =
  | { saved: true; next: string }
  | { saved: false; reason: UnansweredReason | "invalid" | "unavailable" | "error"; message?: string };
type AnswerOutcome = { result: SetAccessTokenResult; outcome?: SurfaceEmission };

/** The one declared token-auth server this call saves onto. */
interface TokenAuthTarget {
  readonly pluginId: string;
  readonly displayName: string;
  readonly connectionId: string;
  readonly config: RemoteMcpServerConfig & { readonly tovuTokenAuth: AgentPluginTokenAuth };
}

function hostOf(url: string | null): string | null {
  if (url === null) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * The plugin row, freshly read. Refused when it is missing or no longer points at the host the plugin
 * declares, so a token is never sent to a server an operator re-pointed.
 *
 * @throws {ToolInputError}
 */
async function requireTargetRow(routeDeps: AgentPluginAccessTokenToolDeps, target: TokenAuthTarget): Promise<ExternalMcpServerRecord> {
  const row = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: target.connectionId });
  if (row === null) {
    throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: '${target.pluginId}''s connection could not be set up in this Tovu version. Nothing was changed.`);
  }
  if (hostOf(row.url) !== hostOf(target.config.url)) {
    throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: the '${target.connectionId}' connection no longer points at ${target.displayName}. Nothing was changed.`);
  }
  return row;
}

/**
 * Resolves the plugin's one server declaring `tovuTokenAuth`, provisioning its row (idempotent, the
 * same call `agent_plugin_connect` makes) so a first-time fallback needs no earlier step.
 *
 * @throws {ToolInputError} Not installed; no or several token-auth servers.
 */
async function resolveTarget(routeDeps: AgentPluginAccessTokenToolDeps, pluginId: string, principalId: string): Promise<TokenAuthTarget> {
  const resolvePlugin = routeDeps.resolveInstalledPlugin ?? ((id: string) => defaultResolveInstalledAgentPlugin(routeDeps.workspaceId, id));
  const plugin = await resolvePlugin(pluginId);
  if (!plugin) throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: '${pluginId}' is not an installed Agent Plugin in this workspace.`);

  const declared = Object.entries(plugin.servers).flatMap(([serverKey, config]) =>
    config.type !== "stdio" && config.tovuTokenAuth ? [{ serverKey, config: config as TokenAuthTarget["config"] }] : [],
  );
  if (declared.length === 0) throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: '${pluginId}' declares no access-token sign-in.`);
  if (declared.length > 1) throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: '${pluginId}' declares more than one access-token sign-in.`);
  const [{ serverKey, config }] = declared as [(typeof declared)[number]];
  const connectionId = deriveAgentPluginConnectionId(serverKey);
  if (!connectionId) throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.`);

  await provisionAgentPluginMcpServers(
    { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer, keyring: routeDeps.siteAssistantSecretKeyring, clock: routeDeps.clock },
    { workspaceId: routeDeps.workspaceId, pluginId, servers: plugin.servers, principalId },
  );
  return { pluginId, displayName: titleCaseFromPluginId(pluginId), connectionId, config };
}

/** One GET with the token as a Bearer header. Never throws, never returns the token or the body. */
async function probeToken(httpClient: HttpClientPort, probeUrl: string, token: string): Promise<"ok" | "invalid" | "unavailable"> {
  let response;
  try {
    response = await httpClient.send({
      method: "GET",
      url: probeUrl,
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      timeoutMs: PROBE_TIMEOUT_MS,
    });
  } catch {
    return "unavailable";
  }
  if (response.status === 401 || response.status === 403) return "invalid";
  return response.status >= 200 && response.status < 300 ? "ok" : "unavailable";
}

function joinStoredList(raw: string | null): string {
  const parsed: unknown = raw === null ? [] : JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === "string").join(",") : "";
}

/**
 * Seals `token` onto the freshly re-read row as its `static_env` access token, carrying every
 * operator-set field forward unchanged. Re-read at write time because the human may sit on the form
 * while the operator edits the allowlists.
 */
async function saveStaticAccessToken(routeDeps: AgentPluginAccessTokenToolDeps, target: TokenAuthTarget, principalId: string, token: string): Promise<void> {
  const row = await requireTargetRow(routeDeps, target);
  await saveExternalMcpServer(
    { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer, keyring: routeDeps.siteAssistantSecretKeyring, clock: routeDeps.clock },
    {
      workspaceId: routeDeps.workspaceId,
      serverId: row.serverId,
      ...(row.label !== null ? { label: row.label } : {}),
      transport: "streamable_http",
      authMode: "static_env",
      enabled: row.enabled,
      command: "",
      url: row.url ?? target.config.url,
      args: "",
      allowedToolNames: joinStoredList(row.allowedToolNames),
      writeAllowedToolNames: joinStoredList(row.writeAllowedToolNames),
      accessToken: token,
      principalId,
    },
  );
}

/** Only the store's own validation/unconfigured messages are shown — neither embeds a value. */
function describeSaveError(err: unknown): string {
  const known = err instanceof ExternalMcpValidationError || err instanceof ExternalMcpSecretStoreUnconfiguredError || err instanceof ToolInputError;
  return known ? (err as Error).message : MESSAGES.saveFailed;
}

function outcome(exchange: SurfaceExchange, target: TokenAuthTarget, state: "success" | "failure", title: string, message: string): SurfaceEmission {
  const resource = buildAgentPluginAccessTokenOutcome({ exchangeId: exchange.id, pluginDisplayName: target.displayName, state, title, message });
  return { channel: "mcp-ui", payload: { resource } };
}

function failure(exchange: SurfaceExchange, target: TokenAuthTarget, reason: "invalid" | "unavailable" | "error", message: string): AnswerOutcome {
  return { result: { saved: false, reason, message }, outcome: outcome(exchange, target, "failure", "Token not saved", message) };
}

/**
 * The form's answer: probe, then seal. The token lives only in a local for the width of this function
 * and is never returned, logged, or put in an outcome.
 *
 * @complexity O(1) plus one outbound GET and one store save.
 */
async function handleAnswer(
  answer: SurfaceMessage,
  ctx: { routeDeps: AgentPluginAccessTokenToolDeps; target: TokenAuthTarget; principalId: string; exchange: SurfaceExchange },
): Promise<AnswerOutcome> {
  const { routeDeps, target, principalId, exchange } = ctx;
  if (answer.status !== "received") return { result: { saved: false, reason: answer.status } };
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) return { result: { saved: false, reason: "cancelled" } };

  const submitted = answer.params.token;
  const token = typeof submitted === "string" ? submitted.trim() : "";
  if (token === "") return failure(exchange, target, "invalid", MESSAGES.blankToken);

  const probe = await probeToken(routeDeps.customCredentialsHttpClient, target.config.tovuTokenAuth.probeUrl, token);
  if (probe === "invalid") return failure(exchange, target, "invalid", MESSAGES.tokenInvalid);
  if (probe === "unavailable") return failure(exchange, target, "unavailable", `${target.displayName} is unavailable right now. Try again shortly.`);
  try {
    await saveStaticAccessToken(routeDeps, target, principalId, token);
  } catch (err) {
    return failure(exchange, target, "error", describeSaveError(err));
  }
  const next = `Ask the operator to enable '${target.connectionId}' in Settings → External MCP, tick the tools it may use, and restart the assistant.`;
  return { result: { saved: true, next }, outcome: outcome(exchange, target, "success", "Token saved", "Token saved.") };
}

function requireEmitSurface(ctx: ToolExecutionContext): SurfaceEmitter {
  if (!ctx.emitSurface) {
    throw new Error(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: this execution context has no interactive form channel (no emitSurface), so this form cannot be shown here. Nothing was changed.`);
  }
  return ctx.emitSurface;
}

/**
 * Runs `agent_plugin_set_access_token` end to end: permission, resolve, form, probe, save.
 *
 * @throws {ToolInputError} Extra input, unknown plugin, no token-auth server, or a re-pointed row.
 * @throws {Error} No `emitSurface` on this execution context.
 */
export async function runAgentPluginSetAccessToken(
  routeDeps: AgentPluginAccessTokenToolDeps,
  surfaces: AssistantSurfaceDeps,
  ctx: ToolExecutionContext,
  input: Readonly<Record<string, unknown>>,
): Promise<SetAccessTokenResult> {
  if (Object.keys(input).some((key) => key !== "pluginId")) {
    throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID} takes only a pluginId. The token is pasted into the form, never passed here.`);
  }
  const pluginId = input.pluginId;
  if (typeof pluginId !== "string" || pluginId.trim() === "") throw new ToolInputError(`${AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID}: pluginId is required.`);

  await requireToolPermission(routeDeps, {
    principalId: ctx.principal.id,
    permission: AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION,
    entityType: "agent-plugin",
    entityId: pluginId,
  });
  const emitSurface = requireEmitSurface(ctx);
  const target = await resolveTarget(routeDeps, pluginId, ctx.principal.id);
  await requireTargetRow(routeDeps, target);

  const exchange = surfaces.surfaceExchanges.open({ toolId: AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    const form = buildAgentPluginAccessTokenForm({
      toolName: AGENT_PLUGIN_SET_ACCESS_TOKEN_TOOL_ID,
      exchangeId: exchange.id,
      pluginDisplayName: target.displayName,
      helpUrl: target.config.tovuTokenAuth.helpUrl,
    });
    return await askThenReport<SetAccessTokenResult>(exchange, { channel: "mcp-ui", payload: { resource: form } }, (answer) =>
      handleAnswer(answer, { routeDeps, target, principalId: ctx.principal.id, exchange }),
    );
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}
