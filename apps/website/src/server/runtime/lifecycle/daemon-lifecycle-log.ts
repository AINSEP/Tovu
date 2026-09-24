/**
 * @file The one switch for the agent daemon's ROUTINE lifecycle lines. `npm start`
 * (`development/scripts/start.mjs`) sets `TOVU_DAEMON_LIFECYCLE_LOG=off` so its whole output is the
 * server's one URL line; the daemon inherits it through its spawn env. Read in two processes: the
 * supervisor (`daemon-supervisor.ts`: first spawn, deliberate exit) and the daemon itself
 * (`agent-daemon-server.ts`: "listening on"). Crashes, respawns and per-run lines are never gated.
 */

/**
 * @param env - defaults to `process.env`.
 * @returns `true` only for exactly `"off"`; anything else keeps the lines.
 * @complexity O(1).
 */
export function isDaemonLifecycleLogQuiet(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TOVU_DAEMON_LIFECYCLE_LOG === "off";
}
