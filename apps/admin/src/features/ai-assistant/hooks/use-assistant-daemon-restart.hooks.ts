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
 * and `status` (the read). `checkStatus()` runs once on mount, undelayed — so an operator who opens
 * this tab sees the current state without having to press anything first — and again after every
 * `restart()` settles, regardless of whether the restart was accepted or refused, because "is a
 * failure currently latched" is useful information either way. It is deliberately a single read,
 * not a poll loop: `restart()` returns as soon as a restart is INITIATED, never once the daemon is
 * healthy (there is no such signal anywhere in `daemon-supervisor.ts` — see that module's own
 * header), so a fixed number of automatic re-checks would only manufacture a false sense of
 * "waited long enough". `checkStatus` stays exposed on the controller so the operator can press
 * "Check status" again themselves, as many times as they want.
 *
 * The POST-RESTART re-check specifically waits `postRestartCheckDelayMs` first (source-control-ui
 * finding, 2026-08-17, live-verified): a freshly spawned process cannot plausibly be listening
 * within milliseconds of `restart()` resolving, so firing that one read immediately would almost
 * certainly just re-report the OLD state — directly under a line telling the operator to "check the
 * status below". This is still a single read, not a wait-until-ready loop: the delay changes WHEN
 * the one read happens, it does not retry toward a target state, so it does not compromise the "no
 * health signal exists, so we never claim one" principle above. The mount-time check and manual
 * `checkStatus()` presses are never delayed — only this one automatic follow-up is.
 */

export interface AssistantDaemonRestartDependencies {
  port: AssistantDaemonRestartPort;
  /** See this file's own header for why only the post-restart re-check is delayed. Defaults to `0`
   *  here (fast, deterministic tests) — `useWiredAssistantDaemonRestart` supplies the real-world
   *  value below. */
  postRestartCheckDelayMs?: number;
}

/** How long the real (wired) hook waits before its post-restart status re-check. Not a "the daemon
 *  is definitely up by now" claim — just long enough that an immediate re-check reporting the OLD
 *  state stops being the COMMON case. A few seconds is well within a Local CLI daemon's normal
 *  `tsx`-compile-and-listen boot time in dev; production's compiled boot is faster still. */
const REAL_POST_RESTART_CHECK_DELAY_MS = 2500;

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

export function useAssistantDaemonRestart({
  port,
  postRestartCheckDelayMs = 0,
}: AssistantDaemonRestartDependencies): AssistantDaemonRestartController {
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
    }
    // Outside the try/finally above: a failed status re-check must never overwrite
    // `restartResult`/`restartError`, which already answered the question this press was actually
    // about, and `restarting` must already read `false` for the whole delay — this follow-up read
    // is not part of "a restart is in flight" from the button's point of view.
    if (postRestartCheckDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, postRestartCheckDelayMs));
    }
    void checkStatus();
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
  return useAssistantDaemonRestart({
    port: defaultAssistantDaemonRestartPort,
    postRestartCheckDelayMs: REAL_POST_RESTART_CHECK_DELAY_MS,
  });
}
