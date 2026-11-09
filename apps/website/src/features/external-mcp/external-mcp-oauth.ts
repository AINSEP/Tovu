import type { ExternalMcpOAuthDeps, ExternalMcpOAuthService } from "./contracts.js";
import { createTovuIssuerBoundDiscoveryPolicy, tovuOAuthMessages, withTovuOAuthCopy } from "../../platform/oauth/endpoint-safety.js";
import { hostedMcpSignInLink } from '../api-connections/browser-binding.js';
import { formatAad } from "@jini-ai/platform/secrets";
// Shared OAuth design rationale: Jini/packages/oauth/src/authorization-code.ts.
// EXTRACT-S5 H3: the gate body lives in `@jini-ai/mcp/federation/hosted` (connection-gate.ts) and the sign-in body, device
// store and shared sign-in in `@jini-ai/integrations/api-connections/hosted-mcp`; this file keeps Tovu's bindings and old names.

import { ExternalMcpConnectionRevokedError } from "./external-mcp-revocation.js";
import { createHostedMcpConnectionGate, type ExternalMcpConnectionGateDeps, type HostedMcpConnectionGatePorts } from "@jini-ai/mcp/federation/hosted";
import { isOAuthError, OAuthError, oauthFlowOperations } from "@jini-ai/oauth";
import { createHostedMcpSignInService, type HostedMcpSignInPorts } from "@jini-ai/integrations/api-connections/hosted-mcp";
import { ExternalMcpSecretStoreUnconfiguredError, ExternalMcpValidationError, openExternalMcpOAuthPayload, sealExternalMcpOAuthPayload } from "./external-mcp-store.js";
import { resolveExternalMcpOAuthStatus } from "../../contracts/core/external-mcp-auth.js";
import { resolveExternalMcpAuthMode } from "../../contracts/core/external-mcp-auth.js";
import type { ExternalMcpServerRecord } from "./contracts.js";

export { createHostedMcpConnectionGate, type HostedMcpConnectionGatePorts } from "@jini-ai/mcp/federation/hosted";
export { createDeviceAuthorizationStore, createHostedMcpSignInService } from "@jini-ai/integrations/api-connections/hosted-mcp";

/**
 * The terminal, non-retryable failure a federated tool returns once its connection needs
 * re-authorization.
 *
 * The message is a UX surface, and its audience is a language model. It says *do not retry* in
 * words, because a model that reads "authorization expired" without that instruction will search,
 * select the same tool, fail, and search again — burning turns on a server that cannot work until a
 * human acts. It also names WHERE the human acts, because the model's only useful move is to tell
 * whoever it is talking to.
 */
export class ExternalMcpReauthRequiredError extends Error {
  readonly code = "EXTERNAL_MCP_REAUTH_REQUIRED";
  /** Always false. Present as a field so a caller can branch on it without matching on the class. */
  readonly retryable = false;
  readonly serverId: string;
  /** Where an operator fixes it. Safe to render — built from a validated server id, no user text. */
  readonly settingsLink: string;

  /**
   * @param input.cause - A failure that happened while RECORDING this state, when the state write is
   *   best-effort and this error is thrown regardless (see `reportAuthFailure`). It rides along so a
   *   swallowed write failure stays visible to whoever logs the error, instead of disappearing —
   *   this class carries no logger, and the alternative was a silent `catch`.
   */
  constructor(input: { serverId: string; label?: string | null; cause?: unknown }) {
    const name = input.label ?? input.serverId;
    super(
      `"${name}" is disconnected: its authorization expired or was revoked. ` +
        `Ask the operator to reconnect it in Settings → External MCP. Do not retry this tool.`,
      input.cause === undefined ? undefined : { cause: input.cause },
    );
    this.name = "ExternalMcpReauthRequiredError";
    this.serverId = input.serverId;
    this.settingsLink = externalMcpSettingsDeepLink(input.serverId);
  }
}

/** Tovu's ONE canonical re-authorization factory, supplied to both the connection gate and the sign-in service. */
export function createExternalMcpReauthRequiredError(input: { serverId: string; label?: string | null; cause?: unknown }): ExternalMcpReauthRequiredError {
  return new ExternalMcpReauthRequiredError(input);
}

/**
 * The admin deep link for one connection.
 *
 * A plain link into Settings is the whole of what an in-chat "connect" affordance should be. A full
 * OAuth redirect through the MCP-UI sandboxed iframe is rejected: its return leg cannot safely carry
 * the callback (`window.opener` inside a sandboxed frame is not the page holding the bridge, and
 * origin-checked `postMessage` across the sandbox boundary is exactly the escape hatch the sandbox
 * exists to prevent), and connecting a third-party account is an administrative act with
 * workspace-wide blast radius that a non-operator chat participant should not be walked into.
 *
 * The device grant is the exception that proves the rule — it has no return leg at all, so its user
 * code and verification URL are safe to render anywhere.
 *
 * @complexity O(1).
 */
export function externalMcpSettingsDeepLink(serverId: string): string {
  return `/settings/external-mcp?server=${encodeURIComponent(serverId)}`;
}

/** Tovu's bindings for {@link createHostedMcpConnectionGate}: its reauth factory, revocation error, recovery copy and operator log. */
export const tovuConnectionGateVocabulary: Omit<HostedMcpConnectionGatePorts, keyof ExternalMcpConnectionGateDeps> = {
  reauthRequired: input => createExternalMcpReauthRequiredError(input),
  revoked: input => new ExternalMcpConnectionRevokedError(input),
  recovery: {
    accessHint: ({ pluginId, serverId, refusal }) => {
      const reason = refusal === "turned-off" ? "connection was turned off" : "connection needs access approval";
      return `The '${pluginId}' plugin's '${serverId}' ${reason} (${refusal}). Use plugins_set_enabled({family:"agent-plugin",pluginId:${JSON.stringify(pluginId)},enabled:true}) to show the owner one card for its declared source, tools and may-write grants.`;
    },
    pluginOff: ({ pluginId }) => `The '${pluginId}' plugin is off or its activation could not be checked. Ask to turn it on with plugins_set_enabled before using its tools.`,
  },
  logUnreadableRow: ({ connectionId, error }) => console.warn(
    `[external-mcp] '${connectionId}': federated tool call refused — its connection row could not be read (${error instanceof Error ? error.message : String(error)})`,
  ),
};

/** Tovu's gate: {@link createHostedMcpConnectionGate} bound to {@link tovuConnectionGateVocabulary}. Signature unchanged. */
export function createExternalMcpConnectionGate(deps: ExternalMcpConnectionGateDeps): ReturnType<typeof createHostedMcpConnectionGate> {
  return createHostedMcpConnectionGate({ ...deps, ...tovuConnectionGateVocabulary });
}

/**
 * @agent-note Tovu's stable OAuth registration identity, bound once here and handed to the shared sign-in too. Changing
 * `softwareId` or a client display name registers a NEW client at every provider, so these values are fixed: `softwareId`
 * "tovu"; a connection's client is named by its row label, falling back to its server id; the shared-owner client is "Tovu".
 */
export const tovuRegistrationIdentity = {
  softwareId: "tovu",
  clientName: (record: Pick<ExternalMcpServerRecord, "label" | "serverId">): string => record.label ?? record.serverId,
  sharedClientName: "Tovu",
} as const;

/**
 * @agent-note Tovu's ONE binding of the hosted sign-in ports, shared by the sign-in service and its shared-owner sign-in. Every
 * member is Tovu's real implementation, never a copy: `oauthFlowOperations` and real `OAuthError`s; the canonical
 * `ExternalMcpValidationError`/`ExternalMcpSecretStoreUnconfiguredError`; the ONE reauth factory the connection gate also gets;
 * the store shims the repository uses; the canonical projections; platform `formatAad`; the browser-binding sign-in link; Tovu's
 * OAuth copy, issuer-bound discovery policy and stable registration identity. Copy strings are the exact bytes the sign-in used before.
 */
export const tovuSignInPorts: HostedMcpSignInPorts = {
  flow: oauthFlowOperations,
  errors: {
    oauth: (input) => new OAuthError(input),
    isOAuthError: (error): error is OAuthError => isOAuthError({ value: error }),
    validation: (message, field) => new ExternalMcpValidationError(message, field),
    isUnconfigured: (error) => error instanceof ExternalMcpSecretStoreUnconfiguredError,
    reauthRequired: createExternalMcpReauthRequiredError,
  },
  store: { openPayload: openExternalMcpOAuthPayload, sealPayload: sealExternalMcpOAuthPayload },
  projections: { authMode: resolveExternalMcpAuthMode, oauthStatus: resolveExternalMcpOAuthStatus },
  aad: { format: formatAad },
  signInLink: hostedMcpSignInLink,
  registrationIdentity: tovuRegistrationIdentity,
  oauthMessages: tovuOAuthMessages,
  discoveryPolicy: createTovuIssuerBoundDiscoveryPolicy,
  withCopy: withTovuOAuthCopy,
  copy: {
    actions: {
      noProvider: "Pick a provider, or type this connection's own OAuth endpoints, in Settings → External MCP.",
      noClientId: "Add this connection's OAuth client id in Settings → External MCP.",
      chooseGrant: "Set this connection's sign-in method by hand in Settings → External MCP.",
      noRegistration: "Add this connection's OAuth client id in Settings → External MCP — this server does not mint them automatically.",
      restartDevice: "Start the connection again from Settings → External MCP.",
      restartShared: 'Start sign-in again in Settings → External MCP.',
    },
    noSupportedGrant: ({ serverId, offered }) => `the authorization server for external MCP server '${serverId}' advertises no grant Tovu supports (it offers: ${offered.join(", ") || "none"})`,
    noPublicOrigin: ({ serverId }) =>
      `external MCP server '${serverId}' uses the authorization_code grant, which needs an absolute callback URL ` +
      `Tovu can be reached at, and none could be found: TOVU_PUBLIC_URL is not set, and this execution context has no ` +
      `derived origin either. Set TOVU_PUBLIC_URL to this instance's public origin (for example ` +
      `https://your-site.example.com) and try again, or start this connection from Settings → External MCP, which derives ` +
      `the origin from the browser's own request. Nothing was changed.`,
    sharedLocalOnly: 'Shared sign-in is available only in this Mac owner profile. Use local sign-in here.',
    sharedUnavailable: 'This shared MCP connection is unavailable here. Choose a saved connection or sign in explicitly in Settings → External MCP.',
    sharedOwnerOnly: 'Use the installation owner’s signed-in session on this Mac to manage saved connections.',
  },
  log: {
    postConnectFailed: ({ serverId, error }) => {
      console.warn(`[external-mcp] '${serverId}': post-connect step failed: ${error instanceof Error ? error.message : String(error)}`);
    },
  },
};

/** Tovu's sign-in service: the neutral {@link createHostedMcpSignInService} bound to {@link tovuSignInPorts}. Signature and defaults unchanged. */
export function createExternalMcpOAuthService(required: ExternalMcpOAuthDeps, _optional: Record<string, never> = {}): ExternalMcpOAuthService {
  return createHostedMcpSignInService({ ...required, ports: tovuSignInPorts });
}
