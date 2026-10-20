import { createFormPullTrigger } from "@jini-ai/cms/forms";
import type { AdminSignInPort } from "#src/server/inbound/admin-http/dev-auth";
import type { FormsAutoPullPort } from "#src/features/forms/index";

/**
 * @file The serving app's two automatic form pulls: once at startup and once per owner/admin
 * sign-in. Exists so a static site's stored submissions reach Tovu without anyone pressing "pull",
 * and without polling: nothing here runs on a timer.
 *
 * Only `createServingApp` builds this. The exporter, the CLI outside `serve` and the enqueue-only
 * agent daemon never do, so they never pull (pinned by `serving-app-boot-wiring.unit.test.ts`).
 * Whether a pull may run (setting, lease, last start) is decided inside `autoPull`, not here.
 */

/** Logged for every failed automatic pull. Deliberately constant: the error can carry a receiver URL,
 * a key or submission answers, and the pull's own per-receiver log line already has the details. */
export const FORM_PULL_FAILED_LINE = "[form-submissions] automatic pull failed; the next site start or admin sign-in retries it";

/**
 * @param required.autoPull the composed automatic pull; absent (no real site composition), every
 *   trigger is a no-op.
 * @returns `signIn` for `createApp`'s sign-in routes, `pullNow` for the startup pull, and `stop`,
 *   which refuses new pulls and waits for the running ones (both boot paths call it at shutdown).
 * @example const formPull = createServingFormPullTrigger({ autoPull, workspaceId }); formPull.pullNow();
 * @complexity O(1); each pull's own cost is `autoPull`'s.
 */
export function createServingFormPullTrigger(
  required: { autoPull: FormsAutoPullPort | undefined; workspaceId: string },
  optional: { warn?: (line: string) => void } = {},
): { signIn: AdminSignInPort; pullNow(): void; stop(): Promise<void> } {
  const { autoPull, workspaceId } = required;
  const trigger = createFormPullTrigger({
    run: async () => { await autoPull?.run({ workspaceId }); },
    onError: () => (optional.warn ?? console.warn)(FORM_PULL_FAILED_LINE),
  });
  // `trigger.run` never rejects, so neither sign-in nor boot waits on or fails because of a pull.
  const pullNow = (): void => { void trigger.run(); };
  return { signIn: { signedIn: pullNow }, pullNow, stop: () => trigger.stop() };
}
