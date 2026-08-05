/**
 * @file Shared between `assistant/agent-daemon-server.ts` (the process that exits) and
 * `index.ts` (the parent that reaps the exit code) — a process's own `exit` event carries only a
 * number, so the specific, human-readable reason for THIS exit code has to live somewhere both
 * processes import identically, rather than being re-guessed from the number alone on the parent
 * side.
 *
 * `PORT_IN_USE` is deliberately not `1` (Node's default uncaught-exception code, indistinguishable
 * from any other daemon crash): a leaked port squatting the daemon's own port is common enough in
 * this repo's own e2e history to deserve its own code, so `index.ts` can report exactly why the
 * daemon died — "address already in use" — instead of the generic "exited unexpectedly (code 1)"
 * that previously made a leaked-port boot failure read as unexplained flake.
 */
export const AGENT_DAEMON_EXIT_CODE = {
  PORT_IN_USE: 87,
} as const;
