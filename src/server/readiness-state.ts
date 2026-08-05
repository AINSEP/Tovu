import type { BootModuleResult, BootResult } from "./boot-lifecycle";

/**
 * @file ADR-046 Phase 2 (SPEC-030) — process-local holder for the latest `BootResult` snapshot.
 *
 * `/readyz` and the module-status admin route both read this. Defaults to `{ ok: true, modules: [] }`
 * so hermetic test app construction (`createApp(createRouteDeps())`, which never calls
 * `runBootLifecycle`) never sees a stale or undefined readiness state — REQ-07/AC-06.
 *
 * Also carries the agent daemon's own known-failure state (below), latched in from OUTSIDE
 * `runBootLifecycle` entirely — `index.ts`'s `spawnAgentDaemon()` starts the daemon deliberately
 * AFTER `app.listen()` (see that function's own doc), so it was never a `BootModule` and never
 * flows through `setReadinessSnapshot`. Appending its result into this same snapshot, rather than
 * inventing a second readiness surface, is what makes it show up on `/readyz` and the module-status
 * route for free.
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
 * Records that the locally-spawned agent daemon (`index.ts`'s `spawnAgentDaemon()`) is known to
 * have failed — either it crashed before ever confirming it was ready, or it exited without this
 * process having asked it to (see `spawnAgentDaemon`'s own `shuttingDownDeliberately` flag).
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
      remediationHint: "check the agent daemon's own stderr for the underlying crash and restart the API process",
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
 * Clears a previously-latched daemon failure. There is no retry path today — `spawnAgentDaemon()`
 * is called exactly once per process boot — so this is a no-op on a fresh process (the snapshot
 * starts with no `assistant-daemon` entry at all). It exists so a FUTURE retry does not inherit a
 * stuck 503 from a previous attempt: called at the start of `spawnAgentDaemon()`, before the new
 * child is spawned, so every attempt starts from a clean slate.
 */
export function clearAssistantDaemonFailure(): void {
  if (!isAssistantDaemonKnownFailed()) return;
  snapshot = { ok: snapshot.ok, modules: snapshot.modules.filter((m) => m.name !== ASSISTANT_DAEMON_MODULE_NAME) };
}
