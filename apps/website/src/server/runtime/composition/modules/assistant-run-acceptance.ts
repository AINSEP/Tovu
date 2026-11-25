import { randomUUID } from "node:crypto";
import type { DurableRun, DurableRunStore } from "@jini-ai/chat/server/durable-runs";
import type { RoutineRunMarker } from "@tovu/contracts/routines";
import { createRunAcceptance } from "#src/assistant/durable-runs/accept";
import type { RouteDeps } from "#src/server/routes/types";
import type { ensureAssistantDaemonReady } from "../../lifecycle/daemon-supervisor.js";
import { createHttpRunDaemonClient } from "./run-daemon-http-client.js";
import { assistantRunFinalizerFor } from "./run-finalizer/shared.js";

/**
 * @file The owner-chat acceptance seam: the ONE way a run (browser send or routine fire) is durably
 * accepted, launched on the assistant daemon and attached to the finalizer.
 *
 * Why it lives apart from the HTTP route: the route owns parsing, auth and 201/404; routines need the
 * same acceptance (stub committed BEFORE launch, assistant message id as the idempotency identity)
 * without an HTTP request. Routine code never calls an executor directly.
 *
 * Why `routine` is deleted and re-added: the marker tells admission and tool access that a turn is an
 * unattended routine run. It is trusted ONLY when the host passes it in the optional field; any
 * `context.routine` a browser sent is dropped first, so a person cannot mark their chat as a routine
 * (and so cannot make generic recovery skip it or tool access treat it as unattended).
 */

export type AcceptOwnerChatRunRequired = Readonly<{
  principalId: string; workspaceId: string; conversationId: string; messageId: string;
  /** The decoded run-start envelope (prompt, folders, model...). `routine` here is never trusted. */
  context: Record<string, unknown>;
}>;
export type SettlementStatus = "completed" | "failed" | "canceled";
export type OwnerChatSettlement = Readonly<{ status: SettlementStatus; text: string }>;
type OwnerScope = Readonly<{ principalId: string; workspaceId: string; messageId: string }>;

export interface OwnerChatAcceptancePorts {
  store: DurableRunStore;
  now: () => number;
  mintRunId: () => string;
  launch: Parameters<typeof createRunAcceptance>[0]["launch"];
  attach: (run: DurableRun, optional: Record<string, never>) => void;
  /** Re-reads and settles one run through the finalizer (used after a cancel). */
  recover: (required: { messageId: string }, optional?: Record<string, never>) => Promise<unknown>;
  onAccepted?: (required: { run: DurableRun }, optional: Record<string, never>) => void;
  /** Injected so settlement backoff is testable without real time; aborts early on `signal`. */
  sleep: (required: { ms: number; signal?: AbortSignal }, optional?: Record<string, never>) => Promise<void>;
}

/** The browser's run-start envelope with every server-owned field removed (recovery choices and the routine marker). */
export function sanitizeBrowserRunContext({ decoded }: { decoded: Record<string, unknown> }, _optional = {}): Record<string, unknown> {
  // Recovery session choices are server decisions, never client-controlled launch fields.
  const { recoveryMode: _mode, recoverySessionId: _session, routine: _routine, ...rest } = decoded;
  return rest;
}

const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 5_000;
const TERMINAL: Readonly<Record<string, SettlementStatus>> = { succeeded: "completed", failed: "failed", canceled: "canceled" };

type SavedMessage = { runStatus?: unknown; content?: unknown; events?: unknown };

/** One owner-scoped read: the durable poll, or a scope-checked head when the store has no poll. */
async function readOwned(store: DurableRunStore, scope: OwnerScope, cursor: string | undefined): Promise<{ cursor?: string; message?: SavedMessage } | null> {
  if (store.poll) {
    const result = await store.poll({ messageId: scope.messageId, principalId: scope.principalId, workspaceId: scope.workspaceId }, cursor === undefined ? {} : { cursor });
    if (!result) return null;
    return { cursor: result.cursor, ...(result.messageJson === undefined ? {} : { message: JSON.parse(result.messageJson) as SavedMessage }) };
  }
  const head = await (store.head ?? store.load)({ messageId: scope.messageId }, {});
  if (!head || head.principalId !== scope.principalId || head.workspaceId !== scope.workspaceId) return null;
  return { message: head.message as SavedMessage };
}

/** Cancels this owner's run for `messageId` (by the saved assistant message, scoped to the current attempt),
 * or returns false when it is not theirs / not accepted. Shared by `cancelChatRun` and boot admission. */
export async function cancelOwnedRun(
  ports: { store: DurableRunStore; recover: OwnerChatAcceptancePorts["recover"] },
  required: OwnerScope & { conversationId: string }, optional: { reason?: string } = {},
): Promise<boolean> {
  const head = await (ports.store.head ?? ports.store.load)({ messageId: required.messageId }, {});
  if (!head || head.principalId !== required.principalId || head.workspaceId !== required.workspaceId) return false;
  await ports.store.cancel({ runId: head.runId, reason: optional.reason ?? "user-stop" }, {});
  await ports.recover({ messageId: required.messageId }, {});
  return true;
}

/** Builds the three owner-chat operations over injected ports. */
export function createOwnerChatAcceptance(ports: OwnerChatAcceptancePorts, _optional = {}) {
  const acceptance = createRunAcceptance({ store: ports.store, now: ports.now, mintRunId: ports.mintRunId, launch: ports.launch,
    attach: (run) => ports.attach(run, {}), ...(ports.onAccepted ? { onAccepted: ports.onAccepted } : {}) }, {});

  async function acceptOwnerChatRun(required: AcceptOwnerChatRunRequired, optional: { agentId?: string; routine?: RoutineRunMarker } = {}): Promise<DurableRun | null> {
    const context = sanitizeBrowserRunContext({ decoded: required.context }, {});
    if (optional.routine) context.routine = { routineId: optional.routine.routineId, runId: optional.routine.runId, catchUp: optional.routine.catchUp, slotAt: optional.routine.slotAt };
    return acceptance.accept({ principalId: required.principalId, workspaceId: required.workspaceId,
      conversationId: required.conversationId, messageId: required.messageId,
      request: { ...(optional.agentId ? { agentId: optional.agentId } : {}), contextRef: JSON.stringify({ ...context, principalId: required.principalId }) } }, {});
  }

  /** Waits for the owned run to end. One read per tick feeds both the verdict and the event observer. */
  async function watchSettlement(required: OwnerScope, optional: { cursor?: string; onEvents?: (events: readonly unknown[]) => void; signal?: AbortSignal } = {}): Promise<OwnerChatSettlement> {
    let cursor = optional.cursor;
    let delay = BACKOFF_START_MS;
    for (;;) {
      if (optional.signal?.aborted) return { status: "canceled", text: "" };
      const read = await readOwned(ports.store, required, cursor);
      if (!read) return { status: "failed", text: "" };
      if (read.message) {
        cursor = read.cursor ?? cursor;
        delay = BACKOFF_START_MS;
        optional.onEvents?.(Array.isArray(read.message.events) ? read.message.events : []);
        const status = typeof read.message.runStatus === "string" ? TERMINAL[read.message.runStatus] : undefined;
        if (status) return { status, text: typeof read.message.content === "string" ? read.message.content : "" };
      }
      await ports.sleep({ ms: delay, ...(optional.signal ? { signal: optional.signal } : {}) }, {});
      delay = Math.min(delay * 2, BACKOFF_MAX_MS);
    }
  }

  const cancelChatRun = (required: OwnerScope & { conversationId: string }, optional: { reason?: string } = {}) =>
    cancelOwnedRun({ store: ports.store, recover: ports.recover }, required, optional);

  return { acceptOwnerChatRun, watchSettlement, cancelChatRun };
}

export type OwnerChatAcceptance = ReturnType<typeof createOwnerChatAcceptance>;
export type AssistantAcceptanceRouteDeps = RouteDeps & {
  assistantDaemonDemand?: { ensureReady: typeof ensureAssistantDaemonReady; isReady: () => boolean };
};

/** Assembles the real acceptance over the site's ledger; undefined when the ledger has no durable store. */
export function ownerChatAcceptanceFor({ deps }: { deps: AssistantAcceptanceRouteDeps }, optional: { sleep?: OwnerChatAcceptancePorts["sleep"] } = {}): OwnerChatAcceptance | undefined {
  const store = deps.chatRunLedger.durable;
  if (!store) return undefined;
  const finalizer = assistantRunFinalizerFor({ ledger: deps.chatRunLedger, tracker: deps.tracker, observability: deps.observability }, {});
  const client = createHttpRunDaemonClient({ observability: deps.observability }, { ensureReady: deps.assistantDaemonDemand?.ensureReady });
  return createOwnerChatAcceptance({
    store, now: Date.now, mintRunId: randomUUID,
    // The principal comes from the accepted run itself, so one acceptance serves any owner (browser send or routine fire).
    onAccepted: ({ run }) => deps.tracker.capture({ name: "assistant_run_started", userId: run.principalId ?? "" }, { properties: { chatSurface: "admin", logicalRunId: run.messageId, eventId: `assistant-start:${run.messageId}` } }),
    launch: (required, launchOptional) => {
      if (!client.launch) throw new Error("assistant daemon has no launch operation");
      return client.launch(required, launchOptional);
    },
    attach: (run) => { if (run.principalId !== null) finalizer.watch({ principalId: run.principalId, conversationId: run.conversationId, message: run.message }); },
    recover: ({ messageId }) => finalizer.recover({ messageId, trigger: "browser" }, {}),
    sleep: optional.sleep ?? (({ ms, signal }) => new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    })),
  }, {});
}
