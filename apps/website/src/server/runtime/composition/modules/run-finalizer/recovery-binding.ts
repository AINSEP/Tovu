import type { ChatMessage } from "@jini-ai/chat/core";
import { createDurableRecovery } from "@jini-ai/chat/server/durable-runs";
import type { DurableRecovery, RecoveryPorts } from "@jini-ai/chat/server/durable-runs";

import type { ChatRunLedger } from "#src/assistant/index";

import type { RunDaemonClient, RunDaemonRequest } from "../run-daemon-http-client.js";
import type { AgentEvent } from "@jini-ai/core/contracts/site/chat-core";

/**
 * @file Binds durable recovery to the run finalizer: an HTTP status becomes live, dead or
 * uncertain; `attach` becomes a watch; a launch is remembered as this engine's own attempt; and
 * every probe, attach and cancel picks the daemon client that holds the run. It owns
 * `newAttempts`, the run ids this engine launched. Recovery exists only when the ledger has a
 * durable store.
 */

export interface RecoveryBindingPorts {
  /** Called as `ledger.checkpoint(...)` / `ledger.settle(...)` at every write, on the host's own object. */
  readonly ledger: Pick<ChatRunLedger, "checkpoint" | "settle">;
  /** The durable store as the assembly read it, once. Without one there is no recovery. */
  readonly durable: ChatRunLedger["durable"];
  readonly now: () => number;
  readonly mintRunId: () => string;
  readonly verifyChildDead: RecoveryPorts["verifyChildDead"];
  readonly supportsNativeResume: RecoveryPorts["supportsNativeResume"];
  /** The current daemon: every launch goes here, and so does every later call for a run it launched. */
  readonly daemon: RunDaemonClient;
  /** The client that holds an adopted run (one this engine did not launch). Asked at every probe,
   * attach and cancel of such a run and never cached: a host may install it after construction. */
  recoveryDaemon(required: { runId: string }, optional?: {}): RunDaemonClient | undefined;
  /** One bounded status probe of `client`. */
  probe(required: { run: RunDaemonRequest; client: RunDaemonClient }, optional?: {}): Promise<number | null>;
  /** Starts a watch of the attempt. Called only from inside `recover()`, never while this binding is built. */
  attach(required: { principalId: string; conversationId: string; message: ChatMessage }, optional: { attemptBase: AgentEvent[]; daemon: RunDaemonClient }): void;
}

export interface RecoveryBinding {
  readonly recovery: DurableRecovery | undefined;
  /** Call at the end of every watch of `runId`: the run is no longer remembered as a new attempt. */
  attemptEnded(required: { runId: string }, optional?: {}): void;
}

/** @complexity O(1) to build; O(a) space for a attempts launched and not yet ended. */
export function createRecoveryBinding(ports: RecoveryBindingPorts, _optional = {}): RecoveryBinding {
  const { daemon, durable } = ports;
  const newAttempts = new Set<string>();
  const clientFor = ({ runId }: { runId: string }, _options = {}): RunDaemonClient => newAttempts.has(runId) ? daemon : ports.recoveryDaemon({ runId }) ?? daemon;
  const attemptEnded: RecoveryBinding["attemptEnded"] = ({ runId }, _options = {}) => { newAttempts.delete(runId); };
  if (!durable) return { recovery: undefined, attemptEnded };
  const recovery = createDurableRecovery({
    store: durable, now: ports.now, mintRunId: ports.mintRunId,
    async probe(run, _options) {
      if (!run.principalId) throw new Error("assistant recovery probe has no principal id");
      const status = await ports.probe({ run: { runId: run.runId, principalId: run.principalId }, client: clientFor({ runId: run.runId }) });
      if (status === 404) return "dead";
      return status === 200 ? "live" : "uncertain";
    },
    attach(run, _options) {
      if (!run.principalId) throw new Error("assistant recovery watch has no principal id");
      ports.attach({ principalId: run.principalId, conversationId: run.conversationId, message: run.message }, {
        attemptBase: [...run.attemptBase], daemon: clientFor({ runId: run.runId }),
      });
    },
    async launch(required, optional) {
      if (!daemon.launch) throw new Error("daemon continuation port is unavailable");
      newAttempts.add(required.run.runId);
      await daemon.launch(required, optional);
    },
    cancelAttempt: async (run, optional) => {
      const client = clientFor({ runId: run.runId });
      if (!client.cancel) return;
      if (!run.principalId) throw new Error("assistant recovery cancellation has no principal id");
      return client.cancel({ runId: run.runId, principalId: run.principalId }, optional);
    },
    verifyChildDead: ports.verifyChildDead,
    supportsNativeResume: ports.supportsNativeResume,
    checkpoint: (required, _options) => ports.ledger.checkpoint(required),
    settle: (required, _options) => ports.ledger.settle(required),
  }, {});
  return { recovery, attemptEnded };
}
