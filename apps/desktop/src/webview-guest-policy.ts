/**
 * @file The `webPreferences` policy the sites home window applies to every `<webview>` guest it attaches
 * — `main.ts`'s `will-attach-webview` handler, moved out so it can be asserted directly.
 *
 * **What it is defending.** `webviewTag: true` lets the PAGE choose its guests' `webPreferences`
 * through tag attributes. This handler runs in the main process, after the page has had its say and
 * before the guest exists, and overwrites the three that matter. Every assignment is unconditional
 * and none merges an incoming value: a policy that consulted what the page asked for would be no
 * policy at all.
 *
 * **Why `preload` is ASSIGNED and not deleted (D-10).** It used to be `delete
 * webPreferences.preload`, which does keep the page from choosing one — but it also left the guest
 * with no preload at all, and the guest is a Tovu site's own admin. `window.tovuVoice` is what
 * `apps/admin/src/features/voice-input/voice-input-port.ts` looks for to decide whether it is
 * running inside this shell; absent, `voice-unavailability.ts` renders the `no-desktop-shell` copy
 * telling the operator that voice input needs the desktop app. Inside the desktop app. And since the
 * sites home UI became the default (2026-09-06), the embedded tab is the ORDINARY way a site is opened,
 * so that was the default experience — while the very same admin page opened as a standalone window
 * (`createWindow`, same `SPEECH_PRELOAD_PATH`) had working voice all along.
 *
 * Assigning the shell's own absolute path is strictly stronger than deleting: the page still cannot
 * choose, and the grant is the same one the standalone window already makes to the same origin. The
 * surface is two channels — `tovu:speech:isAvailable` and `tovu:speech:transcribe`, both on-device
 * with no filesystem or network reach (`speech-ipc.ts`) — and `registerGuestNavigationPolicy`
 * already confines the guest to its own origin.
 *
 * No `electron` import, so this is testable under plain `node --test` — same convention as
 * `site-supervisor.ts`, `keyed-serializer.ts` and `shutdown-tracker.ts`.
 */

/** The three `webPreferences` fields this policy owns. Electron's own `WebPreferences` satisfies it. */
interface GuestWebPreferences {
  preload?: string;
  nodeIntegration?: boolean;
  contextIsolation?: boolean;
}

/** {@link applyGuestWebPreferences}'s options. */
interface GuestPolicyOptions {
  preloadPath: string;
}

/**
 * Overwrite a guest's `webPreferences` with this shell's policy, in place.
 *
 * @param webPreferences the object Electron passes to `will-attach-webview`, already carrying
 *   whatever the page's `<webview>` attributes asked for. Mutated, because that is the only channel
 *   Electron offers here — the event does not read a return value.
 * @param options.preloadPath absolute path to the preload every guest gets. Required rather than
 *   defaulted: a silent fallback would let a wiring mistake produce a guest with no voice API and no
 *   error, which is exactly the defect this function exists to close.
 * @complexity O(1).
 */
function applyGuestWebPreferences(webPreferences: GuestWebPreferences, options: GuestPolicyOptions): void {
  if (typeof options?.preloadPath !== "string" || options.preloadPath.length === 0) {
    throw new Error("applyGuestWebPreferences: options.preloadPath is required — a guest with no preload has no voice API.");
  }
  webPreferences.preload = options.preloadPath;
  webPreferences.nodeIntegration = false;
  webPreferences.contextIsolation = true;
}

/** The part of a `will-attach-webview` event {@link admitGuestSource} uses. */
interface GuestAttachEvent {
  preventDefault(): void;
}

/** The part of `will-attach-webview`'s `params` {@link admitGuestSource} reads: the tag's `src`. */
interface GuestAttachParams {
  src?: unknown;
}

/** {@link admitGuestSource}'s options. */
interface GuestSourceOptions {
  /** Whether a guest may load `src` — `main.ts`'s `isSupervisedGuestUrl`, the same boundary the
   *  guest's own navigation, redirect and popup handlers apply once it is attached. */
  isAllowedSource: (src: string) => boolean;
}

/**
 * Refuse a guest whose `src` is not a site this shell supervises, BEFORE it attaches.
 *
 * The preload {@link applyGuestWebPreferences} grants is only safe on a supervised site's origin.
 * The navigation policy keeps an attached guest there, but only this check decides where the guest
 * starts: without it, any `<webview src>` the page wrote attached and got the preload.
 *
 * Never throws. A throw escaping a guest callback blanks the whole sites-home window in this app,
 * so a missing or non-string `src`, or a predicate that throws, is a refusal.
 *
 * @param event the `will-attach-webview` event; `preventDefault()` is what refuses the attach.
 * @param params the event's `params`; only `src` is read.
 * @returns whether the guest was admitted.
 * @complexity O(1) beyond `isAllowedSource`'s own cost.
 */
function admitGuestSource(event: GuestAttachEvent, params: GuestAttachParams, options: GuestSourceOptions): boolean {
  let admitted = false;
  try {
    admitted = typeof params?.src === "string" && options.isAllowedSource(params.src);
  } catch {
    admitted = false;
  }
  if (!admitted) event.preventDefault();
  return admitted;
}

export { applyGuestWebPreferences, admitGuestSource };
export type { GuestPolicyOptions, GuestWebPreferences, GuestSourceOptions };
