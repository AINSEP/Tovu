/**
 * @file The site child's half of the routine wake relay (P3-T1b.T). The desktop main process sends
 * `{ type: 'routines.reconcile', reason: 'wake' }` over the child's private `ipc` channel when the
 * machine resumes; this turns that one message into `reconcile({ reason: 'wake' }, {})`.
 *
 * Why it is installed only for a verified desktop-eligible serving boot: only that boot runs the
 * routine scheduler, so on any other boot the message has nothing to wake. The message is an
 * accelerator, never consent or ownership: the scheduler's lease still decides whether anything
 * fires, and a late timer classifies the catch-up if the message never arrives. No HTTP endpoint or
 * renderer bridge reaches this; the parent channel is the only input.
 */
import { isRoutineReconcileMessage } from "@tovu/contracts/routines";

/** The `process`-like parent channel (`process.on('message')`/`process.off('message')`). */
export interface RoutineWakeChannel {
  on: (event: "message", listener: (message: unknown) => void) => unknown;
  off: (event: "message", listener: (message: unknown) => void) => unknown;
}

export type RoutineWakeReceiverLogEntry = Readonly<{ event: "routine-wake-reconcile-failed"; error: string }>;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Listens on `channel` for the exact reconcile message and routes it to `reconcile`. A rejection
 * or synchronous throw is logged, never rethrown: an uncaught error in a `message` listener would
 * crash the serving site over a hint it can safely miss.
 * @param channel the parent channel; undefined when the child was not spawned with `ipc`.
 * @returns a dispose that removes the listener (a no-op when nothing was installed).
 * @complexity O(1) per message.
 */
export function installRoutineWakeReceiver(
  { channel, reconcile, eligible, log }: {
    channel: RoutineWakeChannel | undefined;
    reconcile: (input: { reason: "wake" }, optional: Record<string, never>) => Promise<unknown>;
    eligible: boolean;
    /** The serving site's diagnostic logger, injected (required) so a failure lands where the host logs. */
    log: (entry: RoutineWakeReceiverLogEntry) => void;
  },
  _optional: Record<string, never> = {},
): () => void {
  if (!eligible || channel === undefined) return () => {};
  const onMessage = (message: unknown): void => {
    if (!isRoutineReconcileMessage(message)) return;
    const fail = (error: unknown): void => { log({ event: "routine-wake-reconcile-failed", error: errorText(error) }); };
    try {
      reconcile({ reason: "wake" }, {}).catch(fail);
    } catch (error) {
      fail(error);
    }
  };
  channel.on("message", onMessage);
  return () => { channel.off("message", onMessage); };
}
