import { useCallback, useEffect, useRef, useState } from "react";

import { decideExternalEntryRefresh, type ExternalEntryRevision } from "@/lib/external-entry-refresh";

import { useSettlementGeneration } from "./use-settlement-generation.hooks";

/**
 * @file The stateful half of "did this row change out from under an open editor" (see
 * `lib/external-entry-refresh.ts`'s header for the pure decision rule this wraps). Each editor hook
 * (`use-page-editor.hooks.ts`, `use-post-editor.hooks.ts`) owns its own
 * `useContentRefreshSubscription(RESOURCE, controller.checkForExternalChange)` call — this hook does
 * NOT subscribe to the bus itself, so the `content-refresh-coverage.unit.test.ts` tripwire on each
 * editor file actually guards the wiring, rather than a shared internal subscription hiding it.
 *
 * Own `useSettlementGeneration` instance, deliberately separate from the editor's own save
 * settlement: a background re-read settling while a save is in flight must not make that save think
 * it was superseded (sharing one generation counter would leave `saving` stuck `true` after a
 * background check bumped the shared generation out from under it).
 */

export interface ExternalEntryRefreshInput<Row extends ExternalEntryRevision> {
  /** The row the editor treats as its saved basis; `null` before load. */
  loaded: Row | null;
  /** Re-reads the row by id through the editor's own injected port. */
  fetchLatest: (id: string) => Promise<Row>;
  /** Called when the fetch SETTLES — must reflect the working copy at that instant, not at the
   *  moment the fetch started. */
  isDirty: () => boolean;
  /** Called when the fetch SETTLES. */
  isSaving: () => boolean;
  /** Replace the working copy and the saved baseline with `row`. Used by both the silent apply
   *  path and Load latest. */
  applyLatest: (row: Row) => void;
  /** Load latest only — the editor's `autosave.clearStandingDraft`. */
  discardStandingDraft: () => Promise<void>;
  /** Load latest only, when the re-read fails. The editor sets its own (translated) error. */
  onLoadLatestFailed: () => void;
}

export interface ExternalEntryRefreshController {
  /** Non-null only while a newer saved version exists AND the editor has unsaved edits the
   *  operator hasn't resolved. Derived from `loaded`, so it clears itself once the editor's own
   *  basis catches up (a Save, Save anyway, or Load latest) without a separate effect. */
  pendingExternalVersion: number | null;
  /** Fire-and-forget background check, triggered by a content-refresh notification. Stable
   *  identity across renders. */
  checkForExternalChange: () => void;
  /** Discards the standing draft, then re-reads and applies the row, clearing any notice. */
  loadExternalChange: () => Promise<void>;
  /** Hides the notice and silences further ones until the loaded basis version moves. */
  dismissExternalChange: () => void;
}

export function useExternalEntryRefresh<Row extends ExternalEntryRevision>(
  input: ExternalEntryRefreshInput<Row>
): ExternalEntryRefreshController {
  // Read through a ref so `checkForExternalChange`/`loadExternalChange` keep a stable identity
  // regardless of how often the editor's closures (isDirty, applyLatest, ...) change identity.
  // Updated in an effect rather than during render: this hook's reads all happen in awaited
  // continuations, after the commit's effects have flushed, so there is no child-effect ordering
  // hazard the way there is for a port a child reads inside the SAME commit (see
  // `use-assistant-chats.hooks.ts`'s `portRef` doc for that distinct case).
  const latestRef = useRef(input);
  useEffect(() => {
    latestRef.current = input;
  });

  const generations = useSettlementGeneration();
  useEffect(() => {
    return () => {
      // A fetch that settles after unmount must not touch state on a dead hook instance.
      generations.next();
    };
  }, [generations]);

  const dismissedForBasisRef = useRef<number | null>(null);
  const [notifiedVersion, setNotifiedVersion] = useState<number | null>(null);

  const checkForExternalChange = useCallback(() => {
    const loaded = latestRef.current.loaded;
    if (loaded === null) return;
    const generation = generations.next();
    latestRef.current
      .fetchLatest(loaded.id)
      .then((fresh) => {
        if (!generations.isCurrent(generation)) return;
        const current = latestRef.current;
        const decision = decideExternalEntryRefresh({
          loaded: current.loaded,
          fresh,
          dirty: current.isDirty(),
          saving: current.isSaving(),
          dismissedForBasisVersion: dismissedForBasisRef.current,
        });
        if (decision === "apply") {
          setNotifiedVersion(null);
          current.applyLatest(fresh);
        } else if (decision === "notify") {
          setNotifiedVersion(fresh.version);
        } else {
          // "ignore" — nothing to do; see this file's header for why a failed/no-op check is silent.
        }
      }, () => {
        // Best-effort background check — a failed re-read leaves the editor showing the last row
        // it knows about; the operator sees nothing wrong that isn't already true.
      });
  }, [generations]);

  const loadExternalChange = useCallback(async () => {
    const loaded = latestRef.current.loaded;
    if (loaded === null || latestRef.current.isSaving()) return;
    const generation = generations.next();
    const fresh = await latestRef.current.fetchLatest(loaded.id).then(
      (row) => row,
      () => null
    );
    if (!generations.isCurrent(generation)) return;
    if (fresh === null) {
      latestRef.current.onLoadLatestFailed();
      return;
    }
    const current = latestRef.current;
    setNotifiedVersion(null);
    dismissedForBasisRef.current = null;
    // Discard first: its synchronous prefix cancels the pending autosave timer and lifts the
    // stale-basis gate before the working copy changes, so the autosave hook never schedules a
    // write against the basis this is about to replace.
    void current.discardStandingDraft();
    current.applyLatest(fresh);
  }, [generations]);

  const dismissExternalChange = useCallback(() => {
    dismissedForBasisRef.current = latestRef.current.loaded?.version ?? null;
    setNotifiedVersion(null);
  }, []);

  const pendingExternalVersion =
    notifiedVersion !== null && input.loaded !== null && notifiedVersion > input.loaded.version ? notifiedVersion : null;

  return { pendingExternalVersion, checkForExternalChange, loadExternalChange, dismissExternalChange };
}
