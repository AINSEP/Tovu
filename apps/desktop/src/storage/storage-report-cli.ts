/**
 * @file P11 ST-18a.T / ST-18b.T — reading the bundled website CLI's `storage` JSON from main.
 *
 * `storage report <dir> --json` (wire authority: website `cli/commands/storage-report.ts`) and
 * `storage capabilities --json` (`{ operations: [...] }`, website `storage-maintenance.ts`). Both
 * are claim-free reads: no DB start, no lease. Only validated, safe numeric fields are projected —
 * the report's paths never leave this module. Anything unexpected is `unknown`, never a guess:
 * a missing capability hides its button, it never defaults to shown.
 */
import type { ChildProcess } from "node:child_process";

export type CliRead = { readonly state: "exited"; readonly code: number; readonly stdout: string } | { readonly state: "failed" };
export type RunCli = (required: { cliArgs: readonly string[] }, optional?: { timeoutMs?: number }) => Promise<CliRead>;
export type SpawnCli = (required: { command: string; args: readonly string[] }) => ChildProcess;

export interface SafeStorageClass { readonly bytes: number | null; readonly files: number }
export interface SafeStorageReport {
  readonly totalBytes: number | null;
  readonly knownBytes: number;
  readonly classes: Readonly<Record<string, SafeStorageClass>>;
}
export type StorageReportRead = { readonly state: "ok"; readonly report: SafeStorageReport } | { readonly state: "unknown" };
export type StorageOperation = "report" | "move" | "clean" | "compact";
export type StorageCapabilities = { readonly state: "ok"; readonly operations: ReadonlySet<StorageOperation> } | { readonly state: "unknown" };

const KNOWN_OPERATIONS: ReadonlySet<string> = new Set(["report", "move", "clean", "compact"]);
const CLASS_NAME = /^[a-z][a-z-]{0,31}$/;

/**
 * Binds `runCli` to a real child: capped stdout, a hard timeout that kills the child, and no
 * stdin. A signal, spawn error, overflow or timeout is `failed`.
 * @param required.planFor the desktop's own spawn plan for a CLI argv (`buildCliSpawnPlan`).
 * @complexity O(stdout bytes), capped by `maxBytes`.
 */
export function bindRunCli(
  { planFor, spawn }: { planFor: (required: { cliArgs: readonly string[] }) => { command: string; args: readonly string[] }; spawn: SpawnCli },
  { maxBytes = 1_048_576 }: { maxBytes?: number } = {},
): RunCli {
  return ({ cliArgs }, { timeoutMs = 20_000 } = {}) => new Promise<CliRead>((resolve) => {
    let child: ChildProcess;
    try { child = spawn(planFor({ cliArgs })); } catch { resolve({ state: "failed" }); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (read: CliRead) => { if (settled) return; settled = true; clearTimeout(timer); resolve(read); };
    const kill = () => { child.kill("SIGKILL"); finish({ state: "failed" }); };
    const timer = setTimeout(kill, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) kill(); else chunks.push(chunk); });
    child.on("error", () => finish({ state: "failed" }));
    child.on("close", (code: number | null) => finish(code === null ? { state: "failed" } : { state: "exited", code, stdout: Buffer.concat(chunks).toString("utf8") }));
  });
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isEstimate = (value: unknown): value is number | null => value === null || isCount(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function projectClasses(raw: unknown): Record<string, SafeStorageClass> | undefined {
  if (!isRecord(raw)) return undefined;
  const classes: Record<string, SafeStorageClass> = {};
  for (const [name, amount] of Object.entries(raw)) {
    if (!CLASS_NAME.test(name) || !isRecord(amount) || !isEstimate(amount.bytes) || !isCount(amount.files)) return undefined;
    classes[name] = { bytes: amount.bytes, files: amount.files };
  }
  return classes;
}

/**
 * Validates one report document and keeps only safe numbers (no paths, no symlink or unknown-path
 * lists). @complexity O(classes).
 */
export function projectStorageReport({ stdout }: { stdout: string }, _optional: Record<string, never> = {}): StorageReportRead {
  let raw: unknown;
  try { raw = JSON.parse(stdout); } catch { return { state: "unknown" }; }
  if (!isRecord(raw) || !isEstimate(raw.totalBytes) || !isCount(raw.knownBytes)) return { state: "unknown" };
  const classes = projectClasses(raw.classes);
  return classes ? { state: "ok", report: { totalBytes: raw.totalBytes, knownBytes: raw.knownBytes, classes } } : { state: "unknown" };
}

/** Strict `{ operations: [...] }` from `storage capabilities --json`; any other shape is unknown. */
export function parseStorageCapabilities({ stdout }: { stdout: string }, _optional: Record<string, never> = {}): StorageCapabilities {
  let raw: unknown;
  try { raw = JSON.parse(stdout); } catch { return { state: "unknown" }; }
  if (!isRecord(raw) || Object.keys(raw).length !== 1 || !Array.isArray(raw.operations)) return { state: "unknown" };
  if (!raw.operations.every((op): op is StorageOperation => typeof op === "string" && KNOWN_OPERATIONS.has(op))) return { state: "unknown" };
  return { state: "ok", operations: new Set(raw.operations) };
}

/**
 * At most `concurrency` report children at once; the rest wait in order. A timeout is `unknown`.
 * @complexity O(1) per call plus the queued wait.
 */
export function bindStorageReports(
  { runCli }: { runCli: RunCli },
  { concurrency = 2, timeoutMs = 20_000 }: { concurrency?: number; timeoutMs?: number } = {},
): (required: { dir: string }) => Promise<StorageReportRead> {
  let running = 0;
  const waiting: Array<() => void> = [];
  // The slot is taken synchronously, and a finishing report hands its slot straight to the next
  // waiter, so `running` can never be over-admitted between a check and an increment.
  const acquire = (): Promise<void> => {
    if (running < concurrency) { running += 1; return Promise.resolve(); }
    return new Promise<void>((resolve) => waiting.push(resolve));
  };
  const release = () => { const next = waiting.shift(); if (next) next(); else running -= 1; };
  return async ({ dir }) => {
    await acquire();
    try {
      const read = await runCli({ cliArgs: ["storage", "report", dir, "--json"] }, { timeoutMs });
      return read.state === "exited" && read.code === 0 ? projectStorageReport({ stdout: read.stdout }) : { state: "unknown" };
    } finally {
      release();
    }
  };
}

/** Reads the bundled CLI's connected storage operations; a failed or odd read is `unknown`. */
export async function readStorageCapabilities({ runCli }: { runCli: RunCli }, _optional: Record<string, never> = {}): Promise<StorageCapabilities> {
  const read = await runCli({ cliArgs: ["storage", "capabilities", "--json"] });
  return read.state === "exited" && read.code === 0 ? parseStorageCapabilities({ stdout: read.stdout }) : { state: "unknown" };
}
