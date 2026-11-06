/**
 * @file Runs `tovu import-local` for the Import page: a .tovu.zip or share link becomes a new site
 * with no site running. A child rather than an import of the importer, so main never holds an
 * archive's bytes (the verifier buffers up to 300 MiB) and the code it runs is the same code the
 * packaged app already ships for `tovu serve`.
 */
import { spawn as nodeSpawn } from "node:child_process";
import type { Writable } from "node:stream";
import { buildCliEnv, buildCliSpawnPlan, parseCliErrorLine } from "./tovu-server.ts";

/** The importer's own deadlines are five minutes to verify and two to restore. */
const IMPORT_TIMEOUT_MS = 8 * 60_000;
/** Enough for the one result line and an error line; the rest of a noisy child is not kept. */
const MAX_OUTPUT_CHARS = 64 * 1024;

export type SiteArchiveSource = { file: string } | { url: string };
export interface ImportedSiteArchive { dir: string; name: string; siteId: string; warnings: readonly string[] }

interface ImportChild {
  stdin: Writable | null;
  stdout: NodeJS.ReadableStream & { setEncoding(encoding: string): unknown };
  stderr: NodeJS.ReadableStream & { setEncoding(encoding: string): unknown };
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "exit", listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}
type ImportSpawn = (command: string, args: string[], options: { env: NodeJS.ProcessEnv; stdio: ["pipe", "pipe", "pipe"] }) => ImportChild;

const keepTail = ({ text }: { text: string }) => (text.length > MAX_OUTPUT_CHARS ? text.slice(-MAX_OUTPUT_CHARS) : text);

/**
 * @param required.source travels over stdin: a share link's token must not reach the process list.
 * @param required.repoRoot,required.cliMode see `buildCliSpawnPlan`.
 * @returns the new site's folder and identity, plus the importer's notices.
 * @throws {Error} carrying the importer's own sentence, or plain words when the child died without one.
 * @complexity One child process; O(1) memory here, output capped at {@link MAX_OUTPUT_CHARS}.
 */
export function importSiteArchive(
  { source, repoRoot, cliMode }: { source: SiteArchiveSource; repoRoot: string; cliMode?: "source" | "compiled" },
  { spawnFn = nodeSpawn as unknown as ImportSpawn, baseEnv, timeoutMs = IMPORT_TIMEOUT_MS }: { spawnFn?: ImportSpawn; baseEnv?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<ImportedSiteArchive> {
  const plan = buildCliSpawnPlan({ repoRoot, cliMode, cliArgs: ["import-local"] });
  const env = buildCliEnv({ baseEnv });
  // The importer mints the new owner itself; no deployment credential may enter this child.
  delete env.TOVU_ADMIN_PASSWORD;
  delete env.TOVU_ADMIN_USER;
  const child = spawnFn(plan.command, plan.args, { env, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin?.on("error", () => { /* A child that exits early reports through its exit code below. */ });
  child.stdin?.end(JSON.stringify(source));
  return new Promise((resolve, reject) => {
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = keepTail({ text: stdout + chunk }); });
    child.stderr.on("data", (chunk: string) => { stderr = keepTail({ text: stderr + chunk }); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) { resolve(parseResult({ stdout })); return; }
      reject(new Error(failureMessage({ stderr, code, timedOut })));
    });
  });
}

function failureMessage({ stderr, code, timedOut }: { stderr: string; code: number | null; timedOut: boolean }): string {
  if (timedOut) return "The import took too long and was stopped. No website was created. Try again, or use a smaller archive.";
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
