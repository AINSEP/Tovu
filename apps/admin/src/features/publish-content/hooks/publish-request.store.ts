import { useSyncExternalStore } from "react";

import type { PublishCriteria, PublishRequestResult, PublishScope } from "@tovu/publish-content-ui";

/**
 * @file `ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §4 S2 — the one
 * way anything OTHER than a person's own click opens the Publish dialog: `requestPublish(criteria)`.
 * A module-level store, not component state, because the three callers plan §0 lists (the Dashboard
 * button, the chat capability relayed through `App.hooks.tsx`, and the WebMCP projection landing in
 * S5) are none of them the component that renders the dialog — `App.tsx` is, at the top of the tree,
 * and it has no props route back down from any of the three.
 *
 * ## What this store is not
 *
 * It never calls a port, never plans, never publishes. `App.tsx` reads {@link usePublishRequest} to
 * decide whether to mount `PublishContentDialog` at all, and hands the request's own
 * {@link OpenPublishRequest.resolve} to that dialog's `onPlanned` prop — the dialog is what actually
 * plans (`use-publish-content-confirm.hooks.ts`), this store only remembers that a request is open and
 * carries the promise a caller is waiting on back to whoever asked.
 *
 * ## Why `resolve` travels ON the request, not as a fourth export
 *
 * `usePublishRequest()` already hands `App.tsx` everything a fresh mount of the dialog needs
 * (`requestId`, `criteria`); putting the matching `resolve` right there too means `App.tsx` wires
 * `onPlanned={request.resolve}` with no way to call the WRONG request's resolver — there is only ever
 * one in scope, and `key={request.requestId}` remounts the dialog fresh for a new one anyway.
 *
 * ## Why a still-open request is resolved, not dropped, when superseded
 *
 * A second `requestPublish` call before the first ever plans (a fast second chat message, say) would
 * otherwise leave the first caller's promise pending forever — the model that asked would hang until
 * whatever timeout wraps the call. Settling it with the same "opened, not yet planned" shape
 * {@link closePublishRequest} uses costs nothing and means every promise this module ever hands out
 * settles.
 */

/** One open ask to publish something, plus the resolver for the promise {@link requestPublish}
 *  returned when this request was made. */
export interface OpenPublishRequest {
  /** Distinguishes one ask from the next — `App.tsx`'s `key` for remounting `PublishContentDialog`
   *  fresh per request, so a stale instance can never call a newer request's `resolve`. */
  readonly requestId: string;
  readonly criteria: PublishCriteria;
  /** `plan-publish-sections-2026-09-25.md` §2 S2 — a section button's ask, e.g. `{entityTypes:
   *  ["page"]}`. `undefined` for the Dashboard's own "Publish all content" (plan §0 caller 1) and for
   *  chat/WebMCP's `criteria`-only asks, which do not narrow what gets staged, only what starts
   *  ticked — see `ui/contract.ts`'s `PublishScope` header for why the two are kept separate. */
  readonly scope?: PublishScope;
  /** Settles the promise {@link requestPublish} returned for THIS request. Wired as the dialog's
   *  `onPlanned` at the App level — see this file's header. Calling it does not close the dialog;
   *  {@link closePublishRequest} is the only thing that does that. */
  readonly resolve: (result: PublishRequestResult) => void;
}

let openRequest: OpenPublishRequest | null = null;
let requestCounter = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): OpenPublishRequest | null {
  return openRequest;
}

/** `useSyncExternalStore`'s required SSR snapshot. This admin has no SSR entry point (same posture
 *  `router.ts`'s `getServerRouteSnapshot` documents for the identical reason); `null` is the same
 *  "nothing open yet" state a fresh tab starts in either way. */
function getServerSnapshot(): OpenPublishRequest | null {
  return null;
}

/** What a request that never got planned resolves with — a superseded request, or one the operator
 *  closed before anything plans. `opened: true` is accurate either way: the dialog DID mount, however
 *  briefly; it is `planned` that stayed `false`. */
function unplannedResult(): PublishRequestResult {
  return {
    opened: true,
    planned: false,
    site: null,
    willPublish: [],
    willOverwrite: [],
    leftAlone: [],
    unmatchedItems: [],
    unknownTypes: [],
    nextStep: "The Publish dialog was closed before it could work out what would be published.",
  };
}

/**
 * Opens the Publish dialog at App level with `criteria` as its starting selection, and returns a
 * promise that settles once the dialog has planned against them (or, if nothing ever plans, once the
 * dialog closes or a newer request replaces this one — see this file's header).
 *
 * Never itself publishes anything — see this file's header for the full division of labour.
 *
 * @param scope `plan-publish-sections-2026-09-25.md` §2 S2 — see {@link OpenPublishRequest.scope}.
 * @complexity O(listeners) to notify subscribers; O(1) otherwise.
 */
export function requestPublish(criteria: PublishCriteria, scope?: PublishScope): Promise<PublishRequestResult> {
  // A still-open request is superseded, not dropped — see this file's header.
  openRequest?.resolve(unplannedResult());

  requestCounter += 1;
  const requestId = `publish-request-${requestCounter}`;
  return new Promise<PublishRequestResult>((resolve) => {
    openRequest = { requestId, criteria, scope, resolve };
    notify();
  });
}

/**
 * Closes whatever request is open — wired as the dialog's `onCancel` at the App level — settling its
 * promise first if it hadn't already settled via `onPlanned`. A no-op with nothing open (e.g. the
 * Dashboard's own dialog closing after S1's un-criteria'd `requestPublish({})`, resolved already by
 * its own `onPlanned` once it planned).
 */
export function closePublishRequest(): void {
  const current = openRequest;
  if (current === null) return;
  openRequest = null;
  notify();
  current.resolve(unplannedResult());
}

/** The currently open request, or `null` — what `App.tsx` mounts `PublishContentDialog` from. */
export function usePublishRequest(): OpenPublishRequest | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
