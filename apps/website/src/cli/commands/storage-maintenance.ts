import { existsSync, realpathSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { mintToolErrorId } from "@jini-ai/core/errors/error-id";
import { resolveDirectoryTarget, type DirectoryRunningRecord } from "@jini-ai/platform/fs";
import { createRetentionRunner, type RetentionPassResult, type RetentionPolicy, type RetentionPolicyOutcome, type RetentionRunner } from "@jini-ai/platform/retention";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { resolveSiteDatabasePaths } from "#src/platform/site-dir/site-databases";
import { claimSiteRunning } from "#src/platform/site-dir/site-running";
import { siteRetentionPolicies } from "#src/server/runtime/composition/retention";
import type { CompactionDatabaseName, RestoreConfirmation, RestoreOutcome } from "#src/features/storage/compaction-recovery.types";
import type { StorageReportPaths } from "./storage-report.js";

/**
 * @file `tovu storage clean <dir> [--apply] [--json]` (preview unless `--apply`) and `tovu storage capabilities [--json]`
 * (P11 ST-16, maintenance half). Clean runs the serving root's own retention policies once, on a
 * STOPPED site: claim the maintenance lease → open the existing handles → run one pass → drain →
 * close → release. A running site is refused; its Storage screen owns cleaning while it serves.
 *
 * Why `clean` must not migrate as a side effect: a migration is a one-way schema change that boot owns,
 * with its own pre-migration copy and its own recovery story. Running it from a storage chore would
 * change the site's schema behind the owner's back — possibly under an app version older than the one
 * that last served it — and would write the very bytes (`-wal`, a fresh copy) the owner is trying to
 * free. So clean opens only what already exists, never boots, never seeds, and never migrates.
 */

type Stdout = { write(chunk: string): unknown };
/** The lease a clean holds. An `attached` record means another process owns the site; release is then a no-op. */
export interface StorageMaintenanceLease { readonly attached: DirectoryRunningRecord | null; release(): void }
/** Must take the lease with `purpose: "maintenance"`, so a server starting meanwhile cannot open the databases. */
export type StorageMaintenanceClaim = (required: { dir: string }) => StorageMaintenanceLease;
/** Handles over a stopped site's existing state. Closing them is the last step before the lease is released. */
export interface StoppedSiteHandles { close(): Promise<void> }
/** The ST-7b.T compactor. `undefined` until it ships; `capabilities` then omits `compact`. */
export type CompactStoppedSite = (required: { siteDir: string }, optional?: Record<string, never>) => Promise<{ status: "done" | "partial" }>;
/**
 * The bound ST-7b.T capability: the stopped-site compactor plus the owner's attention decisions. One object, so
 * `compact` is registered and advertised from the same binding that runs it. Absent (the default) until G1–G3 clear.
 */
export interface StorageCompactionBinding {
  readonly compact: CompactStoppedSite;
  readonly resolve: (required: { siteDir: string; confirmation: RestoreConfirmation }) => Promise<RestoreOutcome>;
  readonly resume: (required: { siteDir: string }) => Promise<RestoreOutcome | { readonly status: "nothing-pending" }>;
}
export type StorageCleanReportError = (required: { error: Error; policyId?: string }, optional: Record<string, never>) => { errorId: string };

export interface StorageCleanRequired<H extends StoppedSiteHandles> {
  dir: string;
  claim: StorageMaintenanceClaim;
  /** Opens what already exists — never creates, seeds or migrates. `writable: false` for a dry run. */
  openExisting: (required: { siteDir: string }, optional: { writable: boolean }) => Promise<H>;
  /** The same policy list the serving root builds (ST-6a), over these handles. */
  policyFactory: (required: { handles: H; signal: AbortSignal; reportError: StorageCleanReportError }) => readonly RetentionPolicy[];
  createRunner: (required: { policies: readonly RetentionPolicy[]; reportError: (error: Error, context: { readonly policyId?: string }) => void }) => Pick<RetentionRunner, "runOnce" | "stop">;
  stdout: Stdout;
  reportError: StorageCleanReportError;
}

export type StorageCleanStatus = "done" | "partial" | "running" | "busy" | "error";
/** Exit codes: 0 done, 2 partial (something kept for later), 3 running or busy, 1 error. */
export interface StorageCleanResult { readonly exitCode: 0 | 1 | 2 | 3; readonly status: StorageCleanStatus; readonly dryRun: boolean; readonly policies: readonly RetentionPolicyOutcome[]; readonly message?: string }

export const RUNNING_SITE_MESSAGE = "This website is running; clean it from its Storage screen.";
export const BUSY_SITE_MESSAGE = "This website's storage is already being cleaned; try again when that finishes.";

/**
 * Cleans the stopped website folder `dir` once and prints the outcome (plain lines, or one JSON document).
 * @param optional.dryRun measure only: opens nothing writable and deletes nothing. Defaults to TRUE: owner data is
 *   deleted only when the caller explicitly passes `dryRun: false` (the CLI's `--apply`), never by an unadorned clean.
 * @returns the result whose `exitCode` the CLI exits with.
 * @complexity one retention pass over the policies.
 */
export async function runStorageCleanCommand<H extends StoppedSiteHandles>(
  required: StorageCleanRequired<H>,
  { dryRun = true, json = false }: { dryRun?: boolean; json?: boolean } = {},
): Promise<StorageCleanResult> {
  let lease: StorageMaintenanceLease | undefined;
  let result: StorageCleanResult;
  try {
    const siteDir = resolveDirectoryTarget({ dirArg: required.dir });
    // The lease comes first: until it is held, a server may be starting, and no handle may be opened.
    lease = required.claim({ dir: siteDir });
    result = lease.attached ? refusal({ record: lease.attached, dryRun }) : await cleanUnderLease({ ...required, siteDir }, { dryRun });
  } catch (error) {
    const { errorId } = required.reportError({ error: error instanceof Error ? error : new Error(String(error)) }, {});
    result = { exitCode: 1, status: "error", dryRun, policies: [], message: `Could not clean this website (${errorId}).` };
  } finally {
    // Only an owner releases; an attachment's release belongs to the other process.
    if (lease && !lease.attached) lease.release();
  }
  print({ result, stdout: required.stdout, json });
  return result;
}

function refusal({ record, dryRun }: { record: DirectoryRunningRecord; dryRun: boolean }): StorageCleanResult {
  const busy = record.purpose === "maintenance";
  return { exitCode: 3, status: busy ? "busy" : "running", dryRun, policies: [], message: busy ? BUSY_SITE_MESSAGE : RUNNING_SITE_MESSAGE };
}

/** Open → run → drain → close. Drain and close run even when the pass throws; the caller releases last. */
async function cleanUnderLease<H extends StoppedSiteHandles>(
  required: StorageCleanRequired<H> & { siteDir: string },
  { dryRun }: { dryRun: boolean },
): Promise<StorageCleanResult> {
  const handles = await required.openExisting({ siteDir: required.siteDir }, { writable: !dryRun });
  const controller = new AbortController();
  let runner: Pick<RetentionRunner, "runOnce" | "stop"> | undefined;
  try {
    const reportError = required.reportError;
    runner = required.createRunner({
      policies: required.policyFactory({ handles, signal: controller.signal, reportError }),
      reportError: (error, { policyId }) => { reportError({ error, ...(policyId === undefined ? {} : { policyId }) }, {}); },
    });
    return passResult({ pass: await runner.runOnce({ dryRun }), dryRun });
  } finally {
    try { await runner?.stop(); controller.abort(); } finally { await handles.close(); }
  }
}

function passResult({ pass, dryRun }: { pass: RetentionPassResult; dryRun: boolean }): StorageCleanResult {
  if (pass.status === "stopped") return { exitCode: 2, status: "partial", dryRun, policies: [], message: "The clean stopped before it finished; nothing more was removed." };
  const partial = pass.policies.some(policy => policy.status === "failed");
  return { exitCode: partial ? 2 : 0, status: partial ? "partial" : "done", dryRun, policies: pass.policies };
}

const bytes = (value: number | null) => (value === null ? "an unknown amount" : value < 1024 * 1024 ? `${value} B` : `${(value / (1024 * 1024)).toFixed(1)} MB`);

function outcomeLine({ outcome }: { outcome: RetentionPolicyOutcome }): string {
  if (outcome.status === "measured") return `  ${outcome.id}: could free ${bytes(outcome.measurement.bytes)}${outcome.measurement.items === undefined ? "" : ` (${outcome.measurement.items} item(s))`}`;
  if (outcome.status === "swept") return `  ${outcome.id}: freed ${bytes(outcome.result.freedBytes)}, removed ${outcome.result.removed}`;
  return `  ${outcome.id}: kept for now. ${outcome.message}`;
}

function print({ result, stdout, json }: { result: StorageCleanResult; stdout: Stdout; json: boolean }): void {
  if (json) { stdout.write(`${JSON.stringify(result)}\n`); return; }
  const lines: string[] = [];
  if (result.message) lines.push(result.message);
  if (result.status === "done" || result.status === "partial") {
    if (result.dryRun) lines.push("Nothing was deleted (dry run).");
    else lines.push(result.status === "done" ? "Clean finished." : "Clean finished; some items were kept and will be retried next time.");
    if (result.policies.length === 0 && !result.message) lines.push("  Nothing to clean.");
    for (const outcome of result.policies) lines.push(outcomeLine({ outcome }));
  }
  for (const line of lines) stdout.write(`${line}\n`);
}

/** The storage operations this build can actually run; `compact` only once its port is connected. */
export function storageOperations({ compactStoppedSite }: { compactStoppedSite: CompactStoppedSite | undefined }, _optional: Record<string, never> = {}): readonly string[] {
  return ["report", "move", "clean", ...(compactStoppedSite ? ["compact"] : [])];
}

/** Prints the connected storage operations (the desktop app reads `--json` to decide which buttons to show). */
export function runStorageCapabilitiesCommand(
  { stdout, compactStoppedSite }: { stdout: Stdout; compactStoppedSite: CompactStoppedSite | undefined },
  { json = false }: { json?: boolean } = {},
): readonly string[] {
  const operations = storageOperations({ compactStoppedSite });
  stdout.write(json ? `${JSON.stringify({ operations })}\n` : `Storage operations: ${operations.join(", ")}\n`);
  return operations;
}

/** What `storage compact` was asked to do: convert, finish an interrupted restore, or apply one confirmed decision. */
export interface StorageCompactOptions { readonly resume?: boolean; readonly resolve?: string; readonly database?: string; readonly confirm?: string; readonly json?: boolean }
type CompactReply = { readonly exitCode: 0 | 1 | 2 | 3; readonly body: { readonly status: string; readonly message?: string } };

const CONFIRM_REQUIRED = "A decision needs --database content|chat and --confirm with the marker the storage panel showed; nothing was changed.";

/**
 * `tovu storage compact <dir> [--resume | --resolve restore-copy|keep-current --database <name> --confirm <json>]`.
 * A decision reaches the binding only when it names a known action and database and carries the full confirmation
 * the owner saw (`markerAt`, `recoveryCopyPath`, `mainIdentity`); anything else is refused before any work.
 * @returns the exit code: 0 done, 2 partial, 3 refused because running or busy, 1 refused or failed.
 * @complexity O(1) here; the binding owns the work.
 */
export async function runStorageCompactCommand(
  { dir, binding, stdout }: { dir: string; binding: StorageCompactionBinding; stdout: Stdout },
  options: StorageCompactOptions = {},
): Promise<0 | 1 | 2 | 3> {
  let reply: CompactReply;
  try {
    reply = await compactReply({ siteDir: resolveDirectoryTarget({ dirArg: dir }), binding, options });
  } catch (error) {
    reply = { exitCode: 1, body: { status: "error", message: `Could not compact this website (${error instanceof Error ? error.name : "Error"}).` } };
  }
  stdout.write(options.json === true ? `${JSON.stringify(reply.body)}\n` : `${reply.body.message ?? `Compact ${reply.body.status}.`}\n`);
  return reply.exitCode;
}

async function compactReply({ siteDir, binding, options }: { siteDir: string; binding: StorageCompactionBinding; options: StorageCompactOptions }): Promise<CompactReply> {
  if (options.resolve !== undefined) {
    const confirmation = parseConfirmation({ action: options.resolve, database: options.database, confirm: options.confirm });
    if (confirmation === undefined) return { exitCode: 1, body: { status: "refused", message: CONFIRM_REQUIRED } };
    return restoreReply({ outcome: await binding.resolve({ siteDir, confirmation }) });
  }
  if (options.resume === true) {
    const outcome = await binding.resume({ siteDir });
    return outcome.status === "nothing-pending" ? { exitCode: 0, body: { status: "nothing-pending", message: "No interrupted restore to finish." } } : restoreReply({ outcome });
  }
  const result = await binding.compact({ siteDir });
  return { exitCode: result.status === "done" ? 0 : 2, body: result };
}

function restoreReply({ outcome }: { outcome: RestoreOutcome }): CompactReply {
  if (outcome.status !== "refused") return { exitCode: 0, body: outcome };
  return { exitCode: outcome.reason === "running" || outcome.reason === "busy" ? 3 : 1, body: outcome };
}

const isDatabase = (value: unknown): value is CompactionDatabaseName => value === "content" || value === "chat";

/** The owner's confirmation, rebuilt field by field; `undefined` unless every field is present and well typed. */
function parseConfirmation({ action, database, confirm }: { action: string; database: string | undefined; confirm: string | undefined }): RestoreConfirmation | undefined {
  if ((action !== "restore-copy" && action !== "keep-current") || !isDatabase(database) || confirm === undefined) return undefined;
  let shown: unknown;
  try { shown = JSON.parse(confirm); } catch { return undefined; }
  if (typeof shown !== "object" || shown === null) return undefined;
  const { markerAt, recoveryCopyPath, mainIdentity } = shown as Record<string, unknown>;
  if (typeof markerAt !== "number" || !Number.isFinite(markerAt) || typeof recoveryCopyPath !== "string" || typeof mainIdentity !== "string") return undefined;
  return { action, database, markerAt, recoveryCopyPath, mainIdentity };
}

/** Today's stopped-site handle is the share catalog folder, if this site ever made one; it is never created here. */
export interface StoppedSiteShareHandles extends StoppedSiteHandles { readonly registry: SiteShareRegistry | undefined }

/**
 * Binds the real ports: the serving root's `siteRetentionPolicies`, the platform runner and the share
 * catalog. Exported so a test can run the real composition on a fixture site.
 * @complexity O(1).
 */
export function storageCleanPorts(
  { claim, resolvePaths }: { claim: StorageMaintenanceClaim; resolvePaths: StorageReportPaths },
  _optional: Record<string, never> = {},
): Omit<StorageCleanRequired<StoppedSiteShareHandles>, "dir" | "stdout"> {
  const clock = { now: () => Date.now() };
  return {
    claim,
    // No database is opened, so nothing can migrate. `writable` gates future database handles; the share
    // catalog is plain files, and in a dry run its policy is only ever asked to measure.
    openExisting: async ({ siteDir }) => {
      const { contentDbPath } = resolvePaths({ dir: siteDir }, { reserveIdentity: false });
      const shares = path.resolve(path.dirname(contentDbPath), "ops", "shares");
      const registry = existsSync(shares) ? new SiteShareRegistry({ directory: realpathSync(shares), now: clock.now }) : undefined;
      return { registry, close: async () => {} };
    },
    policyFactory: ({ handles, signal, reportError }) => siteRetentionPolicies({ registry: handles.registry, fs: { stat, unlink }, clock, signal, reportError: (required, optional) => { reportError(required, optional); } }),
    // A CLI pass never calls `start()`, so the runner's timer is never armed; the scheduler is inert on purpose.
    createRunner: ({ policies, reportError }) => createRetentionRunner({ policies, reportError, clock, scheduler: { setInterval: () => undefined, clearInterval: () => {} } }),
    reportError: ({ error, policyId }) => {
      const errorId = mintToolErrorId({ randomHex: ({ bytes: count }) => randomBytes(count).toString("hex") });
      // The raw message can carry owner paths or secret-shaped names: the log keeps the incident id and a
      // redacted diagnostic (error class and errno code) only; the id ties the console line to this record.
      console.error(`[storage-clean]${policyId ? ` ${policyId}` : ""}`, { errorId, diagnostic: redactedDiagnostic({ error }) });
      return { errorId };
    },
  };
}

/**
 * The CLI composition edge for `storage clean`: a maintenance lease (never an address, never `ready`)
 * and the boot-only database resolver, always with `reserveIdentity: false`.
 * @complexity one retention pass.
 */
export async function runStorageCleanCli(
  { dir, stdout }: { dir: string; stdout: Stdout },
  { dryRun = true, json = false }: { dryRun?: boolean; json?: boolean } = {},
): Promise<StorageCleanResult> {
  // The command prints its own refusal; claimSiteRunning's "Using the site already running" line would mislead.
  const claim: StorageMaintenanceClaim = ({ dir: siteDir }) => claimSiteRunning({ dir: siteDir, app: "Web", purpose: "maintenance" }, { log: () => {} });
  return runStorageCleanCommand({ dir, stdout, ...storageCleanPorts({ claim, resolvePaths: resolveSiteDatabasePaths }) }, { dryRun, json });
}

/** The loggable shape of a failure: its class and errno code, never its message (paths, names, secrets). */
function redactedDiagnostic({ error }: { error: Error }, _optional: Record<string, never> = {}): { name: string; code?: string } {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? { name: error.name, code } : { name: error.name };
}
