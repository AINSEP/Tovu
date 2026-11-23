import { useProcessRestart, type ProcessRestartController, type ProcessRestartPort } from "@jini-ai/admin/react";
import { aiAssistantApi } from "@/features/ai-assistant/api/ai-assistant-api";
// The shared DEFAULT translator (`lib/api.ts`), not `../rules`'s screen-level override — that
// override's `FORBIDDEN` copy names "the AI assistant's settings" specifically, which would be a
// wrong claim here: this hook's `system.write` denial is about restarting the daemon process, not
// about a settings write. `rules.ts`'s own doc invites exactly this per-screen judgment call.
import { describeApiError } from "@/lib/admin-http/request";

/**
 * @file The host binding for `AssistantDaemonRestart` — the "Admin AI Assistant" tab's manual
 * recovery control for the Local CLI daemon process (`AiAssistant.tsx`'s `AdminExecutionMode`
 * sibling). The state machine is Jini's `useProcessRestart`; this file supplies the daemon's two
 * endpoints, the readiness adapter, the post-restart delay and the error copy.
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

/**
 * The daemon's two endpoints as this admin's API exposes them.
 *
 * Two operations, deliberately not one: `restart()` (the mutation, `system.write`-gated) and
 * `getReadyz()` (the read, unauthenticated) answer different questions — "did a restart get
 * accepted?" and "is a failure currently latched?" — and the server-side route this restart calls
 * (`apps/website/src/server/inbound/admin-http/routes/system/assistant-daemon.ts`) is explicit that the first can never imply the
 * second (no "daemon became healthy" signal exists anywhere in the daemon supervisor). Folding them
 * into one call would invite exactly that conflation on this side too.
 */
export interface AssistantDaemonRestartPort {
  /** `{ok: true}` once a restart has been INITIATED, or `{ok: false, reason}` when refused (e.g.
   *  the server process is itself shutting down). Never implies the daemon is healthy again. */
  restart(): Promise<{ ok: boolean; reason?: string }>;
  /** `/readyz`'s own shape — `assistantDaemonKnownFailed` is present (and `true`) only while a
   *  fresh agent-daemon failure is latched server-side; absent otherwise. */
  getReadyz(): Promise<{ ready: boolean; assistantDaemonKnownFailed?: true }>;
}

/** The live implementation, as a module-level singleton — matches `ai-assistant-dependencies
 *  .hooks.ts`'s `defaultAiAssistantPort`. */
export const defaultAssistantDaemonRestartPort: AssistantDaemonRestartPort = {
  restart: () => aiAssistantApi.restartAssistantDaemon(),
  getReadyz: () => aiAssistantApi.getAssistantDaemonReadyz(),
};

/** `/readyz` narrowed to the engine hook's `{ failed }`: `false` means "no failure is currently
 *  latched", never "healthy" — `ready: false` alone is not a latched daemon failure. */
export const assistantDaemonProcessRestartPort: ProcessRestartPort = {
  restart: () => defaultAssistantDaemonRestartPort.restart(),
  getStatus: async () => ({ failed: (await defaultAssistantDaemonRestartPort.getReadyz()).assistantDaemonKnownFailed === true }),
};

/** How long the real (wired) hook waits before its post-restart status re-check. Not a "the daemon
 *  is definitely up by now" claim — just long enough that an immediate re-check reporting the OLD
 *  state stops being the COMMON case. A few seconds is well within a Local CLI daemon's normal
 *  `tsx`-compile-and-listen boot time in dev; production's compiled boot is faster still. */
const REAL_POST_RESTART_CHECK_DELAY_MS = 2500;

/**
 * Binds the real assistant-daemon restart client to Jini's `useProcessRestart`, so
 * `AiAssistant.tsx` composes this and a test injects its own controller instead.
 */
export function useWiredAssistantDaemonRestart(): ProcessRestartController {
  return useProcessRestart({
    port: assistantDaemonProcessRestartPort,
    describeError: ({ error, fallback }) => describeApiError({ e: error, fallback }),
    messages: {
      restartFallback: "failed to restart the assistant",
      statusFallback: "failed to check the assistant daemon's status",
    },
  }, { postRestartCheckDelayMs: REAL_POST_RESTART_CHECK_DELAY_MS });
}
