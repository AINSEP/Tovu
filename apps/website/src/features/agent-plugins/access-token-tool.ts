import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/secret-form-cards.js";
import { credentialText, translateCredentialMessage } from '../../contracts/core/credential-copy.js';
import { resolveOperatorLocale, type OperatorLocaleDeps } from './operator-locale.js';
import { assertCredentialToken, CredentialInputError } from '../../contracts/core/credential-token.js';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import { requireInputRecord, ToolInputError, type ToolExecutionOptions, type ToolExecutionContext } from "@jini-ai/core";
import { defineSecretCardTool, type SecretCardRun } from "@jini-ai/ui/mcp-ui/secret-card";

import { askThenReport, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
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
import type { AgentPluginTokenAuth } from "@jini-ai/agent-plugins/lifecycle";
import type { RemoteMcpServerConfig } from "./mcp-metadata.js";
import { describeSavedTokenSwitch, switchOnSavedTokenConnection, type SwitchOnSavedTokenDeps } from "./switch-on-saved-token.js";

/**
 * @file `agent_plugin_set_access_token` — the generic access-token fallback for an Agent Plugin whose
 * remote server declares `tovuTokenAuth { helpUrl, probeUrl }` in its `mcp.json` (`manifest.ts`).
 * Used when `agent_plugin_connect`'s sign-in cannot start.
 *
 * Moved here on 2026-09-29 from `features/supabase-connect/` (SPEC-052's `supabase_set_access_token`),
 * so no vendor code is left in core: the tokens page and the probe URL now come from the plugin.
 *
 * A Jini secret-card spec with domain copy from `connect-card-ui.ts`; the submitted token is probed with one GET to the declared
 * `probeUrl` (401/403 = rejected), then saved as the plugin row's sealed `static_env` access token
 * through `saveExternalMcpServer`. The store sends that token to the hosted server as
 * `Authorization: Bearer`, and switching the row's auth mode replaces any unfinished OAuth attempt on
 * it. The save itself carries `enabled` and the tool lists forward; then `switch-on-saved-token.ts`
 * switches the plugin on with its declared default tools, exactly as a first sign-in does, unless an
 * operator deliberately turned it off (the result then names the screen that turns it back on).
 *
 * The tool takes only a `pluginId`: the token arrives through the form's own submission, never
 * through a model-issued call. Driven by `askThenReport`, like `custom_credential_set_token`: a second
 * send replaces the form with the real outcome once the probe and save have run. Fails closed with no
 * `emitSurface`.
 */



/** Same permission `agent_plugin_connect` restates (`connect-tool.ts`). */
const AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION = "admin.integrations.manage";

/** Per-request bound; the guarded client's egress policy separately caps connect time and body size. */
const PROBE_TIMEOUT_MS = 10_000;

/** What resolving and saving onto a plugin's token row needs — no permission check, no HTTP client.
 *  Shared with `import-access-token.ts`, which saves a token that did not come from this form. */
export type AgentPluginTokenTargetDeps = Pick<
  AgentPluginConnectToolDeps,
  "workspaceId" | "clock" | "externalMcpServerRepo" | "siteAssistantSecretSealer" | "siteAssistantSecretKeyring" | "resolveInstalledPlugin"
>;

export interface AgentPluginAccessTokenToolDeps
  extends AgentPluginConnectToolDeps, OperatorLocaleDeps,
    Pick<SwitchOnSavedTokenDeps, "onConnected" | "isPluginOffByOperator" | "switchPluginOn"> {
  /** The guarded outbound client (ADR-038) whose egress policy already admits any public HTTPS host. */
  readonly customCredentialsHttpClient: HttpClientPort;
}







/** Plain-language messages from SPEC-052's errors.spec.md. None ever carries a token or a vendor body. */
const MESSAGES = {
  tokenInvalid: "The server rejected this token.",
  blankToken: "The access token cannot be blank. Nothing was saved.",
  saveFailed: "The access token could not be saved. Nothing was changed.",
} as const;

type UnansweredReason = "cancelled" | "expired" | "abandoned";
type SetAccessTokenResult =
  | { saved: true; next: string }
  | { saved: false; reason: UnansweredReason | "invalid" | "unavailable" | "error"; message?: string };

/** The one declared token-auth server this call saves onto. */
export interface TokenAuthTarget {
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
export async function requireTargetRow(routeDeps: AgentPluginTokenTargetDeps, target: TokenAuthTarget): Promise<ExternalMcpServerRecord> {
  const row = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId: target.connectionId });
  if (row === null) {
    throw new ToolInputError({ message: `agent_plugin_set_access_token: '${target.pluginId}''s connection could not be set up in this Tovu version. Nothing was changed.` });
  }
  if (hostOf(row.url) !== hostOf(target.config.url)) {
    throw new ToolInputError({ message: `agent_plugin_set_access_token: the '${target.connectionId}' connection no longer points at ${target.displayName}. Nothing was changed.` });
  }
  return row;
}

/**
 * Resolves the plugin's one server declaring `tovuTokenAuth`, provisioning its row (idempotent, the
 * same call `agent_plugin_connect` makes) so a first-time fallback needs no earlier step.
 *
 * @throws {ToolInputError} Not installed; no or several token-auth servers.
 * @param optional.signal Stops provisioning when the run ends during plugin resolution.
 * @throws The signal's abort reason before provisioning when cancelled.
 */
export async function resolveTarget(routeDeps: AgentPluginTokenTargetDeps, pluginId: string, principalId: string, optional: { signal?: AbortSignal } = {}): Promise<TokenAuthTarget> {
  const resolvePlugin = routeDeps.resolveInstalledPlugin ?? ((id: string) => defaultResolveInstalledAgentPlugin(routeDeps.workspaceId, id));
  const plugin = await resolvePlugin(pluginId);
  if (!plugin) throw new ToolInputError({ message: `agent_plugin_set_access_token: '${pluginId}' is not an installed Agent Plugin in this workspace.` });

  const declared = Object.entries(plugin.servers).flatMap(([serverKey, config]) =>
    config.type !== "stdio" && config.tovuTokenAuth ? [{ serverKey, config: config as TokenAuthTarget["config"] }] : [],
  );
  if (declared.length === 0) throw new ToolInputError({ message: `agent_plugin_set_access_token: '${pluginId}' declares no access-token sign-in.` });
  if (declared.length > 1) throw new ToolInputError({ message: `agent_plugin_set_access_token: '${pluginId}' declares more than one access-token sign-in.` });
  const [{ serverKey, config }] = declared as [(typeof declared)[number]];
  const connectionId = deriveAgentPluginConnectionId(serverKey);
  if (!connectionId) throw new ToolInputError({ message: `agent_plugin_set_access_token: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.` });

  optional.signal?.throwIfAborted();
  await provisionAgentPluginMcpServers(
    { repo: routeDeps.externalMcpServerRepo, sealer: routeDeps.siteAssistantSecretSealer, keyring: routeDeps.siteAssistantSecretKeyring, clock: routeDeps.clock },
    { workspaceId: routeDeps.workspaceId, pluginId, servers: plugin.servers, principalId },
  );
  return { pluginId, displayName: titleCaseFromPluginId(pluginId), connectionId, config };
}

/** One GET with the token as a Bearer header. Never throws, never returns the token or the body. */
export async function probeToken(httpClient: HttpClientPort, probeUrl: string, token: string): Promise<"ok" | "invalid" | "unavailable"> {
  try { assertCredentialToken({ value: token, field: 'token' }); }
  catch { return "invalid"; }
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
 * @param optional.signal Stops the write when the run ends during the fresh row read.
 * @throws The signal's abort reason before saving when cancelled.
 */
export async function saveStaticAccessToken(routeDeps: AgentPluginTokenTargetDeps, target: TokenAuthTarget, principalId: string, token: string, optional: { signal?: AbortSignal } = {}): Promise<void> {
  const row = await requireTargetRow(routeDeps, target);
  // A row read or probe may finish after the run ends; never start a credential write then.
  optional.signal?.throwIfAborted();
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

/** Only the store's known validation/unconfigured errors are shown. Sealing failures can quote
 * plaintext, so unconfigured storage gets fixed copy; the engine redacts allowlisted messages. */
function describeSaveError(err: unknown): string {
  if (err instanceof ExternalMcpSecretStoreUnconfiguredError) return credentialText({ id: "storage", locale: "en" });
  const known = err instanceof ExternalMcpValidationError || err instanceof ToolInputError;
  return known ? (err as Error).message : MESSAGES.saveFailed;
}

/**
 * The form's answer: probe, then seal. The token lives only in a local for the width of this function
 * and is never returned, logged, or put in an outcome.
 *
 * @complexity O(1) plus one outbound GET and one store save.
 */
async function saveSubmittedAccessToken(
  { values, routeDeps, target, principalId, locale, signal }: {
    values: Readonly<Record<string, unknown>>; routeDeps: AgentPluginAccessTokenToolDeps;
    target: TokenAuthTarget; principalId: string; locale: string; signal: AbortSignal;
  }, _optional = {},
): Promise<SetAccessTokenResult> {
  const submitted = values.token;
  try { assertCredentialToken({ value: submitted, field: 'token' }); }
  catch (err) { if (err instanceof CredentialInputError) return { saved: false, reason: 'invalid', message: credentialText({ id: err.rule, locale }) }; throw err; }

  const token = (submitted as string).trim();
  const probe = await probeToken(routeDeps.customCredentialsHttpClient, target.config.tovuTokenAuth.probeUrl, token);
  signal.throwIfAborted();
  if (probe === "invalid") return { saved: false, reason: "invalid", message: translateCredentialMessage({ message: MESSAGES.tokenInvalid, locale }) };
  if (probe === "unavailable") return { saved: false, reason: "unavailable", message: `${target.displayName} is unavailable right now. Try again shortly.` };
  await saveStaticAccessToken(routeDeps, target, principalId, token, { signal });
  let next: string;
  try {
    next = describeSavedTokenSwitch(await switchOnSavedTokenConnection(routeDeps, target), target);
  } catch {
    // The token is saved; only switching on failed. The next save or sign-in retries it.
    next = `Token saved, but ${target.displayName} could not be switched on automatically. Save the token again to retry.`;
  }
  return { saved: true, next };
}

/** Preserve the catalog's result contract while Jini owns answer classification and error redaction. */
function accessTokenResult({ run, locale }: { run: SecretCardRun<SetAccessTokenResult>; locale: string }, _optional = {}): SetAccessTokenResult {
  if (run.status === "saved") return run.saved;
  if (run.status === "blank") return { saved: false, reason: "invalid", message: credentialText({ id: "blank", locale }) };
  if (run.status === "failed") return { saved: false, reason: "error", message: run.safeMessage };
  return { saved: false, reason: run.status };
}

/**
 * Runs `agent_plugin_set_access_token` end to end: permission, resolve, form, probe, save.
 *
 * @throws {ToolInputError} Extra input, unknown plugin, no token-auth server, or a re-pointed row.
 * @throws {ToolInputError} No `emitSurface` on this execution context.
 */
// -> one outbound GET to the declared probeUrl, then saveExternalMcpServer: a sealed write, via the human's form.
export async function saveAgentPluginToken(
  { routeDeps, surfaces, ctx }: { routeDeps: AgentPluginAccessTokenToolDeps; surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext },
  optional: ToolExecutionOptions = {},
): Promise<SetAccessTokenResult> {
  const input = requireInputRecord({ input: ctx.input });
  const card = defineSecretCardTool<{ target: TokenAuthTarget; principalId: string; locale: string }, SetAccessTokenResult, SetAccessTokenResult>({
    toolId: CREDENTIAL_SAVE_TOOL_ID,
    prepare: async ({ ctx }) => {
      if (Object.keys(input).some((key) => key !== "pluginId")) {
        throw new ToolInputError({ message: `agent_plugin_set_access_token takes only a pluginId. The token is pasted into the form, never passed here.` });
      }
      const pluginId = input.pluginId;
      if (typeof pluginId !== "string" || pluginId.trim() === "") throw new ToolInputError({ message: `agent_plugin_set_access_token: pluginId is required.` });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION }, { entityType: "agent-plugin", entityId: pluginId });
      // Resolution provisions a missing plugin row; an ended run must not start that effect.
      ctx.signal.throwIfAborted();
      const target = await resolveTarget(routeDeps, pluginId, ctx.principal.id, { signal: ctx.signal });
      await requireTargetRow(routeDeps, target);
      const locale = await resolveOperatorLocale({ deps: routeDeps, workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id });
      return { target, principalId: ctx.principal.id, locale };
    },
    form: ({ prep }) => buildAgentPluginAccessTokenForm({ pluginDisplayName: prep.target.displayName, helpUrl: prep.target.config.tovuTokenAuth.helpUrl }),
    save: ({ values, prep, signal }) => saveSubmittedAccessToken({ values, routeDeps, ...prep, signal }),
    result: ({ prep, run }) => accessTokenResult({ run, locale: prep.locale }),
    outcome: ({ prep, run }) => {
      const result = accessTokenResult({ run, locale: prep.locale });
      if (!result.saved && result.message === undefined) return undefined;
      return buildAgentPluginAccessTokenOutcome({
        pluginDisplayName: prep.target.displayName, state: result.saved ? "success" : "failure",
        title: result.saved ? "Token saved" : "Token not saved", message: result.saved ? result.next : result.message!,
      });
    },
  }, { uriHost: "tovu", frameSize: ["100%", "380px"], safeError: describeSaveError, text: { saveFailure: MESSAGES.saveFailed } });
  return card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, optional);
}
