import type { BootModuleResult, BootResult } from "./boot-lifecycle";

/**
 * @file ADR-046 Phase 2 (SPEC-030) — process-local holder for the latest `BootResult` snapshot.
 *
 * `/readyz` and the module-status admin route both read this. Defaults to `{ ok: true, modules: [] }`
 * so hermetic test app construction (`createApp(createRouteDeps())`, which never calls
 * `runBootLifecycle`) never sees a stale or undefined readiness state — REQ-07/AC-06.
 *
 * Also carries the agent daemon's own known-failure state (below), latched in from OUTSIDE
 * `runBootLifecycle` entirely — `index.ts`'s `startAssistantDaemon()` (`src/assistant/
 * daemon-supervisor.ts`) starts the daemon deliberately AFTER `app.listen()` (see that call site's
 * own doc), so it was never a `BootModule` and never flows through `setReadinessSnapshot`.
 * Appending its result into this same snapshot, rather than inventing a second readiness surface,
 * is what makes it show up on `/readyz` and the module-status route for free — including through
 * every automatic respawn attempt `daemon-supervisor.ts` makes, not just the first one.
 */

let snapshot: BootResult = { ok: true, modules: [] };

export function setReadinessSnapshot(next: BootResult): void {
  snapshot = next;
}

export function getReadinessSnapshot(): BootResult {
  return snapshot;
}

/** The synthetic module name the agent daemon's post-listen health is recorded under — not part
 *  of `buildBootModules`'s own list, so it needs a name that can't collide with a real one. */
const ASSISTANT_DAEMON_MODULE_NAME = "assistant-daemon";

/**
 * Records that the locally-spawned agent daemon (`daemon-supervisor.ts`'s spawn loop) is known to
 * have failed — either it crashed before ever confirming it was ready, or it exited without the
 * supervisor having asked it to (see that module's own `shuttingDown` flag). Also used, with a
 * distinct reasonCode, once `daemon-supervisor.ts`'s automatic respawn gives up after its
 * crash-loop cap trips — see that file's own header.
 *
 * Recorded as `criticality: "optional"`, matching `runBootLifecycle`'s own convention: a daemon
 * failure must be visible in the snapshot, but must never flip the rest of the app's `ok` to
 * `false` — most of Tovu, and BYOK mode specifically, does not depend on this process at all.
 *
 * `server/modules/assistant.ts` checks {@link isAssistantDaemonKnownFailed} before ever attempting
 * to proxy a request to the daemon's port. The point of latching a KNOWN failure, rather than just
 * logging one, is that "something answered on the daemon's port" stops being treated as proof of
 * health once we know OUR OWN spawn died — a leaked port can otherwise still be squatted by an
 * orphaned daemon from a previous run, which would go on answering requests as if it were healthy.
 */
export function recordAssistantDaemonFailure(reasonCode: string): void {
  const failedModule: BootModuleResult = {
    name: ASSISTANT_DAEMON_MODULE_NAME,
    owner: "assistant",
    criticality: "optional",
    lifecycle: {
      status: "failed",
      reasonCode,
      remediationHint:
        "check the agent daemon's own stderr for the underlying crash — daemon-supervisor.ts retries automatically with backoff; " +
        "if it has given up (see the reasonCode above), use the manual restart seam (restartAssistantDaemon) instead of restarting the whole API process",
    },
  };
  snapshot = {
    ok: snapshot.ok,
    modules: [...snapshot.modules.filter((m) => m.name !== ASSISTANT_DAEMON_MODULE_NAME), failedModule],
  };
}

/** True once {@link recordAssistantDaemonFailure} has latched for this boot. */
export function isAssistantDaemonKnownFailed(): boolean {
  return snapshot.modules.some((m) => m.name === ASSISTANT_DAEMON_MODULE_NAME && m.lifecycle.status === "failed");
}

/**
 * The exact `reasonCode` string the currently-latched failure was recorded with — `null` when
 * nothing is latched. `recordAssistantDaemonFailure` is called from two structurally different
 * situations (`daemon-supervisor.ts`'s `handleUnexpectedExit`/`buildGiveUpReasonCode`: a spawn-level
 * `error` that never got a process running at all, an unexpected mid-life exit still within the
 * respawn policy's retry window, OR the crash-loop/port-conflict cap giving up after several
 * attempts) and those are different operational situations for whoever is reading the failure — "it
 * never started" points at boot configuration, "it gave up after N crashes" points at something the
 * process itself is doing once running. `isAssistantDaemonKnownFailed()` alone cannot distinguish
 * them; this is the seam a caller needing to (e.g. `server/modules/assistant.ts`'s 503 body) reads
 * through, rather than reaching into `snapshot.modules` and re-deriving the synthetic module name
 * `recordAssistantDaemonFailure` stores this under.
 */
export function getAssistantDaemonFailureReasonCode(): string | null {
  const failed = snapshot.modules.find((m) => m.name === ASSISTANT_DAEMON_MODULE_NAME && m.lifecycle.status === "failed");
  return failed && failed.lifecycle.status === "failed" ? failed.lifecycle.reasonCode : null;
}

/**
 * Clears a previously-latched daemon failure. Called at the start of every spawn attempt inside
 * `daemon-supervisor.ts` — the very first boot, every automatic respawn, and the manual restart
 * seam alike — so a later successful attempt is never stuck behind a stale 503 an earlier,
 * unrelated attempt latched. On the very first boot this is a no-op (the snapshot starts with no
 * `assistant-daemon` entry at all); the "future retry" this comment used to say didn't exist yet
 * is exactly what `daemon-supervisor.ts` now is.
 */
export function clearAssistantDaemonFailure(): void {
  if (!isAssistantDaemonKnownFailed()) return;
  snapshot = { ok: snapshot.ok, modules: snapshot.modules.filter((m) => m.name !== ASSISTANT_DAEMON_MODULE_NAME) };
}
