/**
 * @file What `use-assistant-daemon-restart.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import — same `useX(dependencies)` / `useWiredX()` split
 * `ai-assistant-port.hooks.ts` documents (the canonical reference in this workspace).
 *
 * Two operations, deliberately not one: `restart()` (the mutation, `system.write`-gated) and
 * `getReadyz()` (the read, unauthenticated) answer different questions — "did a restart get
 * accepted?" and "is a failure currently latched?" — and the server-side route this restart calls
 * (`server/routes/admin/system/assistant-daemon.ts`) is explicit that the first can never imply the
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
