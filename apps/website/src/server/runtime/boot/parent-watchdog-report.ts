import type { ParentWatchdogEvent } from "@jini-ai/sidecar";

/**
 * @file The site entry's wording for parent-watchdog events. The watchdog (`@jini-ai/sidecar`)
 * reports structured events and owns no log text; this module is the one place that turns each into
 * the console line and stream the entry has always written, under the entry's own `[index]` tag.
 */

/** The prefix the entry module names itself with on every watchdog line. */
const LOG_TAG = "[index]";

/** One console line and the stream it belongs on: `log` for a status note, `error` for a self-termination or a bad setting. */
export interface ParentWatchdogLine { readonly stream: "log" | "error"; readonly line: string }

/**
 * Formats one watchdog event.
 *
 * @example formatParentWatchdogEvent({ event: { kind: "supervisor-gone", supervisorPid: 777 } });
 * // { stream: "error", line: "[index] dev supervisor process 777 is gone — self-terminating" }
 * @complexity O(1).
 */
export function formatParentWatchdogEvent({ event }: { event: ParentWatchdogEvent }, _optional = {}): ParentWatchdogLine {
  switch (event.kind) {
    case "disabled":
      return { stream: "log", line: `${LOG_TAG} ${event.disableEnvName}=1 — parent watchdog disabled` };
    case "parent-gone-at-boot":
      return { stream: "error", line: `${LOG_TAG} parent process ${event.parentPid} was already gone before this process finished booting — self-terminating` };
    case "invalid-supervisor-pid":
      return { stream: "error", line: `${LOG_TAG} ${event.envName}="${event.raw}" is not a valid pid — that check is disabled` };
    case "supervisor-gone":
      return { stream: "error", line: `${LOG_TAG} dev supervisor process ${event.supervisorPid} is gone — self-terminating` };
    case "parent-reparented":
      return { stream: "error", line: `${LOG_TAG} parent process ${event.parentPid} is gone (reparented to ${event.currentPid}) — self-terminating` };
  }
}
