import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import {
  buildDomainRegistrations,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { UUID } from "@jini-ai/cms/core";

import {
  SURFACE_EXCHANGE_ID_PARAM,
  askOnce,
  type AssistantSurfaceDeps,
  type SurfaceExchange,
} from "../contracts/core/tool-surface-exchanges.js";
import { ExternalMcpReauthRequiredError, externalMcpSettingsDeepLink } from "./external-mcp-oauth.js";
import {
  resolveExternalMcpAuthMode,
  resolveExternalMcpOAuthStatus,
  type ExternalMcpServerRepoPort,
} from "./external-mcp-store.js";

/**
 * @file The in-chat re-auth NOTICE for one external MCP connection — the surface half of the flow
 * `mcp-federation/registrations.ts`'s `onAuthFailed` / `external-mcp-oauth.ts`'s `reportAuthFailure`
 * already detect (landed `ae893f48`, verified 29/29 + 44/44, NOT rebuilt here). That flow marks a
 * row `needs_reauth` and throws the terminal, non-retryable `ExternalMcpReauthRequiredError` — prose
 * only, read solely by the model. This file turns "the model read some prose" into "the administrator
 * saw a card naming the server," the same gap `ask-choice-tool.ts` closed for decisions in general
 * (see that file's own header: "An operator watching the chat pane has no reliable way to notice that
 * a question was asked inside a paragraph").
 *
 * ## Why this does NOT call `beginConnect` itself — the trap a plausible implementation would fall into
 *
 * The obvious design is: mint a fresh authorization URL right here and put it in the dialog. That is
 * wrong for two independent, each-sufficient reasons, both already on record elsewhere rather than
 * discovered here:
 *
 * 1. **Cross-process.** This tool is wired into `agent-daemon-server.ts`'s registry — a SEPARATE OS
 *    process from the admin web server. That process's OWN `externalMcpOAuth` instance is built with
 *    ITS OWN `pending`/`devices` stores, which that file's own comment states outright: "Its
 *    pending-authorization and device-authorization stores are constructed and never used: this
 *    process serves no connect route and no callback route, so no handshake can start here." Calling
 *    `beginConnect()` from here would mint a `state`/PKCE record the PUBLIC OAuth callback route (which
 *    runs in the WEB SERVER process, `server/inbound/public-http/routes/external-mcp/oauth-callback.ts`)
 *    can never see — the administrator would sign in and land on an "invalid state" error.
 * 2. **Sandbox.** Even same-process, `ExternalMcpReauthRequiredError`'s own header rules this out
 *    independently: "A full OAuth redirect through the MCP-UI sandboxed iframe is rejected: its return
 *    leg cannot safely carry the callback ... and connecting a third-party account is an administrative
 *    act with workspace-wide blast radius that a non-operator chat participant should not be walked
 *    into." An mcp-ui surface has no `allow-top-navigation` and no wired `onOpenLink` handler in this
 *    admin app either (`useMcpUiHost`'s `onOpenLink` is never supplied anywhere under `apps/admin/`) —
 *    so even a clickable "Open" button would render and then do nothing, exactly the "dialog appears,
 *    submitting does nothing" failure mode this dispatch's own brief warns about, just for a different
 *    underlying reason than the allowlist trap.
 *
 * So this tool reuses the SAME authorize flow the admin UI already drives correctly — Settings →
 * External MCP's own "Reconnect" button, backed by `POST .../mcp-servers/:id/oauth/connect`
 * (`server/inbound/admin-http/routes/external-mcp/oauth.ts`), which already runs in the right process
 * with the right callback wiring — by POINTING at it (`externalMcpSettingsDeepLink`, the same helper
 * `ExternalMcpReauthRequiredError` itself already uses to build `settingsLink`), never by re-driving it.
 * No second authorize flow is invented.
 *
 * ## Idempotency under concurrent failures
 *
 * Two federated tool calls to the SAME connection can fail at once (two tools in one model turn, or
 * two calls racing). `reportAuthFailure` itself is already idempotent about the DURABLE state (it only
 * writes `needs_reauth` once — see that function's own comment). What is NOT durable, and needs its own
 * guard, is THIS tool opening two `SurfaceExchangeStore` exchanges for the same server: two open
 * dialogs would both be genuine, both answerable, and confusing about which one "counts." `activePrompts`
 * below is a per-process `Set<string>` of server ids with a notice currently open, checked and set
 * BEFORE `surfaceExchanges.open()` is ever called and cleared in a `finally` once the single exchange
 * this call opened settles (whatever the outcome) — so a second concurrent call for the same server
 * observes the guard and returns a plain "already showing" result instead of opening a second exchange.
 */

export const EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID = "external_mcp_reauth_prompt";

/** Mirrors the shared low-level shapes every domain re-imports the same way — see `ask-choice-tool.ts`'s
 *  identical import for the precedent this file follows (as opposed to `features/external-mcp/
 *  agent-tools.ts`'s own LOCAL redeclaration, which exists for a domain-isolation reason specific to
 *  that file and does not apply here). */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/**
 * The same permission `features/external-mcp/agent-tools.ts`'s `EXTERNAL_MCP_MANAGE_PERMISSION`
 * declares, and the admin OAuth HTTP routes gate on (`server/inbound/admin-http/routes/external-mcp/
 * guard.ts`). Restated as a literal rather than imported: that module already imports FROM
 * `#src/assistant/index` (its own `deps.ts` header), so this file — which lives in `assistant/` —
 * importing back from it would close a cycle. Reusing the STRING (not the binding) is what keeps the
 * two gates from drifting, the same reasoning that file's own header gives for restating ITS copy
 * rather than importing the HTTP route's.
 */
const EXTERNAL_MCP_MANAGE_PERMISSION = "admin.integrations.manage";

const INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      description:
        "The external MCP connection's id. For a federated tool call that just failed, this is the " +
        "segment of that tool's OWN id between 'mcp__' and the following '__' — e.g. 'higgsfield' from " +
        "'mcp__higgsfield__generate_video'.",
    },
  },
} as const;

export const externalMcpReauthAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID,
    description: [
      "Shows the administrator an in-chat notice — naming the server — that one external MCP " +
        "connection's authorization has expired and needs to be renewed. Blocks until they acknowledge " +
        "it or it goes unanswered.",
      "Call this the moment a federated tool call (an id starting with 'mcp__') fails with an error " +
        "saying a server 'is disconnected: its authorization expired or was revoked' — instead of only " +
        "relaying that in prose, which an administrator reading a paragraph has no reliable way to " +
        "notice. Do not call this for any other kind of failure, and do not keep retrying the original " +
        "failing tool call while waiting.",
      "This tool cannot complete the sign-in itself — an OAuth sign-in cannot safely run inside this " +
        "chat's sandboxed dialog — so the notice points the administrator at Settings → External MCP, " +
        "the one place that already can. After they say they have reconnected it, retry the ORIGINAL " +
        "failed call exactly once and report its real outcome truthfully.",
      "Returns { promptShown, acknowledged, serverId, label, currentStatus, note } once answered, or " +
        "{ promptShown: false, ... } if this execution context cannot show a dialog or a notice for " +
        "this server is already showing.",
    ].join(" "),
    sideEffects: "none",
    authorization: { permission: EXTERNAL_MCP_MANAGE_PERMISSION },
    inputSchema: INPUT_SCHEMA,
  },
];

export const externalMcpReauthDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> a read of the row's own status plus a confirmation dialog. No repo write, no command gateway,
  // no outbox, no bus, no OAuth handshake started.
  [EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = new Map(externalMcpReauthAgentToolCatalog.map((entry) => [entry.name, entry]));

/** The exact slice of a composition root's deps this tool reads — structural, not `Pick<RouteDeps,
 *  ...>`, for the same reason `features/external-mcp/deps.ts` gives for its own identical shape: no
 *  back-edge into `server/routes/types.ts`'s god type. */
export interface ExternalMcpReauthToolDeps {
  readonly workspaceId: UUID;
  readonly externalMcpServerRepo: ExternalMcpServerRepoPort;
}

function reauthSurfaceUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/external-mcp-reauth/${exchangeId}` as UIResourceUri;
}

/**
 * Builds the notice dialog. A single "Got it" button, no `cancel` tool action — matches
 * `confirmation.ts`'s own doc ("cancel... stays optional because a non-destructive confirmation has
 * nothing to burn"): there is nothing here to burn server-side, only an acknowledgement to record.
 */
function buildReauthSurface(input: { exchangeId: string; label: string; settingsLink: string }): UIResource {
  const { exchangeId, label, settingsLink } = input;
  return buildConfirmationSurface({
    uri: reauthSurfaceUri(exchangeId),
    title: `Reconnect ${label}`,
    description:
      `"${label}"'s sign-in has expired. The assistant cannot renew it from chat — open Settings → ` +
      `External MCP and click Reconnect on ${label}, then let the assistant know once you have.`,
    details: [{ label: "Where", value: settingsLink }],
    confirm: {
      label: "Got it",
      toolName: EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    },
    app: { appName: "tovu-external-mcp-reauth", appVersion: "1" },
    preferredFrameSize: ["100%", "260px"],
  });
}

/** Waits for the administrator's acknowledgement. There is only one real answer shape here (the
 *  single button posts back with no extra params), so this only needs to distinguish "answered" from
 *  the two ways it might not be — mirrors `content_post_delete`'s `resolveDeleteDecision` and
 *  `ask-choice-tool.ts`'s `awaitAskChoiceSubmission` for the same non-`received` cases. */
async function resolveReauthAcknowledgement(
  exchange: SurfaceExchange,
  ui: UIResource,
): Promise<{ acknowledged: true } | { acknowledged: false; reason: "expired" | "abandoned" }> {
  const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });
  if (answer.status !== "received") return { acknowledged: false, reason: answer.status };
  return { acknowledged: true };
}

/**
 * Builds this tool's registration.
 *
 * @param routeDeps - See {@link ExternalMcpReauthToolDeps}.
 * @param surfaces - Supplies the exchange store. Must be the same instance
 * `registerMcpUiToolCallsRoute` was mounted with, or an acknowledgement reaches nothing — the same
 * requirement every other surface-raising domain's `build*Registrations` doc states.
 * @returns A single registration.
 */
export function buildExternalMcpReauthRegistrations(
  routeDeps: ExternalMcpReauthToolDeps,
  surfaces: AssistantSurfaceDeps,
): ToolRegistration[] {
  // See this file's header, "Idempotency under concurrent failures". Keyed by serverId (not by
  // principal or exchange), because the property being protected is "at most one open notice per
  // CONNECTION", regardless of which of several failing calls reacts to it first.
  const activePrompts = new Set<string>();

  const handlers: Record<string, ToolHandler> = {
    [EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID]: async (ctx: Parameters<ToolHandler>[0]) => {
      const input = (ctx.input ?? {}) as Record<string, unknown>;
      const serverId = typeof input["id"] === "string" ? input["id"] : "";
      if (!serverId) {
        throw new Error(`${EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID}: 'id' is required.`);
      }

      const record = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId });

      // ---- Degrade to a plain terminal error rather than raising a dialog that cannot do anything
      // useful — see this file's own header and the dispatch's own "cannot proceed" rule. A missing
      // row or one with no OAuth client identity at all reuses `ExternalMcpReauthRequiredError`
      // itself: its wording ("ask the operator to reconnect it in Settings → External MCP") is
      // accurate for both. A row that simply is not OAuth-authenticated gets a distinct message,
      // because "authorization expired" would be actively misleading for a `static_env`/`none`
      // connection that was never going to have one. ----
      if (!record) throw new ExternalMcpReauthRequiredError({ serverId, label: null });
      if (resolveExternalMcpAuthMode(record) !== "oauth") {
        throw new Error(
          `${EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID}: '${record.label ?? serverId}' does not use OAuth ` +
            `authorization, so there is nothing to reconnect. Check its configuration in Settings → External MCP.`,
        );
      }
      if (!record.oauthProviderId && !record.oauthClientId) {
        throw new ExternalMcpReauthRequiredError({ serverId, label: record.label });
      }

      const label = record.label ?? record.serverId;

      // No interactive channel on this execution — degrade to a plain, honest instruction rather than
      // raising a dialog nobody can see. Non-destructive, unlike `content_post_delete`'s hard refusal
      // for the identical case: there is nothing to protect by refusing outright, only somebody to
      // still tell.
      if (!ctx.emitSurface) {
        return {
          promptShown: false,
          serverId,
          label,
          note:
            `This execution context cannot show an interactive dialog. Tell the administrator directly: ` +
            `"${label}" needs to be reconnected — open Settings → External MCP and click Reconnect on ${label}.`,
        };
      }

      if (activePrompts.has(serverId)) {
        return {
          promptShown: false,
          alreadyShowing: true,
          serverId,
          label,
          note: `A reconnect notice for "${label}" is already showing. Do not open another — wait for the administrator to answer that one.`,
        };
      }

      activePrompts.add(serverId);
      const exchange = surfaces.surfaceExchanges.open(
        { toolId: EXTERNAL_MCP_REAUTH_PROMPT_TOOL_ID, principalId: ctx.principal.id },
        ctx.emitSurface,
      );
      try {
        const ui = buildReauthSurface({ exchangeId: exchange.id, label, settingsLink: externalMcpSettingsDeepLink(serverId) });
        const answer = await resolveReauthAcknowledgement(exchange, ui);

        // Best-effort re-read: the administrator may answer well after the row's own status changed
        // (they may have already reconnected it through Settings while this dialog was open).
        const latest = await routeDeps.externalMcpServerRepo.findByServerId({ workspaceId: routeDeps.workspaceId, serverId });
        const currentStatus = latest ? resolveExternalMcpOAuthStatus(latest) : "disconnected";

        if (!answer.acknowledged) {
          return {
            promptShown: true,
            acknowledged: false,
            reason: answer.reason,
            serverId,
            label,
            currentStatus,
            note:
              answer.reason === "expired"
                ? `The administrator did not respond to the reconnect notice for "${label}" before it expired.`
                : `The reconnect notice for "${label}" was closed because the run ended.`,
          };
        }

        return {
          promptShown: true,
          acknowledged: true,
          serverId,
          label,
          currentStatus,
          note:
            currentStatus === "connected"
              ? `"${label}" is reconnected. Retry the original failed call now.`
              : `The administrator acknowledged the reconnect notice for "${label}". Its status is still ` +
                `'${currentStatus}' — ask them to confirm they finished in Settings → External MCP before ` +
                `retrying, or call this tool again once they say they have.`,
        };
      } finally {
        activePrompts.delete(serverId);
      }
    },
  };

  return buildDomainRegistrations({
    domain: "external-mcp-reauth",
    catalogModule: "assistant/external-mcp-reauth-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: externalMcpReauthDerivedRisk,
  });
}
