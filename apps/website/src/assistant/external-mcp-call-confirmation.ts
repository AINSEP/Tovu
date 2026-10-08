/**
 * @file G3: the per-call Confirm/Cancel card for protected external actions: permanent deletion,
 * delivery to people, and changes to assistant privacy/instructions/access (shared trust R3,
 * plus trash/restore-over-existing/publication under owner policy). The handler classifies actual arguments as well as remote hints;
 * neither removing a card nor remembering approval grants admission or permissions.
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
 * Remembered approvals under owner policy: besides Allow (this one call) and Cancel, the card
 * offers "Allow for this chat" (kept with the conversation) and, for a call that can be remembered,
 * "Always allow" (kept per site + connection + tool). Both are pinned to the tool's identity
 * (@jini-ai/mcp/federation), so a changed server, name or hints asks again. A remembered
 * approval skips the card; it never changes what is sent — the frozen arguments go out as before.
 *
 * Trash/delete/restore-over-existing/publish calls are asked every time. Existing specific
 * protected calls with write-shaped inputs also offer nothing to remember; neither scope skips them.
 * An ordinary read or write needs no card solely because an input happens to be named query/sql.
 *
 * Architectural role: `assistant` composition helper, implementing `FederationDeps.confirmCall`.
 */
import type { UUID } from "@jini-ai/core/primitives";
import type { AuthorizeFn } from "@jini-ai/cms/core";
import type { ToolExecutionContext, ToolExecutionOptions } from "@jini-ai/core";
import {
  buildFederatedCallConfirmSpec as buildJiniSpec,
  createFederatedCallConfirmer as createJiniConfirmer,
  type FederatedCardOffers,
} from "@jini-ai/mcp/federation/approvals";
import { notConfirmedResult, approvalToolHandler, type HumanConfirmSpec } from "../contracts/core/human-confirm.js";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import type { ConversationToolApprovalStore, ExternalMcpToolApprovalRepoPort } from "./external-mcp-tool-approval-ports.js";
import { toJiniConversationApprovalStore, toJiniToolApprovalRepo } from "./external-mcp-tool-approval-adapters.js";
import type { FederatedPolicyConfirmationRequest, FederationDeps } from "./mcp-federation/registrations.js";
import { tovuFederationMessages, TOVU_MCP_APPROVAL_FINGERPRINT_DOMAIN } from "./mcp-federation/presets.js";

/** Saving Always allow changes site settings for everyone, requiring the Integrations permission. */
const ALWAYS_ALLOW_PERMISSION = "admin.integrations.manage";

/** Host storage and permission ports; missing stores remove the corresponding card choice. */
export interface FederatedApprovalDeps {
  readonly workspaceId: UUID;
  readonly authorize: AuthorizeFn;
  readonly always?: ExternalMcpToolApprovalRepoPort;
  readonly chat?: ConversationToolApprovalStore;
  readonly conversationIdForRun?: (runId: string) => string | undefined;
  readonly now?: () => Date;
}

/** Bind settings wording/error codes to the package's pure card reducer.
 * Existing callers keep the host ABI; Jini refuses remember choices for destructive calls.
 * @complexity O(a) in the argument count and rendered values.
 */
export function buildFederatedCallConfirmSpec(request: FederatedPolicyConfirmationRequest,
  offers: FederatedCardOffers = { offerChat: false, offerAlways: false },
): HumanConfirmSpec {
  return actionConfirmSpec(buildJiniSpec({ request, messages: tovuFederationMessages, errorCode: "EXTERNAL_MCP" }, { offers }), request);
}

/** Per-call consent and irreversible-deletion wording are separate decisions. Jini still refuses
 * remembered grants; these CMS cards describe the real action instead of relabeling it a delete. */
function actionConfirmSpec(spec: HumanConfirmSpec, request: FederatedPolicyConfirmationRequest): HumanConfirmSpec {
  const action = request.approvalClass === 'publish' ? 'publishes, unpublishes or deploys content'
    : request.approvalClass === 'trash' ? 'moves data to Trash'
    : request.approvalClass === 'restore-over-existing' ? 'restores over existing data' : undefined;
  return action ? { ...spec, danger: request.approvalClass !== 'publish',
    warning: `This action ${action} in ${request.connectionLabel}. Approval applies to this call only.`,
  } : spec;
}

/** Bind the parked MCP-UI exchange and CMS permission evaluator to Jini's approval lifecycle.
 * The exchange store must be the one used by the click route. Cancellation remains fail-closed;
 * persistence failures allow this explicitly approved call and make the next one ask again.
 * @complexity O(1) plus store reads and the human's wait; no I/O until the returned callback runs.
 */
export function createFederatedCallConfirmer(surfaces: AssistantSurfaceDeps,
  approvals?: FederatedApprovalDeps,
): NonNullable<FederationDeps["confirmCall"]> {
  const confirm = createJiniConfirmer<ToolExecutionContext & ToolExecutionOptions & { approvalRequest: FederatedPolicyConfirmationRequest }, AssistantSurfaceDeps>({
    fingerprintDomain: TOVU_MCP_APPROVAL_FINGERPRINT_DOMAIN,
    errorCode: "EXTERNAL_MCP", messages: tovuFederationMessages, surfaceExchanges: surfaces,
    humanConfirm: { ask: async ({ context, surfaceExchanges, spec }) => {
      return approvalToolHandler({ surfaces: surfaceExchanges,
        prepare: async () => actionConfirmSpec(spec, context.approvalRequest),
        describe: ({ prepared }) => prepared,
        run: async ({ choice }) => ({ confirmed: true, ...(choice === undefined ? {} : { choice }) }),
      }, { declined: ({ reason }) => ({ confirmed: false, result: notConfirmedResult({ confirmed: false, reason }) }) })(context, { emitSurface: context.emitSurface }) as Promise<{ confirmed: true; choice?: string } | { confirmed: false; result: ReturnType<typeof notConfirmedResult> }>;
    } },
  }, {
    ...(approvals ? { scope: approvals.workspaceId, approvals: {
      clock: { nowMs: () => (approvals.now?.() ?? new Date()).getTime() },
      mayAlwaysAllow: async ({ principalId }: { principalId: string }) => (await approvals.authorize({
        principalId, permission: ALWAYS_ALLOW_PERMISSION, workspaceId: approvals.workspaceId, entityType: "integration",
      })).allowed,
      ...(approvals.always ? { always: toJiniToolApprovalRepo({ repo: approvals.always, workspaceId: approvals.workspaceId }) } : {}),
      ...(approvals.chat ? { chat: toJiniConversationApprovalStore({ store: approvals.chat }) } : {}),
      ...(approvals.conversationIdForRun ? { conversationIdForRun: ({ runId }: { runId: string }) => approvals.conversationIdForRun!(runId) } : {}),
    } } : {}),
    onPersistenceError: ({ choice, toolId, error }) => console.warn(
      `[external-mcp] could not remember the "${choice}" approval for ${toolId}; this call runs, the next one asks again — ${error instanceof Error ? error.message : String(error)}`,
    ),
  });
  return (context, request) => confirm({ context: { ...context, approvalRequest: request }, request });
}
