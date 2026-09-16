/**
 * @file Who is listening on a TCP port, for the two dev launchers that need to know.
 *
 * Imported by `development/scripts/dev.mjs` (`npm run dev`'s port preflight, which refuses to start
 * when a required port is held) and `development/scripts/dev-desktop.mjs` (`npm run desktop`, which
 * names the squatter when the admin dev port is held by something that is not an HTTP server it
 * could reuse). `load-repo-root-env.mjs` is the standing precedent for a shared `.mjs` helper
 * between exactly these two scripts — both run under bare `node`, so nothing forces a copy, and a
 * second `lsof -F pc` parser is the kind of drift this repo keeps paying for.
 *
 * Split into a pure parse plus a thin `spawnSync` wrapper so the `-F pc` handling can be tested
 * without an `lsof` on the box (and without a port that happens to be busy on the test machine).
 */
import { spawnSync } from "node:child_process";

/**
 * Parses `lsof -nP -iTCP:<port> -sTCP:LISTEN -F pc` output into pid/command rows.
 *
 * The `-F pc` format emits one field per line, prefixed by its selector: `p<pid>` then `c<command>`
 * for each process. A `p` with no `c` after it is dropped rather than emitted with an undefined
 * command, which would otherwise reach a caller's error message as "PID 41207 (undefined)".
 *
 * @param {string} stdout - raw `lsof -F pc` output.
 * @returns {{pid: string, command: string}[]}
 * @complexity O(n) in lines of output.
 */
export function parseLsofListeners(stdout) {
  const found = [];
  let pid = null;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("c") && pid) {
      found.push({ pid, command: line.slice(1) });
      pid = null;
    }
  }
  return found;
}

/**
 * @param {number} port
 * @returns {{pid: string, command: string}[]} processes listening on `port`; empty when the port is
 *   free, and also when `lsof` is unavailable or errors — callers treat "cannot tell" as "no
 *   conflict to report" rather than refusing to start over a missing tool.
 * @complexity One `lsof` process; O(n) in its output.
 */
export function listenersOn(port) {
  const out = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-F", "pc"], {
    encoding: "utf8",
  });
  if (out.status !== 0 || !out.stdout) return [];
  return parseLsofListeners(out.stdout);
}
