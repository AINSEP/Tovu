import { useCallback, useEffect, useRef, useState } from "react";

/**
 * @file Standing-draft autosave (2026-09-06 dispatch, owner's own words: "even if they haven't
 * saved it, temp save it whenever they make a draft... it's just saving to... the database. It
 * should be a standing draft anytime something is updated"). Persists to the server
 * (`server/inbound/admin-http/routes/posts/autosave.ts`, `posts.autosave_json`) so a reload or an
 * accidental exit never loses unsaved edits — browser storage alone was rejected.
 *
 * Feature-agnostic on purpose, matching `use-dirty-guard.hooks.ts`'s own precedent: nothing here
 * imports `features/posts` or `features/pages`, so `PostEditorPort`/`PageEditorPort` each satisfy
 * {@link StandingDraftAutosavePort} structurally (same three method shapes, declared independently
 * per that DI-seam convention) with zero cross-feature import. This is the mechanism that lets one
 * implementation serve both editors with no branch between them.
 *
 * Two things this hook does NOT do, deliberately:
 * - Never auto-applies a recovered draft. {@link StandingDraftAutosaveController.recoverableDraft}
 *   is exposed for the caller to render an explicit "restore or discard" banner; silently splicing
 *   in a recovered draft is dangerous with two tabs or two operators open on the same entry.
 * - Never compares `recoverableDraft.baseVersion` against the entry's current version itself — the
 *   caller (which already has the freshly-loaded record) decides whether to label a recovered draft
 *   "outdated" because a real save happened since it was captured.
 */

/** The four fields a standing draft carries — see `PostAutosaveSnapshot`'s own server-side doc for
 *  why `status`/`title`-as-its-own-field are deliberately absent. */
export type StandingDraftAutosaveInput =
  | { bodyFormat: "doc"; bodyJson: Record<string, unknown>; slug: string; baseVersion: number }
  | { bodyFormat: "html"; bodyHtml: string; slug: string; baseVersion: number };

export interface StandingDraftAutosaveSnapshot {
  bodyFormat: "doc" | "html";
  bodyJson?: Record<string, unknown>;
  bodyHtml?: string;
  slug: string;
  baseVersion: number;
  savedAt: string;
  savedByPrincipalId: string;
}

/** What this hook needs from the outside world — see this file's header for why it is declared
 *  here rather than imported from either feature's own port. */
export interface StandingDraftAutosavePort {
  putAutosave(id: string, draft: StandingDraftAutosaveInput): Promise<{ applied: boolean }>;
  getAutosave(id: string): Promise<{ autosave: StandingDraftAutosaveSnapshot | null }>;
  discardAutosave(id: string): Promise<{ ok: boolean }>;
}

export interface StandingDraftAutosaveController {
  /** Non-null once the mount-time recovery check resolves and finds a parked draft. Stays exactly
   *  as read until {@link dismissRecoverable}/{@link clearStandingDraft} clears it — never
   *  overwritten by a later `scheduleAutosave` tick from THIS session, since a session that is
   *  actively autosaving has, by definition, already accounted for whatever it found on mount. */
  recoverableDraft: StandingDraftAutosaveSnapshot | null;
  /** Clears `recoverableDraft` locally only (no server call) — the "Discard" affordance calls
   *  {@link clearStandingDraft} instead, which also tells the server; this is for a caller that
   *  wants to stop showing the banner without discarding anything (e.g. "Restore" applied it into
   *  the editor, and a real Save moments later will clear the server-side draft on its own). */
  dismissRecoverable: () => void;
  /** Call on every content change the caller wants protected — cheap, debounced internally
   *  (idle 3s / 15s hard ceiling while continuously typing), safe to call on every keystroke. */
  scheduleAutosave: (draft: StandingDraftAutosaveInput) => void;
  /**
   * Clears the server-side standing draft — call after a real Save/Publish succeeds, or when the
   * operator explicitly discards a recovered draft. Cancels any pending (not yet fired) debounce
   * timer FIRST, then enqueues the discard onto the same serial request chain every
   * `scheduleAutosave` tick uses, so a still-in-flight (already fired) autosave write is guaranteed
   * to reach the server before this discard does, and no new one can be queued after it — the
   * ordering guarantee that keeps a late autosave from resurrecting content a real save (or an
   * explicit discard) just superseded.
   */
  clearStandingDraft: () => Promise<void>;
}

/** Idle debounce: fires this long after the LAST `scheduleAutosave` call with no further calls. */
const IDLE_DEBOUNCE_MS = 3000;
/** Hard ceiling while continuously typing: once this much time has passed since the first
 *  unflushed edit, the next tick fires immediately instead of resetting the idle window again. */
const MAX_WAIT_MS = 15000;

export function useStandingDraftAutosave(deps: {
  port: StandingDraftAutosavePort;
  /** `null` before the entry has loaded (or for a not-yet-created entry) — every operation no-ops. */
  entryId: string | null;
  /** Gate for "this editor is in a state where autosave should run at all" (e.g. not while a save
   *  or delete is already in flight). Recovery-check and scheduling both respect it. */
  enabled: boolean;
}): StandingDraftAutosaveController {
  const { port, entryId, enabled } = deps;
  const [recoverableDraft, setRecoverableDraft] = useState<StandingDraftAutosaveSnapshot | null>(null);
  // Every network op (each autosave PUT, and the eventual discard) is appended here, never fired
  // standalone — this IS the ordering guarantee `clearStandingDraft`'s own doc describes. Caught
  // internally (see `enqueue`) so one failed request can never permanently wedge the chain.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPendingAtRef = useRef<number | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    firstPendingAtRef.current = null;
  }, []);

  // Mount-time (and entry-change) recovery check — one read, never repeated while this entryId
  // stays mounted. A stale in-flight response from a PREVIOUS entryId is dropped via `cancelled`.
  useEffect(() => {
    setRecoverableDraft(null);
    if (!enabled || !entryId) return;
    let cancelled = false;
    port
      .getAutosave(entryId)
      .then((result) => {
        if (!cancelled) setRecoverableDraft(result.autosave);
      })
      .catch(() => {
        // Best-effort: a failed recovery check just means no banner shows this session, not a
        // reason to break editor load.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, entryId, port]);

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  const enqueue = useCallback(
    (op: () => Promise<void>): Promise<void> => {
      chainRef.current = chainRef.current.then(op).catch((err: unknown) => {
        // eslint-disable-next-line no-console -- best-effort background persistence; surfaced to
        // the console rather than the operator, who has nothing actionable to do about one dropped
        // autosave tick, and rather than thrown, which would wedge every later tick on this chain.
        console.error("standing-draft autosave: request failed", err);
      });
      return chainRef.current;
    },
    []
  );

  const scheduleAutosave = useCallback(
    (draft: StandingDraftAutosaveInput) => {
      if (!enabled || !entryId) return;
      const now = Date.now();
      if (firstPendingAtRef.current === null) firstPendingAtRef.current = now;
      const waitedSoFar = now - firstPendingAtRef.current;
      // Clamped, not a plain "already past the ceiling?" check: without the clamp, a call arriving
      // just before the ceiling would still schedule a FULL fresh `IDLE_DEBOUNCE_MS`, pushing the
      // actual fire time past `MAX_WAIT_MS` under continuous typing (verified by the ceiling test —
      // an unclamped version never fires within the window it claims to bound).
      const delay = Math.max(0, Math.min(IDLE_DEBOUNCE_MS, MAX_WAIT_MS - waitedSoFar));

      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        firstPendingAtRef.current = null;
        enqueue(async () => {
          await port.putAutosave(entryId, draft);
        });
      }, delay);
    },
    [enabled, entryId, enqueue, port]
  );

  const clearStandingDraft = useCallback(async () => {
    clearPendingTimer();
    setRecoverableDraft(null);
    if (!entryId) return;
    await enqueue(async () => {
      await port.discardAutosave(entryId);
    });
  }, [clearPendingTimer, enqueue, entryId, port]);

  const dismissRecoverable = useCallback(() => setRecoverableDraft(null), []);

  return { recoverableDraft, dismissRecoverable, scheduleAutosave, clearStandingDraft };
}
