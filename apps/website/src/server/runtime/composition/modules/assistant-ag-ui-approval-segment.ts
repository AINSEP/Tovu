import { EventType } from "@ag-ui/core";
import { MCP_UI_ACTION_PLAN_META_KEY, MCP_UI_EXPIRES_AT_META_KEY } from "@jini-ai/protocol/mcp-ui";
import type { AgUiEvent } from "@jini-ai/chat/core/ag-ui";

import type { AdminApprovalCard } from "#src/assistant/admin-ag-ui-approvals";

/**
 * @file The two stream-side pieces of the admin AG-UI approval park (P6-T2.T step 4): recognizing
 * an approval card among the translated daemon events, and remembering the daemon stream's SSE
 * cursor so a resumed segment continues after the card instead of replaying the run from event 0.
 */

/** Where `@jini-ai/chat`'s run-frame translation records the daemon exchange identity on a
 *  surface's `_meta` (`surface-recovery.ts`'s `SURFACE_EXCHANGE_META`). Read by value because that
 *  constant is not on a public subpath yet. NEEDS-JINI: export it next to `MCP_UI_ACTION_PLAN_META_KEY`. */
const SURFACE_EXCHANGE_META = "jini/surface-exchange";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512;

/** The exchange identity and the card's own action plan, or undefined for anything else. */
function readCardMeta({ value }: { value: unknown }): { exchange: Record<string, unknown>; plan: Record<string, unknown>; meta: Record<string, unknown> } | undefined {
  const meta = record(value) && record(value.resource) && record(value.resource._meta) ? value.resource._meta : undefined;
  const exchange = meta?.[SURFACE_EXCHANGE_META];
  const plan = meta?.[MCP_UI_ACTION_PLAN_META_KEY];
  return meta && record(exchange) && record(plan) ? { exchange, plan, meta } : undefined;
}

/**
 * An identified approval: an mcp-ui card held open by a daemon exchange whose actions are exactly
 * the confirmation pair (`confirm` and `cancel`, as `buildConfirmationSurface` writes them for every
 * `requireHumanConfirm` card). Forms, choice cards and result cards also ride exchanges but are not
 * approvals: they keep streaming as ordinary cards, answered in place as today.
 * @complexity O(a) in the card's action count. */
export function readAdminApprovalCard({ event, extensionPrefix }: { event: AgUiEvent; extensionPrefix: string }, _optional = {}): AdminApprovalCard | undefined {
  if (event.type !== EventType.CUSTOM || event.name !== `${extensionPrefix}mcp-ui`) return undefined;
  const card = readCardMeta({ value: event.value });
  if (!card || !text(card.exchange.exchangeId) || !text(card.exchange.toolId)) return undefined;
  const actions = Array.isArray(card.plan.actions) ? card.plan.actions.map((action: unknown) => (record(action) ? action.id : undefined)) : [];
  if (!actions.includes("confirm") || !actions.includes("cancel")) return undefined;
  const expiresAtMs = card.meta[MCP_UI_EXPIRES_AT_META_KEY];
  return { exchangeId: card.exchange.exchangeId, toolId: card.exchange.toolId, message: text(card.plan.title) ? card.plan.title : "Approve this action?",
    ...(typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) ? { expiresAtMs } : {}) };
}

const ID_LINE = /(?:^|\n)id:[ ]?([^\n\r]*)\r?\n/g;

/**
 * Passes the daemon stream through unchanged while remembering the last SSE `id:` it carried.
 *
 * The cursor read at park time names the card's own frame: the held tool call cannot produce any
 * further run event until a human answers it, so nothing after the card has arrived yet (heartbeats
 * carry no id). A resumed segment reconnects with that cursor as `Last-Event-ID`, the daemon's own
 * reconnect contract, so neither the card nor earlier deltas are sent twice.
 * @complexity O(n) in the streamed bytes. */
export function tapSseCursor({ reader }: { reader: ReadableStreamDefaultReader<Uint8Array> }, _optional = {}) {
  const decoder = new TextDecoder();
  let carry = "";
  let cursor: string | undefined;
  // A plain delegate, not a prototype copy: the reader's methods need the real reader as `this`.
  const tapped: ReadableStreamDefaultReader<Uint8Array> = {
    get closed() { return reader.closed; },
    releaseLock: () => { reader.releaseLock(); },
    cancel: (reason?: unknown) => reader.cancel(reason),
    read: async () => {
    const result = await reader.read();
    if (result.value) {
      carry += decoder.decode(result.value, { stream: true });
      for (const match of carry.matchAll(ID_LINE)) cursor = match[1] || undefined;
      // Keep only the unfinished last line, so an `id:` split across chunks is still seen whole.
      carry = carry.slice(Math.max(0, carry.lastIndexOf("\n")));
    }
    return result;
    },
  };
  return { reader: tapped, cursor: (): string | undefined => cursor };
}
