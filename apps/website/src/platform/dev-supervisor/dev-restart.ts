import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createNodeAtomicFilesystem, writeFileAtomic } from "@jini-ai/platform/fs";

/**
 * @file Dev restart-on-request channel (owner decision OD-S1): after `sites_switch_site`,
 * the server asks `development/scripts/dev.mjs` to restart its API child onto the new site.
 * The server only writes a supervisor request file; it never kills, signals or re-execs
 * itself. Automatic restart is limited to supervised dev processes because only that
 * supervisor can bring the server back.
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

export type DevRestartDecision = { accepted: true } | { accepted: false; reason: string };

export interface DevRestartPort {
  /** False when the launcher is pinned by an explicit shell site override. */
  canSwitchSite?: boolean;
  /** Legacy requests write after the chat delivery delay. Opt-in callers await the supervisor's
   * precheck; acceptance schedules a restart and does not claim a completed boot. */
  requestRestart(required: { reason: string }, optional?: { awaitAcceptance?: boolean }): void | Promise<DevRestartDecision | void>;
}

export interface DevRestartPortOptional {
  env?: Readonly<Record<string, string | undefined>>;
  writeFile?: (path: string, data: string) => void;
  readFile?: (path: string) => string | null;
  removeFile?: (path: string) => void;
  newId?: () => string;
  schedule?: (fn: () => void, ms: number) => void;
  delayMs?: number;
  log?: (message: string) => void;
}

/** Ask the supervisor's existing precheck before claiming acceptance. Each request has its own
 * reply file; a missing, malformed or unreadable acknowledgement fails closed without error text.
 * @returns Acceptance of a scheduled request, never proof that the new API has booted.
 * @complexity O(1) space and at most 150 small reply reads over fifteen seconds.
 */
function requestRestartAcceptance({ requestFile, reason }: { requestFile: string; reason: string },
  options: DevRestartPortOptional & Required<Pick<DevRestartPortOptional, "writeFile" | "schedule">>): Promise<DevRestartDecision> {
  const requestId = (options.newId ?? randomUUID)();
  const replyFile = `${requestFile}.${requestId}.result`;
  const read = options.readFile ?? (file => fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  const remove = options.removeFile ?? (file => fs.rmSync(file, { force: true }));
  return new Promise(resolve => {
    let remaining = 150;
    const poll = () => {
      try {
        const text = read(replyFile);
        if (text !== null) {
          const decision = JSON.parse(text);
          remove(replyFile);
          if (decision?.accepted === true) { resolve({ accepted: true }); return; }
          if (decision?.accepted === false && typeof decision.reason === "string") { resolve({ accepted: false, reason: decision.reason }); return; }
          throw new Error("Invalid supervisor acknowledgement");
        }
        if (--remaining === 0) { resolve({ accepted: false, reason: "The dev supervisor did not confirm the restart request." }); return; }
        options.schedule(poll, 100);
      } catch {
        resolve({ accepted: false, reason: "Could not confirm the restart with the dev supervisor." });
      }
    };
    try {
      options.writeFile(requestFile, JSON.stringify({ reason, requestId, requestedAt: new Date().toISOString(), pid: process.pid }));
      options.schedule(poll, 100);
    } catch {
      resolve({ accepted: false, reason: "Could not send the restart request to the dev supervisor." });
    }
  });
}

/**
 * @returns the port when this process runs under `dev.mjs`, otherwise `null`.
 * @complexity O(1); the write is one small file.
 */
export function devRestartPortFromEnv(optional: DevRestartPortOptional = {}): DevRestartPort | null {
  const env = optional.env ?? process.env;
  const requestFile = env[DEV_RESTART_REQUEST_FILE_ENV];
  if (!requestFile) return null;
  // The supervisor polls this file; publish whole JSON so it cannot consume a partial request.
  const writeFile = optional.writeFile ?? ((filePath: string, content: string) => writeFileAtomic({ filePath, content, fs: createNodeAtomicFilesystem({}) }));
  const schedule = optional.schedule ?? ((fn: () => void, ms: number) => void setTimeout(fn, ms).unref?.());
  const log = optional.log ?? ((message: string) => console.error(message));
  return {
    canSwitchSite: env.TOVU_DEV_SITE_PINNED !== "1",
    requestRestart({ reason }, { awaitAcceptance = false } = {}) {
      if (awaitAcceptance) return requestRestartAcceptance({ requestFile, reason }, { ...optional, writeFile, schedule });
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
