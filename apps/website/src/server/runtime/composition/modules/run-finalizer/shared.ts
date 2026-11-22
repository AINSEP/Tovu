import type { ChatRunLedger } from "#src/assistant/index";

import type { RunDaemonClient } from "../run-daemon-http-client.js";
import { createAssistantRunFinalizer, type AssistantRunFinalizer, type AssistantRunFinalizerOptions } from "./entry.js";

/**
 * @file The one run finalizer of a chat ledger. Every composition module that needs the
 * finalizer asks here with its ledger, so the routes, the daemon proxy and the idle check all
 * reach the same coordinator.
 */

// Chat routes and the daemon proxy meet on the same ledger instance. Sharing this coordinator
// avoids a browser-triggered recovery creating an independent boot/finalization engine.
type SharedFinalizer = {
  readonly finalizer: AssistantRunFinalizer;
  readonly options: Omit<AssistantRunFinalizerOptions, "recoveryDaemon" | "onAttemptEnded"> & {
    recoveryDaemon?: RunDaemonClient; onAttemptEnded?: AssistantRunFinalizerOptions["onAttemptEnded"];
  };
};
const sharedFinalizers = new WeakMap<ChatRunLedger, SharedFinalizer>();
export function assistantRunFinalizerFor(required: AssistantRunFinalizerOptions, _optional = {}): AssistantRunFinalizer {
  const existing = sharedFinalizers.get(required.ledger);
  if (existing) {
    // An export app can construct the route module before serving composition opts into boot
    // recovery. Install its prior-daemon port on the same coordinator rather than freezing the
    // earlier export defaults or creating a second recovery engine.
    if (required.recoveryDaemon) existing.options.recoveryDaemon = required.recoveryDaemon;
    if (required.onAttemptEnded) existing.options.onAttemptEnded = required.onAttemptEnded;
    return existing.finalizer;
  }
  const options = { ...required };
  const finalizer = createAssistantRunFinalizer(options, {});
  sharedFinalizers.set(required.ledger, { finalizer, options });
  return finalizer;
}
