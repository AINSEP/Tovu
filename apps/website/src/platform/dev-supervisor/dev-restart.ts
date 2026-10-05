import fs from "node:fs";

/**
 * @file The server's side of `npm run dev`'s restart-on-request channel (owner decision OD-S1,
 * 2026-10-05, big-chat-capabilities plan S2): after `sites_switch_site`, the server ASKS
 * `development/scripts/dev.mjs` to restart the API child onto the new site. The server still never
 * kills, signals or re-execs itself — it only writes a small request file that the supervisor
 * watches. This reverses the 2026-09-04 "activate = persist, then a human restarts" rule only for
 * a process that `dev.mjs` started, because only there is something waiting to bring it back.
 *
 * The port exists only when `dev.mjs` set {@link DEV_RESTART_REQUEST_FILE_ENV} (a per-supervisor
 * temp path). `tovu serve`, `npm start`, the desktop app and hosted boots never set it, so there
 * `devRestartPortFromEnv()` returns `null` and callers fall back to restart instructions.
 *
 * A file, not IPC: the API child is `npx -> tsx watch -> node`, so an IPC channel on the direct
 * child never reaches the real server, and the tool handler may run in the agent daemon (a further
 * process down), which inherits the env var but has no channel to `dev.mjs` at all.
 */

/** Set by `dev.mjs` on the API child (and inherited by the agent daemon it spawns). */
export const DEV_RESTART_REQUEST_FILE_ENV = "TOVU_DEV_RESTART_REQUEST_FILE";

/** How long a request waits before it is written, so the tool result and the assistant's short
 *  reply reach the chat before the server (and the daemon running the turn) goes down. */
export const DEV_RESTART_DELAY_MS = 3000;

export interface DevRestartPort {
  /** Schedules the restart request. Returns at once; the write happens {@link DEV_RESTART_DELAY_MS} later. */
  requestRestart(required: { reason: string }): void;
}

export interface DevRestartPortOptional {
  env?: Readonly<Record<string, string | undefined>>;
  writeFile?: (path: string, data: string) => void;
  schedule?: (fn: () => void, ms: number) => void;
  delayMs?: number;
  log?: (message: string) => void;
}

/**
 * @returns the port when this process runs under `dev.mjs`, otherwise `null`.
 * @complexity O(1); the write is one small file.
 */
export function devRestartPortFromEnv(optional: DevRestartPortOptional = {}): DevRestartPort | null {
  const env = optional.env ?? process.env;
  const requestFile = env[DEV_RESTART_REQUEST_FILE_ENV];
  if (!requestFile) return null;
  const writeFile = optional.writeFile ?? ((path: string, data: string) => fs.writeFileSync(path, data));
  const schedule = optional.schedule ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms).unref?.());
  const log = optional.log ?? ((message: string) => console.error(message));
  return {
    requestRestart({ reason }) {
      schedule(() => {
        try {
          writeFile(requestFile, JSON.stringify({ reason, requestedAt: new Date().toISOString(), pid: process.pid }));
        } catch (err) {
          log(`[dev-restart] could not ask the dev supervisor to restart: ${err instanceof Error ? err.message : String(err)}`);
        }
      }, optional.delayMs ?? DEV_RESTART_DELAY_MS);
    },
  };
}
