/** Translate Electron guest callbacks while preserving Tovu's missing-preload diagnostic. */
import {
  admitGuestSource as admitSource,
  applyGuestWebPreferences as applyPreferences,
} from "@jini-ai/desktop-host/electron/navigation-policy";
import type { GuestPolicyOptions, GuestWebPreferences as HostGuestWebPreferences } from "@jini-ai/desktop-host/electron/navigation-policy";

/** Jini's guest preferences plus the one Electron field this shell sets on top: renderer argv. */
type GuestWebPreferences = HostGuestWebPreferences & { additionalArguments?: string[] };

/**
 * Renderer argv flag every `<webview>` guest gets, and ONLY guests (a standalone site window never
 * passes through here). The speech preload turns it into `window.tovuDesktop.embedded`, and the site
 * admin hides its own `ChatFab`/`AssistantDock` on it: the shell's chat is the one chat (SPEC-051,
 * `one-chat-fab-wiring.test.ts`). A UI choice, not a security boundary — the page can read it but
 * not set it.
 */
const DESKTOP_EMBEDDED_ARG = "--tovu-desktop-embedded";

interface GuestSourceOptions {
  // Guest policy rationale: Jini/packages/desktop-host/src/electron/navigation-policy/webview-guest-policy.ts.
  isAllowedSource: (src: string) => boolean;
}

/** Apply Jini isolation policy with the shell's required preload. Mutates preferences. @complexity O(1). */
function applyGuestWebPreferences(webPreferences: GuestWebPreferences, options: GuestPolicyOptions): void {
  // D-10: deleting preload made the ordinary embedded admin tab report no desktop voice capability,
  // even though standalone windows worked. Grant the shell's required preload to both surfaces.
  if (typeof options?.preloadPath !== "string" || options.preloadPath.length === 0) {
    throw new Error("applyGuestWebPreferences: options.preloadPath is required — a guest with no preload has no voice API.");
  }
  applyPreferences({ webPreferences, preloadPath: options.preloadPath });
  // Assigned, not appended — the same rule as the preload above: `webviewTag` lets the page set
  // `webpreferences`, so anything it put here is dropped rather than merged.
  webPreferences.additionalArguments = [DESKTOP_EMBEDDED_ARG];
}

/** Adapt the Electron event and host predicate; failures refuse attachment. @complexity O(1) beyond the predicate. */
function admitGuestSource(
  event: { preventDefault(): void },
  params: { src?: unknown },
  options: GuestSourceOptions,
): boolean {
  return admitSource({ event, params, isAllowedSource: ({ src }) => options.isAllowedSource(src) });
}

export { applyGuestWebPreferences, admitGuestSource, DESKTOP_EMBEDDED_ARG };
export type { GuestPolicyOptions, GuestWebPreferences, GuestSourceOptions };
