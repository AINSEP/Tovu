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
 * How long `stop` waits for running pulls and their notification drains. Shutdown closes the site
 * store at most 4 s after a signal (`closeStoreOnShutdown`), and the boot-work wait and the daemon
 * stop share that bound, so a pull gets 1 s. A pull still running then is abandoned, not awaited: it
 * keeps its receiver's lease until the lease expires (`FORM_PULL_LEASE_MS`), which is how a crashed
 * pull recovers too, and its unacknowledged rows stay at the host for the next pull.
 */
export const FORM_PULL_STOP_GRACE_MS = 1_000;

/** Logged when `stop` gives up on a pull. */
export const FORM_PULL_STOP_LATE_LINE = "[form-submissions] a form pull was still running at shutdown; its receiver lease frees itself when it expires";

/**
 * @param required.autoPull the composed automatic pull; absent (no real site composition), every
 *   trigger is a no-op.
 * @returns `signIn` for `createApp`'s sign-in routes, `pullNow` for the startup pull, and `stop`,
 *   which refuses new pulls and waits for the running ones and their notification drains, for at
 *   most {@link FORM_PULL_STOP_GRACE_MS} (both boot paths call it at shutdown).
 * @example const formPull = createServingFormPullTrigger({ autoPull, workspaceId }); formPull.pullNow();
 * @complexity O(1); each pull's own cost is `autoPull`'s.
 */
export function createServingFormPullTrigger(
  required: { autoPull: FormsAutoPullPort | undefined; workspaceId: string },
  _optional: Record<string, never> = {},
): { signIn: AdminSignInPort; pullNow(): void; stop(): Promise<void> } {
  const { autoPull, workspaceId } = required;
  const trigger = createFormPullTrigger({
    run: async () => { await autoPull?.run({ workspaceId }); },
    onError: () => console.warn(FORM_PULL_FAILED_LINE),
  });
  // `trigger.run` never rejects, so neither sign-in nor boot waits on or fails because of a pull.
  const pullNow = (): void => { void trigger.run({}); };
  const settled = async (): Promise<void> => { await trigger.stop(); await autoPull?.drained(); };
  return { signIn: { signedIn: pullNow }, pullNow, stop: () => withinGrace({ work: settled() }) };
}

/** Resolves when `work` does or after {@link FORM_PULL_STOP_GRACE_MS}, whichever is first (logging
 * {@link FORM_PULL_STOP_LATE_LINE} then). `work` never rejects here. @complexity O(1). */
async function withinGrace(required: { work: Promise<void> }): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<"late">((resolve) => { timer = setTimeout(() => resolve("late"), FORM_PULL_STOP_GRACE_MS); });
  const outcome = await Promise.race([required.work, late]);
  clearTimeout(timer);
  if (outcome === "late") console.warn(FORM_PULL_STOP_LATE_LINE);
}
