/**
 * @file Runs `tovu import-local` for the Import page: a .tovu.zip or share link becomes a new site
 * with no site running. A child rather than an import of the importer, so main never holds an
 * archive's bytes (the verifier buffers up to 300 MiB) and the code it runs is the same code the
 * packaged app already ships for `tovu serve`.
 */
import { spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Writable } from "node:stream";
import { buildCliEnv, buildCliSpawnPlan, parseCliErrorLine } from "./tovu-server.ts";

/** The importer's own deadlines are five minutes to verify and two to restore. */
const IMPORT_TIMEOUT_MS = 8 * 60_000;
/** Enough for the one result line and an error line; the rest of a noisy child is not kept. */
const MAX_OUTPUT_CHARS = 64 * 1024;
/** How long a child gets to remove its partial site after its stdin closes before it is killed. */
const STOP_GRACE_MS = 5_000;
/** `close` waits for every holder of the pipes, so a grandchild could hold it back forever. */
const CLOSE_AFTER_EXIT_MS = 2_000;

export type SiteArchiveSource = { file: string } | { url: string };
export interface ImportedSiteArchive { dir: string; name: string; siteId: string; warnings: readonly string[] }
/** Why an import was stopped. "cancel" is the person's own choice, so it is not an error. */
export type ImportStopReason = "quit" | "cancel" | "timeout";

interface ImportChild {
  stdin: Writable | null;
  stdout: NodeJS.ReadableStream & { setEncoding(encoding: string): unknown };
  stderr: NodeJS.ReadableStream & { setEncoding(encoding: string): unknown };
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "exit" | "close", listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}
type ImportSpawn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; stdio: ["pipe", "pipe", "pipe"] }) => ImportChild;
interface ChildOptions { spawnFn?: ImportSpawn; baseEnv?: NodeJS.ProcessEnv; timeoutMs?: number; graceMs?: number; closeWaitMs?: number }
interface ChildPlan { repoRoot: string; cliMode?: "source" | "compiled" }

/** Children running right now, so quitting and Cancel can stop them. At most a few per app. */
const running = new Map<ImportChild, (reason: ImportStopReason, graceMs: number) => Promise<void>>();

const STOP_MESSAGES: Record<Exclude<ImportStopReason, "cancel">, string> = {
  quit: "The import was stopped because Tovu was closing. No website was created. Open Tovu and import again.",
  timeout: "The import took too long and was stopped. No website was created. Try again, or use a smaller archive.",
};

/**
 * Stops every running import: closes its stdin (the child then removes its partial site the way any
 * failed import does), waits for it to exit, and kills one that has not after the grace period.
 * Closing stdin rather than signalling works on every platform, and also fires if this app crashes.
 * @complexity O(running children).
 */
export async function stopRunningImports(
  _required: Record<string, never> = {},
  { graceMs = STOP_GRACE_MS, reason = "quit" }: { graceMs?: number; reason?: ImportStopReason } = {},
): Promise<void> {
  await Promise.all([...running.values()].map((stop) => stop(reason, graceMs)));
}

const keepTail = ({ text }: { text: string }) => (text.length > MAX_OUTPUT_CHARS ? text.slice(-MAX_OUTPUT_CHARS) : text);

/**
 * Resolves with the exit code once the child's output is complete: on `close`, or shortly after
 * `exit` when something else still holds the pipes. Reading on `exit` alone can lose the last line.
 */
function childEnded({ child, closeWaitMs }: { child: ImportChild; closeWaitMs: number }): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let afterExit: NodeJS.Timeout | undefined;
    child.once("error", reject);
    child.once("exit", (code) => { afterExit = setTimeout(() => resolve(code), closeWaitMs); });
    child.once("close", (code) => { clearTimeout(afterExit); resolve(code); });
  });
}

/**
 * One `tovu import-local` child, from request line to exit. stdin stays open afterwards: its closing
 * is the child's order to stop.
 * @returns the exit code, the output tails, and why it was stopped, if it was.
 * @throws {Error} the spawn error of a child that could not start.
 * @complexity One child process; O(1) memory here, output capped at {@link MAX_OUTPUT_CHARS}.
 */
async function runImportChild(
  { request, repoRoot, cliMode }: ChildPlan & { request: unknown },
  { spawnFn = nodeSpawn as unknown as ImportSpawn, baseEnv, timeoutMs = IMPORT_TIMEOUT_MS, graceMs = STOP_GRACE_MS, closeWaitMs = CLOSE_AFTER_EXIT_MS }: ChildOptions = {},
): Promise<{ code: number | null; stdout: string; stderr: string; stopReason: ImportStopReason | null }> {
  const plan = buildCliSpawnPlan({ repoRoot, cliMode, cliArgs: ["import-local"] });
  const env = buildCliEnv({ baseEnv });
  // The importer mints the new owner itself; no deployment credential may enter this child.
  delete env.TOVU_ADMIN_PASSWORD;
  delete env.TOVU_ADMIN_USER;
  const child = spawnFn(plan.command, plan.args, { env, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin?.on("error", () => { /* A child that exits early reports through its exit code below. */ });
  child.stdin?.write(`${JSON.stringify(request)}\n`);
  let stdout = "", stderr = "", stopReason: ImportStopReason | null = null;
  let killTimer: NodeJS.Timeout | undefined;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout = keepTail({ text: stdout + chunk }); });
  child.stderr.on("data", (chunk: string) => { stderr = keepTail({ text: stderr + chunk }); });
  const ended = childEnded({ child, closeWaitMs });
  const stop = (reason: ImportStopReason, grace: number) => {
    stopReason ??= reason;
    child.stdin?.end();
    killTimer ??= setTimeout(() => child.kill("SIGKILL"), grace);
    return ended.then(() => undefined, () => undefined);
  };
  running.set(child, stop);
  const deadline = setTimeout(() => void stop("timeout", graceMs), timeoutMs);
  try {
    const code = await ended;
    return { code, stdout, stderr, stopReason };
  } finally {
    clearTimeout(deadline);
    clearTimeout(killTimer);
    running.delete(child);
  }
}

/**
 * @param required.source travels over stdin: a share link's token must not reach the process list.
 * @param required.repoRoot,required.cliMode see `buildCliSpawnPlan`.
 * @returns the new site's folder and identity plus the importer's notices; `null` when the person
 *   cancelled. A child that finished anyway returns its site, because that site exists on disk.
 * @throws {Error} carrying the importer's own sentence, or plain words when the child died without one.
 * @complexity One child process.
 */
export async function importSiteArchive(
  { source, repoRoot, cliMode }: ChildPlan & { source: SiteArchiveSource },
  optional: ChildOptions = {},
): Promise<ImportedSiteArchive | null> {
  const { code, stdout, stderr, stopReason } = await runImportChild({ request: source, repoRoot, cliMode }, optional);
  if (code === 0) return parseResult({ stdout });
  if (stopReason === "cancel") return null;
  throw new Error(stopReason === null ? failureMessage({ stderr, code }) : STOP_MESSAGES[stopReason]);
}

/**
 * At launch: saved history, stages, uploads and database temp folders are checked for cleanup. Starts one child to clean up, and only when something is there, so a clean launch runs
 * nothing. Never fails the launch: leftovers it could not remove are tried again next time.
 * @param required.appData the sites workspace's app-data folder, the one the child resolves too.
 * @complexity O(import-folder + temp-folder entries) to look, plus at most one short child.
 */
export async function tidyInterruptedImports(
  { appData, repoRoot, cliMode }: ChildPlan & { appData: string },
  { readDir = (dir: string) => fs.readdirSync(dir), ...optional }: ChildOptions & { readDir?: (dir: string) => readonly string[] } = {},
): Promise<void> {
  let leftovers = false;
  try { leftovers = readDir(path.join(appData, "site-imports", "local")).some((name) => /\.(json|stage|upload\.zip)$/.test(name)); }
  catch { /* Database temp folders may remain even when the registry folder is missing. */ }
  try {
    leftovers ||= readDir(tmpdir()).some(name => name.startsWith("tovu-import-db-"));
    if (leftovers) await runImportChild({ request: { tidy: true }, repoRoot, cliMode }, optional);
  } catch { /* No folder yet, or a child that could not start: nothing to report at launch. */ }
}

function failureMessage({ stderr, code }: { stderr: string; code: number | null }): string {
  const cliError = parseCliErrorLine(stderr);
  if (cliError?.code === "VALIDATION") return cliError.message;
  const detail = cliError === null ? `exit code ${code}: ${stderr.trim().slice(-500)}` : `${cliError.code}: ${cliError.message}`;
  return `The import stopped before it finished. No website was created. Details: ${detail}`;
}

/** The result is the child's last line: a library logging to stdout first must not break the import. */
function parseResult({ stdout }: { stdout: string }): ImportedSiteArchive {
  const line = stdout.trim().split("\n").at(-1) ?? "";
  try {
    const parsed = JSON.parse(line) as ImportedSiteArchive;
    if (typeof parsed.dir === "string" && typeof parsed.siteId === "string") return { ...parsed, warnings: parsed.warnings ?? [] };
  } catch { /* Reported below with the same words as a wrong shape. */ }
  throw new Error("The import finished but did not report where the new website is. Use Rescan to find it.");
}
