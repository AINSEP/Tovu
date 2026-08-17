import { randomUUID } from "node:crypto";

import type { SurfaceEmission, SurfaceEmitter } from "@jini-ai/core";

/**
 * @file A **surface exchange**: a two-way, multi-message conversation with a human, held open inside
 * one agent tool call.
 *
 * ## What this is
 *
 * The agent calls a tool. The tool opens an exchange, sends something for a person to look at, and
 * waits. The person answers. The tool may send again — a follow-up question, an updated component
 * tree, a validation error — and wait again, any number of times. When it is done it closes the
 * exchange and returns, and the human's answers are the tool call's ordinary result. The agent is
 * still alive the whole time, which is what makes the transcript correct by construction rather than
 * reconstructed afterwards (ADR-055 Decision 4).
 *
 * A one-shot ask — show a form, get one submission — is the degenerate case, expressed by
 * {@link askOnce}. It is a helper over this, not a separate mechanism.
 *
 * ## Channel-agnostic on purpose
 *
 * Nothing here knows what a surface *is*. Outbound messages are `@jini-ai/core`'s
 * {@link SurfaceEmission}, which names its own channel; inbound answers are plain records. That is
 * what lets one exchange drive MCP-UI (an HTML surface answering by tool call), A2UI (`createSurface`
 * → action → `updateComponents` → action, which is inherently multi-turn), the run protocol's own
 * channel-neutral `surface_request`/`surface_response` pair, or a paradigm that does not exist yet.
 * The transports differ; "hold the agent's call open and pass messages both ways" does not.
 *
 * ## The inbound buffer is a correctness requirement, not a nicety
 *
 * A message can arrive while the handler is between {@link SurfaceExchange.receive} calls — busy
 * composing its next send. Without somewhere to put it, that message is dropped and the exchange
 * deadlocks on an answer the human already gave. So deliveries queue. This is the one thing that is
 * genuinely painful to retrofit onto a one-shot store, which is why it is here before there is a
 * multi-turn channel wired to need it.
 *
 * ## Opening requires an emitter, so the other deadlock is unrepresentable
 *
 * The second deadlock is structural: a handler waiting for an answer to a message it never managed
 * to send. The daemon reads surfaces out of a *completed* tool result, so the return value cannot
 * carry a message the same call is waiting on — only `ToolExecutionContext.emitSurface` can.
 * {@link SurfaceExchangeStore.open} therefore takes that emitter as a required argument. A handler
 * with no emitter cannot open an exchange at all, and must fall back to a two-call shape.
 *
 * ## Not a secret
 *
 * An exchange id is a **correlation handle**. It says which in-flight call a message belongs to and
 * confers nothing — contrast `pending-confirmations.ts`, which mints a genuine secret because the
 * delete it guards is a second tool call the model could otherwise make itself (ADR-055 Decision 3).
 * Ids here are stored in the clear and compared with `===`. Copying that module's hashing and
 * constant-time comparison would imply a security property this handle does not carry.
 *
 * The property this file IS responsible for is narrower: **a message resolves at most one waiting
 * receive, on an exchange opened by the same tool for the same principal.**
 *
 * ## Architectural role
 *
 * `assistant` layer, domain-agnostic — it names no post, page, or content concept.
 */

/**
 * The callback param carrying an exchange id from a rendered surface back to the server.
 *
 * Double-underscored to keep it clear of a surface's real fields, and named in one place because
 * three parties must agree on it: whatever builds the surface, the route that routes on it, and the
 * handler that opened the exchange.
 *
 * This is MCP-UI's carrier specifically, because an mcp-ui surface can only answer by issuing a tool
 * call, so its correlation has to ride inside that call's params. A channel that can name the
 * exchange directly should do so — `mcp-ui-tool-calls-route.ts` also accepts a top-level
 * `exchangeId`, and A2UI/`surface_request` correlate by their own `surfaceId`.
 */
export const SURFACE_EXCHANGE_ID_PARAM = "__exchangeId";

/**
 * The callback param a surface's Cancel action sets, so a dismissal resolves the exchange
 * immediately instead of stranding the agent until the idle deadline.
 *
 * Carried as data rather than as a distinct {@link SurfaceMessage} status: "the human answered, and
 * the answer was no" is genuinely an answer, and only the tool that built the surface knows what a
 * dismissal means for its own result.
 */
export const SURFACE_DISMISSED_PARAM = "__dismissed";

/**
 * How long an exchange may sit with nothing happening before it gives up.
 *
 * Per *turn*, not per exchange: it resets whenever a message is sent or received, so a long
 * multi-turn conversation is not punished for taking several turns — only for a human who walked
 * away. Long enough to read a dialog and decide, short enough that an abandoned tab does not hold a
 * live agent subprocess open.
 */
export const DEFAULT_SURFACE_IDLE_TTL_MS = 5 * 60 * 1000;

/**
 * Hard ceiling on one exchange's total life, regardless of activity.
 *
 * Exists because the idle deadline alone is unbounded in aggregate — a human answering every four
 * minutes could hold a call open indefinitely, and the call is not ours to hold: it is an HTTP
 * request from the spawned agent's MCP server, which gives up after 6 minutes (`@jini-ai/mcp`'s
 * delegated-tool deadline). Sized just inside that, so a stalled exchange returns an explicit result
 * the model can read rather than having the transport time out underneath it.
 *
 * **This, not the idle deadline, is what caps a multi-turn conversation today.** Raising it means
 * raising the transport deadline first; the two must move together or the ordering inverts.
 */
export const DEFAULT_SURFACE_MAX_LIFETIME_MS = 5.5 * 60 * 1000;

/** Who an exchange belongs to. Checked on every delivery; a mismatch is a rejection, not a warning. */
export interface SurfaceExchangeBinding {
  /** The tool that opened it. A message for one tool cannot resolve another's exchange. */
  toolId: string;
  /** The principal whose run opened it — one human's answer must not land in another's call. */
  principalId: string;
}

/**
 * One inbound message, or the reason there will not be one.
 *
 * The non-`received` cases are part of the contract rather than error handling (ADR-055 Decision 6):
 * blocking moves the timeout story, it does not remove it, and a handler must be able to tell the
 * model something true about which happened.
 */
export type SurfaceMessage =
  | { status: "received"; params: Record<string, unknown> }
  | { status: "expired" }
  | { status: "abandoned" };

/** Why a delivery did not reach an exchange. Reported to the browser, never to the model. */
export type SurfaceDeliveryRejectionReason = "unknown-or-closed" | "binding-mismatch";

export type DeliverResult = { ok: true } | { ok: false; reason: SurfaceDeliveryRejectionReason };

/** A live, two-way conversation bound to one in-flight tool call. */
export interface SurfaceExchange {
  /** Correlation handle. Embed it in whatever the human answers through. Not a secret. */
  readonly id: string;
  /**
   * Sends one message out to the human.
   *
   * @throws {Error} If the exchange has already ended — the same posture the daemon's emitter takes,
   * because a message sent onto a settled call has no way to be answered.
   */
  send(emission: SurfaceEmission): Promise<void>;
  /**
   * Waits for the next inbound message.
   *
   * Returns a buffered one immediately if the human answered while the handler was busy. Once the
   * exchange has ended, returns that terminal status rather than hanging — so a handler looping on
   * `receive()` terminates instead of waiting out the transport.
   */
  receive(): Promise<SurfaceMessage>;
  /** Ends the exchange. Idempotent. Any waiting `receive()` resolves `"abandoned"`. */
  close(): void;
}

/**
 * What a delivery must prove about itself. `principalId` is load-bearing for every channel — one
 * human's answer must never land in another's call. `toolId` is load-bearing only for a channel
 * whose correlation carrier is itself a tool call: MCP-UI's surface can only answer by issuing one,
 * so it always has a real tool name to offer, and the store checks it.
 *
 * A channel that correlates directly by its own id — A2UI's `surfaceId`, the run protocol's own
 * `surface_request`/`surface_response` — has no natural `toolId` to supply; the browser never
 * learns which tool opened the exchange, only its id. Requiring one anyway would force such a
 * channel to either lie (send a placeholder that means nothing) or grow a lookup this store does
 * not expose. So `toolId` is optional here: when a caller supplies it, it must still match exactly
 * (MCP-UI's behavior is unchanged, byte for byte); when omitted, only `principalId` and the
 * exchange's own unguessable `randomUUID()` id gate the delivery. That pair is still sufficient —
 * the id is not enumerable, and `principalId` is a server-verified session identity, never a value
 * the browser chooses (see `run-ownership.ts`) — so relaxing the caller's OBLIGATION does not
 * relax the exchange's own binding, which `open()` still records honestly as whatever tool actually
 * opened it.
 */
type DeliverySpec = { exchangeId: string; params: Record<string, unknown>; principalId: string; toolId?: string };

export interface SurfaceExchangeStore {
  /**
   * Opens an exchange bound to one in-flight tool call.
   *
   * @param emit - The call's live {@link SurfaceEmitter}. Required, not optional: an exchange whose
   * messages cannot reach anybody is a guaranteed deadlock, and taking the emitter here is what makes
   * that state unrepresentable rather than merely discouraged.
   */
  open(binding: SurfaceExchangeBinding, emit: SurfaceEmitter): SurfaceExchange;
  /**
   * Routes one inbound message to the exchange it names, queueing it if nothing is waiting yet.
   * See {@link DeliverySpec} for why `toolId` is optional rather than part of
   * {@link SurfaceExchangeBinding} here.
   */
  deliver(spec: DeliverySpec): DeliverResult;
  /** Open, unsettled count — for tests and diagnostics only. */
  size(): number;
}

/**
 * The one-shot case: send once, wait once, close.
 *
 * Kept as a helper rather than a second mechanism, because "ask a question and get one answer" is
 * genuinely just the shortest exchange. Anything that later needs a follow-up turn stops calling this
 * and drives the exchange directly, with no change to the store, the route, or the transport.
 */
export async function askOnce(exchange: SurfaceExchange, emission: SurfaceEmission): Promise<SurfaceMessage> {
  await exchange.send(emission);
  try {
    return await exchange.receive();
  } finally {
    exchange.close();
  }
}

/**
 * Like {@link askOnce}, but for a call whose answer triggers real work whose OUTCOME the human also
 * needs to see — a publish, a delete, a credential save. `askOnce` alone cannot express this: it
 * closes the exchange the instant an answer arrives, so a caller that awaited it and then tried to
 * `exchange.send()` a result would find the exchange already dead (`send()` throws "already ended").
 *
 * ## The defect this exists to fix
 *
 * A confirmation surface's own script (`confirmation.ts`) sets its status text to "Done." the moment
 * the confirming `tools/call` RESOLVES — and for a held-open exchange delivered through
 * `mcp-ui-tool-calls-route.ts`'s Shape 1, that call resolves the instant the click is DELIVERED to
 * the parked agent call (`{delivered: true}`, HTTP 202), which happens before the parked handler has
 * done anything with the answer yet, let alone finished. "Done." therefore means "your click
 * reached the server," never "the thing you asked for actually happened" — a 404, a rejected
 * credential, and a genuine success all render the identical "Done." to the human. `handle` below is
 * where a caller does the real work and decides what actually happened; the outcome emission this
 * function sends afterward is what corrects the record.
 *
 * ## How the correction reaches the screen
 *
 * The outcome emission is expected to reuse the SAME `ui://` URI the confirmation was sent under.
 * `McpUiSurfaceCard` (`@jini-ai/chat`) already collapses a stream to the newest resource per URI —
 * "a stream may re-send an updated document for a surface already on screen (a confirmation that
 * became a result), so the LAST event for each URI wins" (that component's own doc) — and
 * `McpUiHost` keys its iframe by `` `${uri}:${documentText}` ``, so a new document forces a clean
 * remount rather than leaving the confirmation's stale Confirm/Cancel buttons on screen. Neither of
 * those needed a change for this to work; this function only needed to make the SECOND send possible.
 *
 * ## Why `handle` returns the outcome rather than the caller sending it separately
 *
 * Keeping the send here, not in the caller, is what makes the try/catch below unconditional: a
 * caller could forget to wrap its own `exchange.send()`, but every caller of this function gets the
 * protection for free. `outcome` is OPTIONAL in the return — a cancelled/expired/abandoned answer has
 * nothing to correct (the confirmation's own script already reports "Dismissed." for a local cancel,
 * and an exchange that ended via a timeout is already closed, so `send()` would throw anyway); a
 * caller for that branch simply omits it.
 *
 * ## The one invariant this function protects
 *
 * `result` — what reaches the model — must NEVER depend on the outcome emission actually reaching a
 * screen. A human who closed the tab, a `send()` racing a teardown, or any other failure in the
 * human-visible half must be invisible to the tool's own JSON contract, which is why the outcome send
 * is wrapped in its own `try`/`catch` rather than sharing `handle`'s.
 *
 * @param exchange - Opened the same way `askOnce` expects one.
 * @param confirmationEmission - Sent once, exactly like `askOnce`'s own `emission` parameter.
 * @param handle - Runs after the answer arrives (whatever it is — received, expired, abandoned).
 *   Does the caller's real work and returns `result` (returned to THIS function's own caller,
 *   ultimately the model) plus an optional `outcome` emission to report back to the human.
 * @complexity O(1) plus whatever `handle` itself costs — this function adds one conditional send and
 *   the same `close()` `askOnce` already pays.
 */
export async function askThenReport<T>(
  exchange: SurfaceExchange,
  confirmationEmission: SurfaceEmission,
  handle: (answer: SurfaceMessage) => Promise<{ result: T; outcome?: SurfaceEmission }>
): Promise<T> {
  await exchange.send(confirmationEmission);
  try {
    const answer = await exchange.receive();
    const { result, outcome } = await handle(answer);
    if (outcome !== undefined) {
      try {
        await exchange.send(outcome);
      } catch {
        // Swallowed deliberately — see this function's own doc ("the one invariant"): a human-visible
        // frame update failing must never turn into a model-visible tool failure for work that already
        // genuinely succeeded or failed on its own terms.
      }
    }
    return result;
  } finally {
    exchange.close();
  }
}

interface Registered {
  binding: SurfaceExchangeBinding;
  /** Hands one inbound message to a waiting receiver, or queues it. */
  accept: (params: Record<string, unknown>) => void;
}

/**
 * Creates an in-process store of open surface exchanges.
 *
 * In-process necessarily, not merely by choice: an open exchange is a suspended function call in
 * this process's memory. It could not be shared across processes even if that were desirable.
 * `mcp-ui-tool-calls-route.ts` is mounted on the same daemon the handlers run in, which is what makes
 * delivery a direct call rather than another network hop.
 *
 * @param deps.idleTtlMs - Per-turn inactivity deadline. See {@link DEFAULT_SURFACE_IDLE_TTL_MS}.
 * @param deps.maxLifetimeMs - Total lifetime ceiling. See {@link DEFAULT_SURFACE_MAX_LIFETIME_MS}.
 * @param deps.newExchangeId - Id source, injected so a test can assert a known value.
 * @complexity O(1) per send/receive/deliver. Each exchange owns two `unref`'d timers.
 */
export function createSurfaceExchangeStore(
  deps: {
    idleTtlMs?: number;
    maxLifetimeMs?: number;
    newExchangeId?: () => string;
  } = {}
): SurfaceExchangeStore {
  const idleTtlMs = deps.idleTtlMs ?? DEFAULT_SURFACE_IDLE_TTL_MS;
  const maxLifetimeMs = deps.maxLifetimeMs ?? DEFAULT_SURFACE_MAX_LIFETIME_MS;
  const newExchangeId = deps.newExchangeId ?? (() => randomUUID());

  const openExchanges = new Map<string, Registered>();

  return {
    open(binding, emit) {
      const id = newExchangeId();

      /** Answers delivered but not yet asked for — the buffer that keeps a fast human from being lost. */
      const inbox: Record<string, unknown>[] = [];
      /** Receivers waiting on an answer that has not arrived. */
      const waiters: ((message: SurfaceMessage) => void)[] = [];
      let terminal: SurfaceMessage | undefined;

      let idleTimer: ReturnType<typeof setTimeout> | undefined;

      /** Settles the exchange once. Every waiting receiver learns why, rather than hanging. */
      function end(reason: SurfaceMessage): void {
        if (terminal) return;
        terminal = reason;
        if (idleTimer) clearTimeout(idleTimer);
        clearTimeout(lifetimeTimer);
        openExchanges.delete(id);
        while (waiters.length > 0) waiters.shift()!(reason);
      }

      // `unref` on both so an abandoned exchange cannot by itself keep the daemon process alive —
      // the same posture `@jini-ai/daemon`'s tool executor takes with its own timeout.
      const lifetimeTimer = setTimeout(() => end({ status: "expired" }), maxLifetimeMs);
      lifetimeTimer.unref?.();

      function armIdle(): void {
        if (terminal) return;
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => end({ status: "expired" }), idleTtlMs);
        idleTimer.unref?.();
      }

      armIdle();

      openExchanges.set(id, {
        binding,
        accept: (params) => {
          armIdle();
          const waiter = waiters.shift();
          if (waiter) waiter({ status: "received", params });
          // Nobody is asking yet — the handler is mid-send, or composing its next message. Queue
          // rather than drop: dropping would deadlock the exchange on an answer already given.
          else inbox.push(params);
        },
      });

      return {
        id,
        async send(emission) {
          if (terminal) throw new Error(`surface exchange ${id} has already ended`);
          armIdle();
          await emit(emission);
        },
        async receive() {
          const buffered = inbox.shift();
          if (buffered) {
            armIdle();
            return { status: "received", params: buffered };
          }
          // Reported rather than hung, so a handler looping `while (…) await receive()` terminates
          // on expiry or close instead of waiting out the transport deadline.
          if (terminal) return terminal;
          return new Promise<SurfaceMessage>((resolve) => waiters.push(resolve));
        },
        close() {
          end({ status: "abandoned" });
        },
      };
    },

    deliver(spec) {
      const entry = openExchanges.get(spec.exchangeId);

      // One reason for "no such exchange" and "already closed" alike. Not for secrecy — an exchange
      // id is not a secret — but because they are the same thing to the only caller who sees it: a
      // human whose dialog is no longer the one being waited on.
      if (!entry) return { ok: false, reason: "unknown-or-closed" };

      // `toolId` is checked only when the caller supplied one — see `DeliverySpec`'s own doc for
      // why a channel that correlates purely by exchange id (A2UI, `surface_response`) has none to
      // offer, and why omitting the caller's obligation does not relax what `open()` recorded.
      const toolMismatch = spec.toolId !== undefined && entry.binding.toolId !== spec.toolId;
      if (toolMismatch || entry.binding.principalId !== spec.principalId) {
        // Deliberately leaves the exchange open. A mismatched delivery is evidence about the
        // DELIVERY, not about the exchange — consuming it would let a wrong-binding post disrupt a
        // conversation the right human is still having.
        return { ok: false, reason: "binding-mismatch" };
      }

      entry.accept(spec.params);
      return { ok: true };
    },

    size() {
      return openExchanges.size;
    },
  };
}

/**
 * Cross-domain machinery a surface-raising tool needs that is not a domain dependency at all.
 *
 * Kept separate from `tool-registrations.ts`'s `AssistantToolRegistryDeps` on purpose: that bag is
 * "the same dependencies the admin HTTP routes are built from", which is what makes a tool call and
 * the equivalent human click reach identical domain code. An exchange store is not part of that
 * equivalence — it belongs to the assistant's transport, and only tools that talk to a human mid-call
 * ever touch it. Declared in this module rather than alongside the registration wiring so a tool can
 * name it without importing the file that imports the tool.
 */
export interface AssistantSurfaceDeps {
  /**
   * Backs the held-open-call return path (ADR-055 Decision 1). The instance passed here MUST be the
   * same one `mcp-ui-tool-calls-route.ts` was mounted with — an exchange opened against one store and
   * delivered to another never receives anything, and the caller only finds out when the deadline
   * fires minutes later. `agent-daemon-server.ts` creates one and passes it to both.
   */
  surfaceExchanges: SurfaceExchangeStore;
}
