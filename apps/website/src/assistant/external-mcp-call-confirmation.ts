/**
 * @file G3: the per-call Confirm/Cancel card for every external (federated) tool that is not marked
 * read-only — the one approval rule for external MCP servers, agent plugins and integrations
 * (`mcp-federation/trust.ts` R3, owner rule 2026-09-27). No per-plugin config: the rule reads only
 * the remote's own hints, and those can only ever ADD this card, never remove it.
 *
 * Built on `requireHumanConfirm` (`contracts/core/human-confirm.ts`) — the same held-open MCP-UI
 * exchange every confirmed native tool uses — so a click reaches the parked call through
 * `mcp-ui-tool-calls-route.ts`. Federated ids are dynamic, so they are not on
 * `MCP_UI_REDEEMABLE_TOOL_IDS`; `isMcpUiToolCallPermitted` lets an `mcp__` id ANSWER an open card and
 * never be executed by that route.
 *
 * The card shows the service, the tool and every argument in plain words: a string argument (the SQL
 * of `execute_sql`, say) exactly as it will be sent, anything else as JSON. The arguments it is given
 * are the frozen object the handler sends on Confirm (`registrations.ts`'s `frozenArguments`), so what
 * the human approves is what runs.
 *
 * Remembered approvals (owner rule 2026-09-27): besides Allow (this one call) and Cancel, the card
 * offers "Allow for this chat" (kept with the conversation) and, for a tool that is not destructive,
 * "Always allow" (kept per site + connection + tool). Both are pinned to the tool's identity
 * (`external-mcp-tool-approvals.ts`), so a changed server, name or hints asks again. A remembered
 * approval skips the card; it never changes what is sent — the frozen arguments go out as before.
 *
 * Write-shaped inputs (owner rule 2026-09-27, "Extra safety checks"): a call whose schema or arguments
 * carry a write-shaped input name (`sql`, `query`, `drop`, …; `trust.ts` `WRITE_SHAPED_INPUT_WORDS`)
 * is asked every time — no remembered approval skips it, and its card offers nothing to remember.
 *
 * Architectural role: `assistant` composition helper, implementing `FederationDeps.confirmCall`.
 */
import type { AuthorizeFn, UUID } from "@jini-ai/cms/core";
import type { ToolExecutionContext } from "@jini-ai/core";
import type { SurfaceDetail } from "@jini-ai/ui/mcp-ui/surfaces";

import {
  notConfirmedResult,
  requireHumanConfirm,
  type HumanConfirmAlternative,
  type HumanConfirmSpec,
} from "../contracts/core/human-confirm.js";
import type { AssistantSurfaceDeps } from "../contracts/core/tool-surface-exchanges.js";

import {
  federatedToolApprovalFingerprint,
  type ConversationToolApprovalKey,
  type ConversationToolApprovalStore,
  type ExternalMcpToolApprovalRepoPort,
} from "./external-mcp-tool-approvals.js";
import type { FederatedCallConfirmationOutcome, FederatedCallConfirmationRequest } from "./mcp-federation/ports.js";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/** Saving an "Always allow" changes the site's settings for everyone, so it takes the same permission as the Integrations page. */
const ALWAYS_ALLOW_PERMISSION = "admin.integrations.manage";

/** A string argument this long, or with a line break, reads better as a scrolling code block. */
const INLINE_ARGUMENT_MAX_LENGTH = 60;

/** Where remembered approvals are kept, and how a call finds its conversation. All optional: absent parts are simply not offered. */
export interface FederatedApprovalDeps {
  readonly workspaceId: UUID;
  /** Decides whether the person may save an "Always allow" (`admin.integrations.manage`). */
  readonly authorize: AuthorizeFn;
  /** "Always allow" rows (`external_mcp_tool_approvals`). Absent: never offered. */
  readonly always?: ExternalMcpToolApprovalRepoPort;
  /** "Allow for this chat" rows (`chat.db`). Absent: never offered. */
  readonly chat?: ConversationToolApprovalStore;
  /** The conversation a run belongs to. Absent, or `undefined` for a run: "this chat" is not offered. */
  readonly conversationIdForRun?: (runId: string) => string | undefined;
  readonly now?: () => Date;
}

/** Which remembered-approval buttons a card may carry. */
export interface FederatedCardOffers {
  readonly offerChat: boolean;
  readonly offerAlways: boolean;
}

/** One argument as a card row: short strings inline and verbatim; long or multi-line strings and anything else as a code block. */
function argumentDetail(name: string, value: unknown): SurfaceDetail {
  if (typeof value === "string") {
    const long = value.length > INLINE_ARGUMENT_MAX_LENGTH || value.includes("\n");
    return long ? { label: name, value, format: "code" } : { label: name, value };
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return { label: name, value: String(value) };
  return { label: name, value: JSON.stringify(value, null, 2) ?? String(value), format: "code" };
}

/** A call with a write-shaped input asks every time: nothing about it may be remembered. */
function isWriteShaped(request: FederatedCallConfirmationRequest): boolean {
  return request.writeShapedInputs.length > 0;
}

/**
 * The card's extra buttons. "Always allow" is never offered for a destructive tool, and neither
 * remembered approval for a write-shaped call, whatever `offers` says.
 */
function approvalAlternatives(request: FederatedCallConfirmationRequest, offers: FederatedCardOffers): HumanConfirmAlternative[] {
  const alternatives: HumanConfirmAlternative[] = [];
  if (isWriteShaped(request)) return alternatives;
  if (offers.offerChat) alternatives.push({ id: "allow-chat", label: "Allow for this chat", choice: "chat" });
  if (offers.offerAlways && !request.destructive) alternatives.push({ id: "allow-always", label: "Always allow", choice: "always" });
  return alternatives;
}

/**
 * The card for one call. Pure, so its words are testable without a transport.
 *
 * @complexity O(a) in the argument count.
 */
export function buildFederatedCallConfirmSpec(
  request: FederatedCallConfirmationRequest,
  offers: FederatedCardOffers = { offerChat: false, offerAlways: false },
): HumanConfirmSpec {
  const label = request.connectionLabel;
  const argumentRows = Object.entries(request.arguments).map(([name, value]) => argumentDetail(name, value));
  const alternatives = approvalAlternatives(request, offers);
  return {
    toolId: request.toolId,
    errorCode: "EXTERNAL_MCP",
    title: `Run ${request.remoteName} on ${label}?`,
    description: "The assistant wants to run this with exactly the values below. Nothing runs until you allow it.",
    details: [
      { label: "Service", value: label },
      { label: "Tool", value: request.remoteName },
      ...(argumentRows.length > 0 ? argumentRows : [{ label: "Arguments", value: "(none)" }]),
    ],
    warning: cardWarning(request),
    danger: request.destructive,
    confirmLabel: "Allow",
    ...(alternatives.length > 0 ? { alternatives } : {}),
  };
}

function cardWarning(request: FederatedCallConfirmationRequest): string {
  const label = request.connectionLabel;
  const base = request.destructive
    ? `${label} marks this tool as destructive: it can delete or overwrite data, and that may not be undoable.`
    : `This can change things in ${label}.`;
  if (!isWriteShaped(request)) return base;
  return `${base} Its input ${request.writeShapedInputs.join(", ")} looks like it can change data, so Tovu asks every time.`;
}

/** Everything one call needs to look up, offer and save a remembered approval. */
interface ApprovalContext {
  readonly fingerprint: string;
  readonly chatKey: ConversationToolApprovalKey | undefined;
  readonly alwaysKey: { workspaceId: UUID; serverId: string; toolName: string } | undefined;
}

async function approvalContext(
  ctx: ToolExecutionContext,
  request: FederatedCallConfirmationRequest,
  approvals: FederatedApprovalDeps | undefined,
): Promise<ApprovalContext> {
  const fingerprint = federatedToolApprovalFingerprint(request);
  if (!approvals) return { fingerprint, chatKey: undefined, alwaysKey: undefined };
  const conversationId = approvals.conversationIdForRun?.(ctx.run.id);
  const chatKey =
    approvals.chat && conversationId
      ? { conversationId, principalId: ctx.principal.id, connectionId: request.connectionId, toolName: request.remoteName, fingerprint }
      : undefined;
  // Only a connection with a saved row can hold an "Always allow" beside it; a preset has none.
  const alwaysKey =
    approvals.always && request.origin?.kind === "roster"
      ? { workspaceId: approvals.workspaceId, serverId: request.connectionId, toolName: request.remoteName }
      : undefined;
  return { fingerprint, chatKey, alwaysKey };
}

/**
 * Whether a remembered approval covers this call. A saved "Always allow" whose fingerprint no longer
 * matches (the tool's server, name or hints changed) is deleted here — void, so the Integrations page
 * stops listing it — and the call asks again.
 */
async function isRemembered(approvals: FederatedApprovalDeps, request: FederatedCallConfirmationRequest, context: ApprovalContext): Promise<boolean> {
  if (isWriteShaped(request)) return false;
  if (context.alwaysKey && approvals.always) {
    const saved = await approvals.always.find(context.alwaysKey);
    // Never honoured for a destructive tool, even if a matching row somehow exists.
    if (saved && saved.fingerprint === context.fingerprint && !request.destructive) return true;
    if (saved) await approvals.always.delete(context.alwaysKey);
  }
  return context.chatKey !== undefined && approvals.chat !== undefined && (await approvals.chat.has(context.chatKey));
}

async function mayAlwaysAllow(ctx: ToolExecutionContext, approvals: FederatedApprovalDeps): Promise<boolean> {
  const result = await approvals.authorize({
    principalId: ctx.principal.id,
    permission: ALWAYS_ALLOW_PERMISSION,
    workspaceId: approvals.workspaceId,
    entityType: "integration",
  });
  return result.allowed;
}

/**
 * Saves what the person chose. A save that fails (the chat is not recorded yet, the DB is busy) is
 * logged and dropped: the person approved THIS call, so it still runs, and the next call asks again.
 */
async function remember(
  ctx: ToolExecutionContext,
  approvals: FederatedApprovalDeps,
  request: FederatedCallConfirmationRequest,
  context: ApprovalContext,
  choice: string | undefined,
): Promise<void> {
  // A forged choice on a write-shaped card saves nothing: that call is asked every time.
  if (isWriteShaped(request)) return;
  const grantedAt = (approvals.now?.() ?? new Date()).toISOString();
  try {
    if (choice === "chat" && context.chatKey && approvals.chat) await approvals.chat.grant(context.chatKey, grantedAt);
    if (choice === "always" && context.alwaysKey && approvals.always && !request.destructive) {
      await approvals.always.upsert({ ...context.alwaysKey, fingerprint: context.fingerprint, grantedByPrincipalId: ctx.principal.id, grantedAt });
    }
  } catch (error) {
    console.warn(
      `[external-mcp] could not remember the "${choice}" approval for ${request.toolId}; this call runs, the next one asks again — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Builds `FederationDeps.confirmCall` over the given exchange store. That store MUST be the one the
 * click route is mounted with (see `AssistantSurfaceDeps`). With `approvals`, the card offers and
 * honours remembered approvals; without, it is Allow / Cancel only.
 *
 * @complexity O(1) plus up to two store reads, and the wait for the human.
 */
export function createFederatedCallConfirmer(
  surfaces: AssistantSurfaceDeps,
  approvals?: FederatedApprovalDeps,
): NonNullable<FederationDeps["confirmCall"]> {
  return async (ctx, request): Promise<FederatedCallConfirmationOutcome> => {
    const context = await approvalContext(ctx, request, approvals);
    if (approvals && (await isRemembered(approvals, request, context))) return { confirmed: true };
    const rememberable = !isWriteShaped(request);
    const offerAlways =
      rememberable && context.alwaysKey !== undefined && !request.destructive && approvals !== undefined && (await mayAlwaysAllow(ctx, approvals));
    const spec = buildFederatedCallConfirmSpec(request, { offerChat: rememberable && context.chatKey !== undefined, offerAlways });
    const outcome = await requireHumanConfirm(ctx, surfaces, spec);
    if (!outcome.confirmed) return { confirmed: false, result: notConfirmedResult(outcome) };
    if (approvals) await remember(ctx, approvals, request, context, outcome.choice);
    return { confirmed: true };
  };
}
