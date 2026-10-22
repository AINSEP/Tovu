import { buildPluginCredentialForm, type PluginCredentialCard } from "../custom-credentials/plugin-credential-card.js";
import { buildOutcomeSurface, type SurfaceOutcomeSpec, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";
import type { SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";

/**
 * @file The card `agent_plugin_connect` shows while it parks on a human's sign-in (`connect-tool.ts`).
 *
 * Built on `@jini-ai/ui`'s `buildOutcomeSurface`, not `buildConfirmationSurface`: there is nothing
 * here for a human to confirm or cancel by tool call — the one interactive element is a link that
 * opens the plugin's real sign-in page in a new tab (`outcome.ts`'s `openLinkUrl`, wired to the
 * bridge's `openLink` — an outbound navigation, never a delivery through `mcp-ui-tool-calls-route.ts`).
 * `state: "partial"` is the honest read of "waiting on the human, not failed, not done yet" —
 * `outcome.ts`'s own header explains why that needs to be a real third state, not a boolean folded
 * into success or failure.
 *
 * Plain words only: copy comes from the plugin's explicit credential-card declaration, never its
 * raw plugin.json description, which can contain transport jargon. Older plugins retain the
 * display-name fallback so an absent declaration never blocks a real sign-in.
 */

function agentPluginConnectSurfaceUri(pluginId: string): UIResourceUri {
  return `ui://tovu/agent-plugins-connect/${encodeURIComponent(pluginId)}` as UIResourceUri;
}

export type AgentPluginConnectCardSpec =
  | { readonly pluginId: string; readonly pluginDisplayName: string; readonly state: "waiting"; readonly signInUrl: string; readonly credentialCard?: PluginCredentialCard }
  | { readonly pluginId: string; readonly pluginDisplayName: string; readonly state: "connected" };

/**
 * Renders the connect card. Re-sent under the SAME `ui://` URI (keyed by `pluginId`) when the state
 * flips from `"waiting"` to `"connected"`, so the transcript replaces the sign-in link in place —
 * see `outcome.ts`'s own header for why URI reuse is the whole mechanism.
 *
 * @complexity O(1).
 */
export function buildAgentPluginConnectCard(spec: AgentPluginConnectCardSpec): UIResource {
  const uri = agentPluginConnectSurfaceUri(spec.pluginId);

  if (spec.state === "connected") {
    return buildOutcomeSurface({
      uri,
      title: `${spec.pluginDisplayName} connected`,
      state: "success",
      message: "Connected ✓",
      app: { appName: "tovu-agent-plugins-connect", appVersion: "1" },
      preferredFrameSize: ["100%", "200px"],
    });
  }

  return buildOutcomeSurface({
    uri,
    title: spec.credentialCard?.title ?? `Let's connect ${spec.pluginDisplayName}`,
    description: spec.credentialCard ? `${spec.credentialCard.intro ?? ""} ${spec.credentialCard.permissions ?? spec.credentialCard.keyHint ?? ""}`.trim() : "It's free and takes about two minutes.",
    state: "partial",
    message: "Waiting for you to sign in...",
    openLinkUrl: spec.signInUrl,
    openLinkLabel: `Sign in to ${spec.pluginDisplayName}`,
    app: { appName: "tovu-agent-plugins-connect", appVersion: "1" },
    preferredFrameSize: ["100%", "280px"],
  });
}

/**
 * The masked access-token form `agent_plugin_set_access_token` shows (`access-token-tool.ts`), for a
 * plugin whose server declares `tovuTokenAuth`; its tokens page comes from the plugin metadata.
 *
 * Its one field is the only place the token exists outside the sealed ciphertext it becomes: it is
 * posted straight to the tool-calls route, never through chat. Never pre-filled — every render starts
 * empty. The engine's URI carries the tool/exchange identity, and the outcome reuses it so it
 * replaces the form. This builder supplies domain copy only; the engine owns routing and dismissal.
 *
 * @returns A secret-card form spec without routing parameters or prefilled credentials.
 * @example buildAgentPluginAccessTokenForm({ pluginDisplayName: "Supabase", helpUrl: "https://supabase.com/dashboard/account/tokens" });
 * @complexity O(1).
 */
export function buildAgentPluginAccessTokenForm(spec: {
  readonly pluginDisplayName: string;
  readonly helpUrl: string;
  readonly credentialCard?: PluginCredentialCard;
}, _optional = {}): SecretCardForm {
  if (spec.credentialCard) return buildPluginCredentialForm({ card: spec.credentialCard });
  const { pluginDisplayName, helpUrl } = spec;
  return {
    title: `Connect ${pluginDisplayName} with an access token`,
    description:
      `Create a personal access token at ${helpUrl}, then paste it below. Tovu checks it with ` +
      `${pluginDisplayName} and seals it the moment you submit. The assistant never sees it, and it is never written to the chat.`,
    submitLabel: "Save token",
    fields: [
      {
        kind: "string",
        name: "token",
        label: `${pluginDisplayName} access token`,
        hint: "Pasted here only. Never shown to the assistant.",
        required: true,
        secret: true,
      },
    ],
    cancelLabel: "Cancel",
    app: { appName: "tovu-agent-plugins-access-token", appVersion: "1" },
  };
}

/**
 * The result that replaces the token form. `message` is caller-controlled and must never carry a
 * token — every call site passes a fixed sentence.
 *
 * @returns Outcome copy; the engine supplies the form's URI when rendering it.
 * @complexity O(1).
 */
export function buildAgentPluginAccessTokenOutcome(spec: {
  readonly pluginDisplayName: string;
  readonly state: "success" | "failure";
  readonly title: string;
  readonly message: string;
}, _optional = {}): SurfaceOutcomeSpec {
  return {
    title: spec.title,
    details: [{ label: "Connection", value: spec.pluginDisplayName }],
    state: spec.state,
    message: spec.message,
    app: { appName: "tovu-agent-plugins-access-token-outcome", appVersion: "1" },
  };
}
