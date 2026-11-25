import { createAgUiPauseStore } from "@jini-ai/chat/core/ag-ui";
import type { SchedulerPort } from "@jini-ai/daemon/scheduler";

/**
 * @file The admin AG-UI approval handoff (P6-T2.T step 4): a bounded, process-local table of
 * approval cards whose HTTP segment already ended with an AG-UI interrupt, and the one way back
 * into each of them. The admin mirror of `site/visitor-ag-ui-resume.ts`.
 *
 * The daemon owns the live exchange: the held tool call keeps waiting in the daemon's surface
 * exchange store, and the only thing this table may do with it is answer it once through the
 * daemon's existing guarded answer (`mcp-ui/tool-calls`, bound to the run principal). The resume
 * body supplies a decision and an address, never the tool, the exchange or the owner — those were
 * recorded at park from the server-side daemon stream and the authenticated session.
 */

/** The one refusal for missing, expired, foreign, mismatched, replayed and ownerless answers, so a
 *  probe learns nothing about whose approval an id belongs to. */
export const ADMIN_APPROVAL_EXPIRED = "This request expired. Ask again.";

/** An identified approval card read from the daemon stream. */
export interface AdminApprovalCard {
  readonly exchangeId: string;
  readonly toolId: string;
  readonly message: string;
  /** The exchange's own answer deadline, when the card states one. */
  readonly expiresAtMs?: number;
}

/** The daemon's existing guarded answer for one exchange, as the given principal. True when the
 *  daemon accepted the answer (the held call received it). */
export type AnswerAdminExchange = (
  required: { owner: string; toolId: string; exchangeId: string; allow: boolean }, optional?: Record<string, never>,
) => Promise<boolean>;

/** Where a resumed segment continues: the original thread, the interrupted AG-UI run, the daemon
 *  run behind it and the stream cursor at the interrupt (so nothing already shown repeats). */
export interface AdminApprovalCheckpoint {
  readonly owner: string;
  readonly threadId: string;
  readonly parentRunId: string;
  readonly daemonRunId: string;
  readonly cursor?: string;
}

interface Parked extends AdminApprovalCheckpoint { readonly card: AdminApprovalCard; readonly cancelTimer: () => void }

const MAX_PARKED = 50;
const MAX_PARKED_PER_OWNER = 4;
/** Upper bound when a card states no deadline; the daemon exchange's own idle deadline still
 *  applies, and a later answer simply finds it closed. */
const MAX_WAIT_MS = 15 * 60_000;

/**
 * One host-created coordinator. Resume, expiry and Stop all leave through the same synchronous
 * claim/removal of the pause-store record, so exactly one of them owns a parked approval.
 * @complexity O(n) park (cap sweep over at most 50 records); O(1) peek/redeem; O(n) Stop.
 */
export function createAdminAgUiApprovals(
  { nowMs, scheduler, newInterruptId, answerExchange }: {
    nowMs: () => number; scheduler: SchedulerPort; newInterruptId: () => string; answerExchange: AnswerAdminExchange;
  },
  _optional = {},
) {
  const store = createAgUiPauseStore({ caps: { global: MAX_PARKED, perScope: MAX_PARKED_PER_OWNER }, nowMs });
  const parked = new Map<string, Parked>();

  const release = ({ interruptId }: { interruptId: string }): Parked | undefined => {
    const entry = parked.get(interruptId);
    parked.delete(interruptId);
    entry?.cancelTimer();
    return entry;
  };

  return {
    /** Park BEFORE the interrupt is written, so an answer can never arrive for an unknown pause.
     *  Returns the interrupt id to emit, or undefined when the caps refuse (the card then flows as
     *  an ordinary card, still answerable in place). */
    parkAdminApproval(
      { owner, threadId, runId, daemonRunId, card, cursor }: {
        owner: string; threadId: string; runId: string; daemonRunId: string; card: AdminApprovalCard; cursor?: string;
      },
      _optional = {},
    ): string | undefined {
      const interruptId = newInterruptId();
      const abandonAtMs = Math.min(card.expiresAtMs ?? Number.POSITIVE_INFINITY, nowMs() + MAX_WAIT_MS);
      if (!store.park({ owner, threadId, runId, interruptId, state: null, scopeKey: owner, abandonAtMs })) return undefined;
      // Expiry only forgets the record: the daemon exchange keeps its own deadline and denies itself.
      const cancelTimer = scheduler.schedule({ delayMs: Math.max(0, abandonAtMs - nowMs()), callback: () => {
        store.remove({ interruptId }); release({ interruptId });
      } });
      parked.set(interruptId, { owner, threadId, parentRunId: runId, daemonRunId, card, ...(cursor ? { cursor } : {}), cancelTimer });
      return interruptId;
    },

    /** Read-only lookup for validation before anything is consumed. */
    peekAdminApproval({ interruptId }: { interruptId: string }, _optional = {}): AdminApprovalCheckpoint | undefined {
      const entry = parked.get(interruptId);
      return entry ? { owner: entry.owner, threadId: entry.threadId, parentRunId: entry.parentRunId, daemonRunId: entry.daemonRunId,
        ...(entry.cursor ? { cursor: entry.cursor } : {}) } : undefined;
    },

    /**
     * The server-neutral redeem port: claim synchronously (owner, thread and parent run must match
     * the record, else nothing is consumed), then answer the daemon's exchange exactly once.
     */
    async redeemAgUiApproval(
      { owner, threadId, parentRunId, interruptId, decision }: {
        owner: string; threadId: string; parentRunId: string; interruptId: string; decision: "allow" | "deny";
      },
      _optional = {},
    ): Promise<"resumed" | "expired"> {
      if (!store.claim({ owner, threadId, runId: parentRunId, interruptId })) return "expired";
      const entry = release({ interruptId });
      if (!entry) return "expired";
      const answered = await answerExchange({ owner: entry.owner, toolId: entry.card.toolId, exchangeId: entry.card.exchangeId, allow: decision === "allow" });
      return answered ? "resumed" : "expired";
    },

    /** The owned Stop of a daemon run settles its parked approvals: after this, no resume can claim
     *  them. The daemon's own cancel closes the held exchange; nothing is answered here. */
    settleAdminApprovalsOnStop({ owner, daemonRunId }: { owner: string; daemonRunId: string }, _optional = {}): number {
      let settled = 0;
      for (const [interruptId, entry] of [...parked]) {
        if (entry.daemonRunId !== daemonRunId || entry.owner !== owner) continue;
        store.remove({ interruptId });
        release({ interruptId });
        settled++;
      }
      return settled;
    },

    /** Process shutdown: every park is forgotten and its expiry timer cleared, through the same
     *  removal as expiry and Stop, so a late resume is refused. Nothing is answered: the daemon
     *  shuts down with the host and its held exchanges close with it. */
    shutdownAdminApprovals(_required: Record<string, never> = {}, _optional = {}): void {
      for (const interruptId of [...parked.keys()]) {
        store.remove({ interruptId });
        release({ interruptId });
      }
    },
  };
}

export type AdminAgUiApprovals = ReturnType<typeof createAdminAgUiApprovals>;
