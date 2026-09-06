/**
 * @file `chat_list_pending_attachments` — lets the assistant discover a chat attachment it was never
 * told about in this run: the discovery half of the bridge `promote-chat-attachment.ts` completes
 * (see that file's own header for the capability gap both close together).
 *
 * ## The gap this closes
 *
 * `media_promote_chat_attachment` takes an `attachmentRef`, but the model only ever learns a ref for
 * an attachment claimed IN THE SAME RUN — `@jini-ai/daemon`'s `image-prompt-delivery.ts` narrates an
 * already-claimed attachment's resolved path into that run's own prompt text, and nothing narrates
 * anything for an attachment left unclaimed from an earlier turn. A file dropped into chat and never
 * referenced again has no identifier the model can act on at all: not the composer's `attachment:
 * <uuid>` id (that never reaches the model — only the browser's own client state holds it), not a
 * path (nothing narrated one). This tool is that missing identifier source.
 *
 * ## Scoping — the actual security decision here
 *
 * `AttachmentStore.listPendingForOwner` (`@jini-ai/http-kit`) only returns records carrying an
 * `ownerId` that matches the id passed in, and only ones no run has claimed yet. This tool always
 * passes `ctx.principal.id` — the SAME Tovu admin-session identity `agent-daemon-server.ts` decodes
 * from a run's `contextRef` (`parseRunStartContextRef`'s `principalId`, itself
 * `getAuthedPrincipal(res).id` at the proxy) and records in `principalByRunId`. That identity is
 * exactly what `forwardAttachmentUpload`
 * (`server/runtime/composition/modules/assistant.ts`) now stamps into every upload's
 * `RUN_PRINCIPAL_HEADER` before it ever reaches the daemon's `AttachmentStore.register()` — the same
 * header `run-ownership.ts` already uses to scope run access, reused for the identical reason: it is
 * only trustworthy downstream of the daemon's bearer gate, which every route in this process sits
 * behind, so nothing a renderer sends can forge it.
 *
 * Net effect: this tool can never surface an attachment uploaded under a different admin's session,
 * and it can never surface one uploaded before this scoping existed (an ownerless record) — both are
 * excluded by `listPendingForOwner`'s own contract (see that method's doc), not by a check
 * duplicated here. Cross-site reach is structurally impossible for the same reason
 * `promote-chat-attachment.ts` gives: one `AttachmentStore` per site daemon, keyed by
 * `TOVU_WORKSPACE`.
 *
 * What this does NOT scope by: conversation. `batchId` (one per composer turn, not per conversation
 * — see `create-daemon-attachment-uploader.ts`) carries no stable per-conversation identity a server
 * could check, so two conversations run by the SAME admin can each see the other's still-pending
 * attachments through this tool. That is an acceptable widening of the pre-existing capability-bearer
 * model, not a new one this tool introduces: an admin could already hand `media_promote_chat_attachment`
 * any ref they had seen in either conversation.
 */
import type { ToolExecutionContext, ToolHandler, ToolRegistration } from "@jini-ai/core";
import type { PendingAttachmentSummary } from "@jini-ai/http-kit";

export const CHAT_LIST_PENDING_ATTACHMENTS_TOOL_ID = "chat_list_pending_attachments";

/** The one `AttachmentStore` method this tool needs — narrowed so a test double never has to fake the rest. */
export type PendingChatAttachmentLookup = { listPendingForOwner: (ownerId: string) => Promise<PendingAttachmentSummary[]> };

/** No fields — this tool takes no input, matching the zero-argument schema convention used
 *  elsewhere in this codebase (`demo-image-tool.ts`, `frontend-control-capabilities.ts`). */
const INPUT_SCHEMA = { type: "object", additionalProperties: false, properties: {} } as const;

/** Renders one `PendingAttachmentSummary` for the model: an ISO string reads far more reliably as
 *  "when" than a raw epoch integer would. */
function toWireAttachment(attachment: PendingAttachmentSummary): Record<string, unknown> {
  return {
    attachmentRef: attachment.ref,
    filename: attachment.name,
    kind: attachment.kind,
    size: attachment.size,
    uploadedAt: new Date(attachment.createdAt).toISOString(),
  };
}

/**
 * Builds the `chat_list_pending_attachments` `ToolRegistration` — registered directly in
 * `agent-daemon-server.ts`, next to `media_promote_chat_attachment`, for the identical reason that
 * file's own doc gives: this tool has no meaning outside a process that also runs an
 * `AttachmentStore`.
 *
 * @param deps.getStore Returns the live `AttachmentStore`, or `undefined` before daemon startup has
 * finished constructing it — a thunk, not a value, matching `buildPromoteChatAttachmentTool`'s own
 * `getStore` for the identical reason (this registration is built before that store exists).
 * @complexity O(1) plus one bounded store scan (`listPendingForOwner`'s own O(n) in tracked records,
 * a small bounded number — see that method's doc).
 */
export function buildListPendingChatAttachmentsTool(deps: {
  readonly getStore: () => PendingChatAttachmentLookup | undefined;
}): ToolRegistration {
  const handler: ToolHandler = async (ctx: ToolExecutionContext) => {
    const store = deps.getStore();
    if (!store) {
      // Structurally unreachable once the daemon has finished starting — see
      // `promote-chat-attachment.ts`'s own `attachmentStore` doc for why this is still handled
      // rather than asserted non-null.
      throw new Error("attachment store is not ready");
    }
    const pending = await store.listPendingForOwner(ctx.principal.id);
    return { attachments: pending.map(toWireAttachment) };
  };

  return {
    descriptor: {
      id: CHAT_LIST_PENDING_ATTACHMENTS_TOOL_ID,
      description:
        "Lists files the user attached in this chat that you have not yet been told about in this " +
        "run — for example, something attached in an earlier turn and never referenced since. Each " +
        "result's 'attachmentRef' can be passed straight to media_promote_chat_attachment. Only " +
        "attachments the current user uploaded, and not yet claimed by any run, are returned; an " +
        "empty list means there is nothing pending.",
      inputSchema: INPUT_SCHEMA,
    },
    handler,
    // Pass-through `allow`, same reasoning as `media_promote_chat_attachment`'s own registration:
    // the real access decision is `listPendingForOwner`'s own scoping to `ctx.principal.id` (see
    // this file's header), so there is no separate permission to gate here.
    policy: { authorize: () => "allow" },
  };
}
