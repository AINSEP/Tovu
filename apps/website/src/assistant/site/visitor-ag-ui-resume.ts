import type { FrontendSessionOwner } from "@jini-ai/core/contracts/site/daemon";
import { createAgUiPauseStore, readConfirmationResume } from "@jini-ai/chat/core/ag-ui";
import type { SchedulerPort } from "@jini-ai/daemon/scheduler";

/**
 * @file The AG-UI visitor approval handoff (P6-T2.T): a bounded, process-local table of approvals
 * whose HTTP segment already ended with an interrupt, and the one way back into each of them.
 *
 * The pause is a one-use right to answer an already-running call. It never starts, recreates or
 * re-describes that call: the resume body supplies only a decision, and the model result, tool
 * name, arguments and approval owner all stay with the held execution. The challenge (interrupt
 * id) addresses a decision but cannot authenticate it; authority is the signed guest/tab owner the
 * route resolved, compared with the owner bound at park.
 */

/** The one refusal for missing, expired, foreign, mismatched, replayed and ownerless answers, so a
 *  probe learns nothing about whose approval an id belongs to. */
export const VISITOR_APPROVAL_EXPIRED = "This request expired. Ask again.";

/** How a parked approval ended without being resumed. */
export type VisitorApprovalEnd = "expired" | "stopped" | "shutdown";

/** Typed handle to the existing execution; never serialized, never derived from a request body. */
export interface HeldVisitorApproval<Segment> {
  /** Quota key (the client address). A cap input, not authority. */
  readonly quotaKey: string;
  /** Moves the still-running provider turn onto the resume response's segment. */
  attach(required: { segment: Segment }, optional?: Record<string, never>): void;
  /** Ends the held execution (abort + release) when nobody will ever answer it. */
  cleanup(required: { reason: VisitorApprovalEnd }, optional?: Record<string, never>): void;
}

/** The existing bound confirmation op: settles the exact challenge for the exact owner, once. */
export type ConfirmVisitorApproval = (
  required: { challengeId: string; allow: boolean; owner: FrontendSessionOwner }, optional?: Record<string, never>,
) => Promise<boolean>;

interface Parked<Segment> {
  readonly owner: FrontendSessionOwner;
  readonly threadId: string;
  readonly runId: string;
  readonly held: HeldVisitorApproval<Segment>;
  readonly cancelTimer: () => void;
}

const MAX_HELD = 20;
const MAX_HELD_PER_QUOTA_KEY = 2;
const MAX_WIRE_ID_CHARS = 128;

/** Unambiguous key for the pause store's string owner comparison (no separator collisions). */
function ownerKey({ owner }: { owner: FrontendSessionOwner }): string {
  return JSON.stringify([owner.workspaceId, owner.principalId, owner.tabId]);
}

/** Pulls only the addressing fields out of an untrusted body; the decision is read later by Jini. */
function addressedResume({ input }: { input: unknown }): { interruptId: string; runId: string; cancelled: boolean } | undefined {
  if (!input || typeof input !== "object") return undefined;
  const { resume, runId } = input as { resume?: unknown; runId?: unknown };
  if (!Array.isArray(resume) || resume.length !== 1) return undefined;
  const entry = resume[0] as { interruptId?: unknown; status?: unknown } | null;
  const interruptId = entry?.interruptId;
  const bounded = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= MAX_WIRE_ID_CHARS;
  return bounded(interruptId) && bounded(runId) ? { interruptId, runId, cancelled: entry?.status === "cancelled" } : undefined;
}

/**
 * One host-created coordinator. Resume, expiry, Stop and shutdown all leave through the same
 * synchronous claim of the pause-store record, so exactly one of them owns a parked call.
 * @complexity O(n) park (cap sweep over at most 20 records); O(1) resume/abandon.
 */
export function createVisitorAgUiResume<Segment>(
  { nowMs, scheduler, confirm, reportError }: {
    nowMs: () => number; scheduler: SchedulerPort; confirm: ConfirmVisitorApproval;
    reportError: (required: { error: unknown }, optional?: Record<string, never>) => void;
  },
  _optional = {},
) {
  const store = createAgUiPauseStore({ caps: { global: MAX_HELD, perScope: MAX_HELD_PER_QUOTA_KEY }, nowMs });
  const parked = new Map<string, Parked<Segment>>();

  /** The shared exit: forget the record and its timer. Callers decide what the held call gets. */
  const release = ({ interruptId }: { interruptId: string }): Parked<Segment> | undefined => {
    const entry = parked.get(interruptId);
    parked.delete(interruptId);
    entry?.cancelTimer();
    return entry;
  };

  /** Deny the exact challenge once and end the held call: nobody will ever answer it now. */
  const denyAndEnd = ({ interruptId, entry, reason }: { interruptId: string; entry: Parked<Segment>; reason: VisitorApprovalEnd }): void => {
    void confirm({ challengeId: interruptId, allow: false, owner: entry.owner }).catch((error: unknown) => { reportError({ error }); });
    entry.held.cleanup({ reason });
  };

  const abandonVisitorApproval = ({ interruptId, reason }: { interruptId: string; reason: VisitorApprovalEnd }, _optional = {}): void => {
    // Stop and Allow race on this one entry; whoever loses it does nothing at all. A resume releases
    // the entry in the same synchronous step as its store claim, so a present entry means nobody
    // claimed it — even when the store already dropped the record on a late claim attempt.
    store.remove({ interruptId });
    const entry = release({ interruptId });
    if (entry) denyAndEnd({ interruptId, entry, reason });
  };

  /**
   * Every pre-claim check of a resume, in order, with no side effects and no await: the addressed
   * pause, its parked entry and the readable answer, or undefined when any check refuses.
   * @complexity O(1).
   */
  const validateResume = ({ input, owner }: { input: unknown; owner: FrontendSessionOwner | null }, _optional = {}) => {
    // No authenticated owner means no claim attempt at all — not an ownerless confirmation.
    if (!owner) return undefined;
    const addressed = addressedResume({ input });
    const entry = addressed ? parked.get(addressed.interruptId) : undefined;
    if (!addressed || !entry || addressed.runId === entry.runId) return undefined;
    const answer = readConfirmationResume({ input, threadId: entry.threadId, runId: entry.runId, interruptId: addressed.interruptId });
    // `owner` is returned narrowed, so the claim below keys on the same authenticated owner.
    return answer ? { owner, addressed, entry, answer } : undefined;
  };

  return {
    /** Park BEFORE the interrupt is written, so an answer can never arrive for an unknown pause. */
    parkVisitorApproval(
      { owner, threadId, runId, interruptId, held, abandonAtMs }: {
        owner: FrontendSessionOwner; threadId: string; runId: string; interruptId: string; held: HeldVisitorApproval<Segment>; abandonAtMs: number;
      },
      _optional = {},
    ): boolean {
      const accepted = store.park({ owner: ownerKey({ owner }), threadId, runId, interruptId, state: null, scopeKey: held.quotaKey, abandonAtMs });
      if (!accepted) return false;
      const cancelTimer = scheduler.schedule({ delayMs: Math.max(0, abandonAtMs - nowMs()), callback: () => { abandonVisitorApproval({ interruptId, reason: "expired" }); } });
      parked.set(interruptId, { owner, threadId, runId, held, cancelTimer });
      return true;
    },

    /**
     * Validate, claim synchronously, attach the replacement writer, then settle the existing
     * exchange. Invalid answers cannot consume the legitimate owner's claim: an ownerless request,
     * a foreign owner, a mismatched thread/parent run/challenge or an unreadable decision all
     * return before `store.claim`.
     */
    async resumeVisitorApproval(
      { input, owner, attachResponse }: {
        input: unknown; owner: FrontendSessionOwner | null;
        attachResponse: (required: { threadId: string; parentRunId: string; runId: string }) => Segment;
      },
      _optional = {},
    ): Promise<"resumed" | "stopped" | "expired"> {
      const valid = validateResume({ input, owner });
      if (!valid) return "expired";
      const { owner: claimant, addressed, entry, answer } = valid;
      // Claimed synchronously right after validation, before any await, so no second answer can
      // interleave between the checks and the claim.
      const claimed = store.claim({ owner: ownerKey({ owner: claimant }), threadId: entry.threadId, runId: entry.runId, interruptId: addressed.interruptId });
      if (!claimed) return "expired";
      release({ interruptId: addressed.interruptId });
      // Stop is the owner's answer: deny, never a silent leak until expiry. It is claimed like any
      // answer (same owner, thread and parent run), but it ends the held call instead of continuing
      // it, so no writer is attached and the model gets no turn to act on the refusal.
      if (addressed.cancelled) { denyAndEnd({ interruptId: addressed.interruptId, entry, reason: "stopped" }); return "stopped"; }
      entry.held.attach({ segment: attachResponse({ threadId: entry.threadId, parentRunId: entry.runId, runId: addressed.runId }) });
      const settled = await confirm({ challengeId: addressed.interruptId, allow: answer.decision === "allow", owner: entry.owner });
      // The underlying exchange already ended (its own deadline): the attached segment would never
      // receive output, so the held call is cleaned up instead of left hanging.
      if (!settled) { entry.held.cleanup({ reason: "expired" }); return "expired"; }
      return "resumed";
    },

    abandonVisitorApproval,

    /** Process shutdown: every parked call is denied and cleaned up through the same exit. */
    shutdownVisitorApprovals(_required: Record<string, never> = {}, _optional = {}): void {
      for (const interruptId of [...parked.keys()]) abandonVisitorApproval({ interruptId, reason: "shutdown" });
    },
  };
}

export type VisitorAgUiResume<Segment> = ReturnType<typeof createVisitorAgUiResume<Segment>>;
