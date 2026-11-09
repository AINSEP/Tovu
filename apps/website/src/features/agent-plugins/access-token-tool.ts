/** Tovu compatibility shim (A10c seam). The portable `agent_plugin_set_access_token` body lives in
 * `./portable/access-token-tool.ts`; these entries keep their signatures and bind Tovu's tool name and
 * product copy ("this Tovu version"), the `credential_save` card lifecycle id and `ui://tovu` card
 * namespace, the credential token rule (R1: same validator, same error object), the installed-plugin
 * read and the saved-token switch. Bytes unchanged from the pre-seam body. */
import type { AgentPluginMcpPort, AgentPluginPreferencesPort, PluginCredentialsPort } from "./service-ports.js";
import type { Clock as ClockPort } from "@jini-ai/core/primitives";
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/index.js";
import { credentialText, translateCredentialMessage } from '../../contracts/core/credential-copy.js';
import { assertCredentialToken, CredentialInputError, type CredentialMessageId } from '../../contracts/core/credential-token.js';
import type { ToolExecutionOptions, ToolExecutionContext } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { AgentPluginMcpRecord } from "./service-ports.js";
import { agentPluginCardHost, tovuAgentPluginCardIdentity } from "./card-host-bindings.js";
import { tovuAccessTokenFormMessages } from "./connect-card-ui.js";
import { defaultResolveInstalledAgentPlugin, type AgentPluginConnectToolDeps } from "./connect-tool.js";
import { tovuFederationMessages } from "./federate-mcp.js";
import { classifyAgentPluginMcpServerTrust } from "./capability-projection.js";
import { withAgentPluginMcpPorts, withOverrides } from "./mcp-host-bindings.js";
import { describeSavedTokenSwitch, switchOnSavedTokenConnection, type SwitchOnSavedTokenDeps } from "./switch-on-saved-token.js";
import {
  requireTargetRow as requireWithPorts, resolveTarget as resolveWithPorts, probeToken as probeWithPorts,
  saveStaticAccessToken as saveWithPorts, saveAgentPluginToken as saveTokenWithPorts,
  type AgentPluginAccessTokenMessages, type AgentPluginTokenValidator, type AgentPluginAccessTokenHost,
  type SetAccessTokenResult, type TokenAuthTarget,
} from "./portable/access-token-tool.js";
export type { TokenAuthTarget, SetAccessTokenResult, AgentPluginAccessTokenMessages, AgentPluginTokenValidator, AgentPluginAccessTokenHost } from "./portable/access-token-tool.js";

/** Same permission `agent_plugin_connect` restates (`connect-tool.ts`). */
const AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION = "admin.integrations.manage";

/** What resolving and saving onto a plugin's token row needs — no permission check, no HTTP client.
 *  Shared with `import-access-token.ts`, which saves a token that did not come from this form. */
export type AgentPluginTokenTargetDeps = Pick<
  AgentPluginConnectToolDeps,
  "agentPluginLayout" | "workspaceId" | "mcp" | "resolveInstalledPlugin"
> & { readonly clock: ClockPort };

export interface AgentPluginAccessTokenToolDeps
  extends AgentPluginConnectToolDeps, AgentPluginTokenTargetDeps,
    Pick<SwitchOnSavedTokenDeps, "onConnected" | "isPluginOffByOperator" | "switchPluginOn" | "notifyRosterChanged"> {
  readonly mcp: Pick<AgentPluginMcpPort, "repo" | "applyAccess" | "saveServer" | "classifyError">;
  readonly credentials: PluginCredentialsPort;
  readonly preferences: Pick<AgentPluginPreferencesPort, "locale">;
}

/** Tovu's tool name and product wording, byte for byte the pre-seam strings. */
export const tovuAccessTokenMessages: AgentPluginAccessTokenMessages = {
  connectionNotSetUp: ({ pluginId }) => `agent_plugin_set_access_token: '${pluginId}''s connection could not be set up in this Tovu version. Nothing was changed.`,
  connectionRepointed: ({ connectionId, displayName }) => `agent_plugin_set_access_token: the '${connectionId}' connection no longer points at ${displayName}. Nothing was changed.`,
  notInstalled: ({ pluginId }) => `agent_plugin_set_access_token: '${pluginId}' is not an installed Agent Plugin in this workspace.`,
  noTokenSignIn: ({ pluginId }) => `agent_plugin_set_access_token: '${pluginId}' declares no access-token sign-in.`,
  multipleTokenSignIns: ({ pluginId }) => `agent_plugin_set_access_token: '${pluginId}' declares more than one access-token sign-in.`,
  serverNotSetUp: ({ pluginId, serverKey }) => `agent_plugin_set_access_token: '${pluginId}''s '${serverKey}' connection could not be set up in this Tovu version.`,
  onlyPluginId: () => `agent_plugin_set_access_token takes only a pluginId. The token is pasted into the form, never passed here.`,
  pluginIdRequired: () => `agent_plugin_set_access_token: pluginId is required.`,
  // Ids are the validator's own `CredentialInputError.rule` or the fixed 'storage'/'blank' ids.
  credentialText: ({ id, locale }) => credentialText({ id: id as CredentialMessageId, locale }),
  translateCredentialMessage: ({ message, locale }) => translateCredentialMessage({ message, locale }),
  savedTokenSwitch: ({ outcome, target }) => describeSavedTokenSwitch(outcome, target),
};

/** R1: Tovu's credential token rule; the same `CredentialInputError` object is thrown and classified. */
export const tovuTokenValidator: AgentPluginTokenValidator = {
  assertToken: ({ value, field }) => assertCredentialToken({ value, field }),
  inputErrorRule: ({ error }) => (error instanceof CredentialInputError ? error.rule : null),
};

/** Tovu's token card wiring: `credential_save` lifecycle, `ui://tovu` namespace, permission, form copy. */
export const tovuAgentPluginAccessTokenHost: AgentPluginAccessTokenHost = {
  toolId: CREDENTIAL_SAVE_TOOL_ID,
  permission: AGENT_PLUGIN_ACCESS_TOKEN_PERMISSION,
  entityType: "agent-plugin",
  cardIdentity: tovuAgentPluginCardIdentity,
  cards: agentPluginCardHost.cards,
  askThenReport: agentPluginCardHost.askThenReport,
  formMessages: tovuAccessTokenFormMessages,
};

const tovuTokenFederation = { classifyTrust: classifyAgentPluginMcpServerTrust, messages: tovuFederationMessages };

/** Old deps -> portable target deps. The installed read falls back to the on-disk walk as before;
 * `routeDeps.mcp` is read on first use (after the permission check), its projections bound once. */
function tovuTargetDeps<D extends AgentPluginTokenTargetDeps>(routeDeps: D) {
  let mcp: ReturnType<typeof withAgentPluginMcpPorts<D["mcp"]>> | undefined;
  const deps = withOverrides(routeDeps, {
    resolveInstalledPlugin: (pluginId: string) => routeDeps.resolveInstalledPlugin ? routeDeps.resolveInstalledPlugin(pluginId)
      : defaultResolveInstalledAgentPlugin({ workspaceId: routeDeps.workspaceId, pluginId, agentPluginLayout: routeDeps.agentPluginLayout }),
    federation: tovuTokenFederation,
    messages: tovuAccessTokenMessages,
  });
  return Object.defineProperty(deps, "mcp", { get: () => (mcp ??= withAgentPluginMcpPorts(routeDeps.mcp)), enumerable: true, configurable: true }) as Omit<typeof deps, "mcp"> & { readonly mcp: NonNullable<typeof mcp> };
}

/** Same signature as the pre-seam entry. @throws {ToolInputError} Missing or re-pointed row. */
export function requireTargetRow({ routeDeps, target }: { routeDeps: AgentPluginTokenTargetDeps; target: TokenAuthTarget }, _options = {}): Promise<AgentPluginMcpRecord> {
  return requireWithPorts({ routeDeps: tovuTargetDeps(routeDeps), target });
}

/** Same signature as the pre-seam entry; see the portable body. */
export function resolveTarget(
  { routeDeps, pluginId, principalId }: { routeDeps: AgentPluginTokenTargetDeps; pluginId: string; principalId: string },
  optional: { signal?: AbortSignal } = {},
): Promise<TokenAuthTarget> {
  return resolveWithPorts({ routeDeps: tovuTargetDeps(routeDeps), pluginId, principalId }, optional);
}

/** Same signature as the pre-seam entry, bound to Tovu's token rule. */
export function probeToken({ probeUrl, token, credentials }: { probeUrl: string; token: string; credentials: Pick<PluginCredentialsPort, "probe"> }, _options = {}): Promise<"ok" | "invalid" | "refused" | "unavailable"> {
  return probeWithPorts({ probeUrl, token, credentials, tokenValidator: tovuTokenValidator });
}

/** Same signature as the pre-seam entry; see the portable body. */
export function saveStaticAccessToken(
  { routeDeps, target, principalId, token }: { routeDeps: AgentPluginTokenTargetDeps; target: TokenAuthTarget; principalId: string; token: string },
  optional: { signal?: AbortSignal } = {},
): Promise<void> {
  return saveWithPorts({ routeDeps: tovuTargetDeps(routeDeps), target, principalId, token }, optional);
}

/** Same signature as the pre-seam entry; the saved-token switch keeps the old routeDeps defaults. */
export function saveAgentPluginToken(
  { routeDeps, surfaces, ctx }: { routeDeps: AgentPluginAccessTokenToolDeps; surfaces: AssistantSurfaceDeps; ctx: ToolExecutionContext },
  optional: ToolExecutionOptions = {},
): Promise<SetAccessTokenResult> {
  const deps = withOverrides(tovuTargetDeps(routeDeps), {
    tokenValidator: tovuTokenValidator,
    switchOnSavedToken: ({ target }: { target: TokenAuthTarget }) => switchOnSavedTokenConnection(routeDeps, target),
    host: tovuAgentPluginAccessTokenHost,
  });
  return saveTokenWithPorts({ routeDeps: deps, surfaces, ctx }, optional);
}
