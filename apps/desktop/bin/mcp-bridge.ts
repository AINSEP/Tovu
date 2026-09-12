#!/usr/bin/env node
/**
 * @file The desktop shell's MCP server, as a standalone stdio process.
 *
 * The assistant reaches shell-owned capabilities the same way it reaches any third party's: as an
 * external MCP server, federated by `apps/website`'s `mcp-federation/` under its default-deny trust
 * tier. That choice is what makes this file so small. There is no Electron here, no `ipcMain`, no
 * long-lived helper and no window: the agent daemon spawns this script when it connects, speaks
 * JSON-RPC over the pipe, and kills it on close. Nothing to supervise, nothing to keep alive, and
 * the shell's own process is not on the path at all.
 *
 * **Everything this process knows arrives on argv, never in the environment.** That is forced, not
 * stylistic: `mcp-federation/adapter.stdio.ts:251-255,339` spawns an MCP child with the environment
 * REPLACED — only `PATH`, `HOME` and `TMPDIR` survive from the daemon — so `TOVU_DESKTOP_USER_DATA_DIR`
 * cannot reach here that way. The alternative, putting it in the stored connection's own `env` block,
 * would route a plain directory path through `external-mcp-store.ts`'s credential sealing
 * (`:1380-1391`) and make registration fail with `SECRET_STORE_UNCONFIGURED` on any site without a
 * keyring root key. Argv is stored plaintext, needs no key, and is visible in the row for review.
 *
 * The same env replacement is why the shell does not name this file as the connection's `command`
 * directly: the command would have to be Electron's binary, and `ELECTRON_RUN_AS_NODE=1` does not
 * survive either, so it would launch a GUI app instead of Node. `sites-mcp-registration.ts`
 * writes a tiny `/bin/sh` launcher that sets that variable itself and execs this script.
 *
 * ## Three rules this file exists to keep
 *
 * 1. **stdout is the protocol and carries nothing else.** One JSON object per line, no banners, no
 *    logs, no `console.log` anywhere in this process's reachable code. A stray byte on stdout
 *    desynchronizes the client's line framing.
 * 2. **stderr is diagnostics and is never parsed.** The daemon drains and discards it
 *    (`adapter.stdio.ts:300-301`), so it is safe to write to and useless to depend on.
 * 3. **One bad line must not end the server.** A message that does not parse is reported to stderr
 *    and skipped. Exiting would take out the whole connection — including the tools that work — on
 *    behalf of one malformed request.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { sitesFilePath } from "../src/tracked-sites.ts";
import { handleSitesMcpRequest } from "../src/sites-mcp-server.ts";
import type { ToolContext } from "../src/sites-mcp-tools.ts";

/**
 * Cap on one inbound line. A client streaming an unterminated line past this has already lost the
 * framing, so the buffer is dropped rather than grown — the same decision, for the same reason, that
 * `adapter.stdio.ts:281-288` makes in the other direction.
 */
const MAX_INBOUND_LINE_BYTES = 1_000_000;

/** How long a file-manager reveal may take before it is reported as failed. Generous: the first
 *  `open` on a cold Finder is not instant, and there is no cost to waiting. */
const REVEAL_TIMEOUT_MS = 10_000;

/** One platform's "show me this folder" command: the argv0 and its arguments, never a shell string
 *  — see {@link revealPath}. */
type RevealCommandBuilder = (target: string) => [string, string[]];

/**
 * The per-platform "show me this folder" command.
 *
 * A table rather than a conditional so an unsupported platform is a clear refusal naming itself
 * instead of a silent no-op — and so the argv is visible per platform, since every one of these
 * receives an operator's path as an argument.
 *
 * No shell is involved anywhere: {@link revealPath} uses `spawn` with an argv array, so a path
 * containing spaces, quotes or a `;` is one argument and can never become a second command. This is
 * the one place in this process where a path reaches an exec boundary, and the path has already been
 * checked against the tracked-projects registry by `reveal_site_folder`'s own handler.
 */
const REVEAL_COMMANDS: Partial<Record<NodeJS.Platform, RevealCommandBuilder>> = Object.freeze({
  darwin: (target) => ["open", ["-R", target]],
  win32: (target) => ["explorer.exe", [`/select,${target}`]],
  linux: (target) => ["xdg-open", [target]],
});

/**
 * Open `target` in the operator's file manager.
 *
 * @throws {Error} on an unsupported platform, a missing file manager, a non-zero exit, or a timeout
 *   — each of which the tool layer turns into a readable tool error rather than a crash.
 * @complexity O(1) beyond the spawned command's own cost.
 */
function revealPath(target: string): Promise<void> {
  const build = REVEAL_COMMANDS[process.platform];
  if (build === undefined) {
    throw new Error(`opening a folder is not supported on ${process.platform}.`);
  }
  const [command, args] = build(target);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`'${command}' did not finish within ${REVEAL_TIMEOUT_MS}ms.`));
    }, REVEAL_TIMEOUT_MS);
    timer.unref();

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`could not run '${command}': ${error.message}`));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`'${command}' exited with code ${String(code)}.`));
    });
  });
}

/**
 * The userData directory this bridge operates on, from argv or — for a developer running this
 * script by hand — the shell's own existing env override.
 *
 * Fails rather than defaulting to the real `~/Library/Application Support/tovu-desktop`. A default
 * would mean a bridge nobody told which registry to use quietly editing the operator's live
 * Projects list, which is exactly the class of accident a required argument prevents. The launcher
 * always passes it.
 *
 * @throws {Error} when neither source supplies one, or the path is not an existing directory.
 * @complexity O(n) in argv length.
 */
function resolveUserDataDir(argv: string[], env: NodeJS.ProcessEnv): string {
  const flagIndex = argv.indexOf("--user-data-dir");
  const fromFlag = flagIndex === -1 ? undefined : argv[flagIndex + 1];
  const raw = (fromFlag ?? env.TOVU_DESKTOP_USER_DATA_DIR ?? "").trim();
  if (raw === "") {
    throw new Error("mcp-bridge: --user-data-dir <path> is required (or set TOVU_DESKTOP_USER_DATA_DIR).");
  }
  const resolved = path.resolve(raw);
  if (!fs.existsSync(resolved)) {
    throw new Error(`mcp-bridge: --user-data-dir ${resolved} does not exist.`);
  }
  return resolved;
}

/** Diagnostics. Deliberately the only output function in this file that is not the protocol — see
 *  this file's rule 2. @complexity O(1). */
function warn(message: string): void {
  process.stderr.write(`mcp-bridge: ${message}\n`);
}

/** {@link serveMcpOverStdio}'s input. */
interface ServeMcpOverStdioInput {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  context: ToolContext;
}

/**
 * Read newline-framed JSON-RPC from `input`, answer on `output`, until the input ends.
 *
 * Serialized on purpose: messages are handled one at a time, in arrival order, and the next line is
 * not dispatched until the previous answer has been written. The tools mutate one JSON file, and two
 * concurrent `add_site_pointer` calls would be a read-modify-write race where the second overwrites
 * the first's row. A queue is the whole mitigation, and it costs nothing at this call rate.
 *
 * @complexity O(n) in bytes received; one handler call per complete line.
 */
function serveMcpOverStdio({ input, output, context }: ServeMcpOverStdioInput): void {
  let buffer = "";
  let pending = Promise.resolve();

  input.setEncoding("utf8");
  input.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_INBOUND_LINE_BYTES) {
      warn(`dropped ${buffer.length} buffered bytes — no newline within the ${MAX_INBOUND_LINE_BYTES}-byte cap`);
      buffer = "";
      return;
    }
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > 0) pending = pending.then(() => answerLine(line, output, context));
      newline = buffer.indexOf("\n");
    }
  });
}

/**
 * Parse, dispatch and answer one line. Never rejects: a thrown handler is reported and the loop goes
 * on (rule 3), because the queue in {@link serveMcpOverStdio} is chained on this promise and one
 * rejection would stop every later message.
 *
 * @complexity O(n) in the line length, plus the handler's own cost.
 */
async function answerLine(line: string, output: NodeJS.WritableStream, context: ToolContext): Promise<void> {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    warn("skipped a line that is not valid JSON");
    return;
  }
  try {
    const response = await handleSitesMcpRequest(message, context);
    if (response !== null) output.write(`${JSON.stringify(response)}\n`);
  } catch (err) {
    warn(`failed to handle '${message?.method}': ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** @complexity O(1) beyond {@link serveMcpOverStdio}. */
function main(): void {
  const userDataDir = resolveUserDataDir(process.argv.slice(2), process.env);
  serveMcpOverStdio({
    input: process.stdin,
    output: process.stdout,
    context: { userDataDir, projectsPath: sitesFilePath(userDataDir), revealPath },
  });
}

/**
 * Run only when this file IS the process, never when a test imports it.
 *
 * Without the guard, importing this module to unit-test {@link resolveUserDataDir} would start a
 * real server on the test runner's own stdin and fail on the missing argument — so the exports below
 * would exist but be untestable, which is the same as not having them.
 */
if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    // A startup fault is fatal and must be LOUD: the daemon's connect attempt fails either way, and
    // the reason is only recoverable from stderr, which is why it is written there before exiting.
    warn(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

export { MAX_INBOUND_LINE_BYTES, REVEAL_COMMANDS, resolveUserDataDir, revealPath, serveMcpOverStdio };
