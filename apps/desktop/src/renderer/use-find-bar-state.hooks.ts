import { useCallback, useReducer, useRef } from 'react';
import { createFindQueryScheduler } from '@jini-ai/ui/core';
import { findBarReducer, initialFindBarState } from './find-bar-state.js';
import { resolveFindTarget, type FindableGuest, type FindBridge } from './find-target.js';
import type { liveFindClock } from './find-focus-clock.js';
import type { useFindInPage } from './use-find-in-page.hooks.js';

export function useFindBarState(
  { clock, activeGuestId, bridge }:
    Pick<Parameters<typeof useFindInPage>[0], "activeGuestId"> &
    { clock: typeof liveFindClock; bridge: FindBridge | undefined }
) {
  const [state, dispatch] = useReducer(findBarReducer, initialFindBarState);
  // A ref, not state: registering a guest must never itself trigger a render — every mounted tab
  // calls it on every commit (see `useComposedGuestRef`), and the map's CONTENTS are only ever read
  // at the moment a search actually runs, never rendered.
  const guests = useRef(new Map<string, FindableGuest>()).current;
  const inputElement = useRef<HTMLInputElement | null>(null);
  // When the last find was ISSUED (not when a result was reported) — see `issueFind` and
  // {@link shouldReclaimFindFocus}. A ref, not state: recording it must never itself trigger a
  // render.
  const lastFindAt = useRef<number | null>(null);
  // The pending deferred reclaim (see the blur listener below), so `close`/unmount can cancel one
  // scheduled for a bar that is no longer open by the time it would run.
  const reclaimTimer = useRef<unknown>(null);
  // Raised while {@link restoreFindInputFocus} blurs the input itself, so the blur listener below
  // does not mistake that for a Chromium theft — see that function's doc.
  const restoringFocus = useRef(false);
  // Between ISSUING a find and its first reported result — see {@link shouldKeepReclaimingFindFocus}.
  const awaitingReport = useRef(false);
  // An IME composition is in progress in the find input — reclaiming would end it.
  const composing = useRef(false);
  const reclaimFrame = useRef<number | null>(null);
  const queryScheduler = useRef(createFindQueryScheduler({}, { clock })).current;

  const registerGuest = useCallback(
    (projectId: string, element: FindableGuest | null) => {
      if (element) guests.set(projectId, element);
      else guests.delete(projectId);
    },
    [guests],
  );

  const target = resolveFindTarget({ activeGuestId, guests, bridge });
  return {
    state, dispatch, guests, inputElement, lastFindAt, reclaimTimer, restoringFocus, awaitingReport, composing, reclaimFrame, queryScheduler, registerGuest,
    target,
  };
}
