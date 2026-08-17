import { useEffect, useState } from "react";

// The shared DEFAULT translator (`lib/api.ts`), not `../rules`'s screen-level override — that
// override's `FORBIDDEN` copy names "the AI assistant's settings" specifically, which would be a
// wrong claim here: this hook's `system.write` denial is about restarting the daemon process, not
// about a settings write. `rules.ts`'s own doc invites exactly this per-screen judgment call.
import { describeApiError } from "../../../lib/api";
import { defaultAssistantDaemonRestartPort } from "./assistant-daemon-restart-dependencies.hooks";
import type { AssistantDaemonRestartPort } from "./assistant-daemon-restart-port.hooks";

/**
 * @file State for `AssistantDaemonRestart` — the "Admin AI Assistant" tab's manual recovery
 * control for the Local CLI daemon process (`AiAssistant.tsx`'s `AdminExecutionMode` sibling).
 *
 * Two independent pieces of state, matching the port's two operations: `restart` (the mutation)
 * and `status` (the read). `checkStatus()` runs once on mount — so an operator who opens this tab
 * sees the current state without having to press anything first — and again after every `restart()`
 * settles, regardless of whether the restart was accepted or refused, because "is a failure
 * currently latched" is useful information either way. It is deliberately a single read, not a
 * poll loop: `restart()` returns as soon as a restart is INITIATED, never once the daemon is
 * healthy (there is no such signal anywhere in `daemon-supervisor.ts` — see that module's own
 * header), so a fixed number of automatic re-checks would only manufacture a false sense of
 * "waited long enough". `checkStatus` stays exposed on the controller so the operator can press
 * "Check status" again themselves, as many times as they want.
 */

export interface AssistantDaemonRestartDependencies {
  port: AssistantDaemonRestartPort;
}

export interface AssistantDaemonRestartController {
  restarting: boolean;
  /** The server's own answer to the last restart attempt — `null` before the first press. */
  restartResult: { ok: boolean; reason?: string } | null;
  /** Set only when `restart()` itself failed unexpectedly (network, 403, 500) — never for an
   *  ordinary `{ok: false, reason}` refusal, which lands in `restartResult` instead. */
  restartError: string | null;
  checkingStatus: boolean;
  /** `null` until the first status check settles; `true`/`false` thereafter. Never claims more
   *  than `/readyz` itself does — `false` means "no failure is currently latched", not "healthy". */
  knownFailed: boolean | null;
  statusError: string | null;
  restart(): Promise<void>;
  checkStatus(): Promise<void>;
}

export function useAssistantDaemonRestart({ port }: AssistantDaemonRestartDependencies): AssistantDaemonRestartController {
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [restartError, setRestartError] = useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [knownFailed, setKnownFailed] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function checkStatus() {
    setCheckingStatus(true);
    setStatusError(null);
    try {
      const readyz = await port.getReadyz();
      setKnownFailed(readyz.assistantDaemonKnownFailed === true);
    } catch (e) {
      setStatusError(describeApiError(e, "failed to check the assistant daemon's status"));
    } finally {
      setCheckingStatus(false);
    }
  }

  useEffect(() => {
    void checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restart() {
    setRestarting(true);
    setRestartError(null);
    try {
      const result = await port.restart();
      setRestartResult(result);
    } catch (e) {
      setRestartError(describeApiError(e, "failed to restart the assistant"));
    } finally {
      setRestarting(false);
      // Deliberately not awaited into the same try/finally above: a failed status re-check must
      // never overwrite `restartResult`/`restartError`, which already answered the question this
      // press was actually about.
      void checkStatus();
    }
  }

  return { restarting, restartResult, restartError, checkingStatus, knownFailed, statusError, restart, checkStatus };
}

/**
 * Binds the real assistant-daemon restart client — see `assistant-daemon-restart-dependencies
 * .hooks.ts`. The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair,
 * so `AiAssistant.tsx` composes this and a test composes {@link useAssistantDaemonRestart} with
 * `createFakeAssistantDaemonRestartPort`.
 */
export function useWiredAssistantDaemonRestart(): AssistantDaemonRestartController {
  return useAssistantDaemonRestart({ port: defaultAssistantDaemonRestartPort });
}
