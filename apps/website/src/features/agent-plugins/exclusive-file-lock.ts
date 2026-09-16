/**
 * @file A cross-process exclusive lock for a single file — closes the race
 * `activation.ts`'s own "Concurrency" header documents as its stated residual: the API server, the
 * agent daemon, and the `agent-plugin:activation` CLI are three separate OS processes that can write
 * one workspace's `activations.json` at the same moment (t91, 2026-09-16; plan
 * `agent-reports/2026-09-16-t91-plan-activations-lock.md` §2).
 *
 * ---------------------------------------------------------------------------
 * Protocol
 * ---------------------------------------------------------------------------
 * A lock is a sibling file (conventionally `<target>.lock`) created with the OS's own exclusive
 * primitive — `open(path, "wx")`, which is `O_CREAT|O_EXCL` on POSIX and `CREATE_NEW` on Windows —
 * holding a small JSON body `{pid, hostname, token, acquiredAt}`. `token` is a fresh UUID per
 * acquisition and is the ONLY thing that proves ownership: a holder never assumes it still owns the
 * lock just because it once created it. See "failure modes" below for why.
 *
 * ---------------------------------------------------------------------------
 * The two stale rules
 * ---------------------------------------------------------------------------
 * A lock is judged stale, and broken, if EITHER holds:
 * (a) its recorded holder is on THIS host and that pid is dead (the liveness probe throws) —
 *     judged at once, no waiting;
 * (b) its mtime is more than `staleAfterMs` old — covers pid reuse, a reboot, a 0-byte body left by
 *     power loss mid-write, and a holder on a different host this process cannot liveness-check.
 *
 * ---------------------------------------------------------------------------
 * Failure modes, and how each is closed
 * ---------------------------------------------------------------------------
 * - A LIVE holder stalls past `staleAfterMs` (laptop sleep, a blocked event loop): another waiter
 *   can judge it stale and break it while the original holder is still mid-write. Mitigation: the
 *   holder re-checks it still owns the lock (`assertHeld`) immediately before its own durable
 *   write, and fails closed if it does not — see `activation.ts`'s `writeActivationsAtomically`.
 * - TWO breakers race to break the same stale lock: mitigated by re-inspecting immediately before
 *   unlinking, and only unlinking if the lock is byte-for-byte unchanged from what was judged stale.
 * - A zombie child still answers a liveness probe until its parent reaps it — the age rule is the
 *   fallback that still recovers a lock left by an unreaped zombie.
 * - Network filesystems: Node's own docs say `O_EXCL` "might not work" over NFS older than v3;
 *   NFSv3+ is fine. A clock skewed more than `staleAfterMs` from the server's mtime clock breaks
 *   locks early — costly (a retryable busy error) but never unsafe (nothing is written twice,
 *   because `assertHeld` still catches it).
 * - Windows: `wx` is atomic there too, and the default liveness probe (`process.kill(pid, 0)`) is
 *   Node's own documented cross-platform check. Opening a file pending deletion throws `EPERM` on
 *   win32; this module treats that as ordinary contention there, same as `EEXIST`. Argued, not
 *   verified under Windows CI (none exists for this repo).
 *
 * ---------------------------------------------------------------------------
 * Scope
 * ---------------------------------------------------------------------------
 * One consumer today (`activation.ts`). Move this to `platform/` if and when a second consumer
 * lands — `features/deployments/export-run.ts` and `static-publish/publish-run.ts` are the noted
 * candidates (same plan, Follow-ups).
 */
import { randomUUID } from "node:crypto";
import { open, unlink, type FileHandle } from "node:fs/promises";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

/** A caller that never overrides `timeoutMs` waits at most this long for a live, healthy holder. */
export const DEFAULT_LOCK_TIMEOUT_MS = 15_000;

/** A lock older than this — by mtime — is judged stale regardless of whether its holder is alive.
 *  Deliberately smaller than {@link DEFAULT_LOCK_TIMEOUT_MS}: a stale lock is always broken before a
 *  well-behaved waiter times out, so a timeout means a live holder stuck past this threshold. */
export const DEFAULT_LOCK_STALE_AFTER_MS = 10_000;

/** The holder identity recorded inside a lock file. */
export interface FileLockHolder {
  readonly pid: number;
  readonly hostname: string;
  readonly token: string;
  readonly acquiredAt: string;
}

/** What {@link withExclusiveFileLock} hands its callback: the lock's own path, and the one
 *  operation a long-running holder needs — proving it still owns the lock right before an
 *  irreversible step (a rename). */
export interface HeldFileLock {
  readonly lockPath: string;
  /** @throws {FileLockLostError} Another process judged this lock stale and removed it. */
  assertHeld(): Promise<void>;
}

export interface ExclusiveFileLockOptions {
  readonly timeoutMs?: number;
  readonly staleAfterMs?: number;
  /** Read PER CALL, not cached — a host can be renamed while a process runs. Defaults to
   *  `os.hostname()`. */
  readonly hostname?: () => string;
  /** Defaults to `process.kill(pid, 0)`; `EPERM` is treated as alive (the process exists, we merely
   *  lack permission to signal it). */
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly onStaleLockRemoved?: (holder: FileLockHolder | undefined) => void;
}

/** No lock could be acquired within `timeoutMs`. A stale lock is always broken before this fires
 *  (see this file's header), so this means a live holder stuck past the stale threshold, or
 *  starvation among waiters. */
export class FileLockTimeoutError extends Error {
  constructor(
    readonly lockPath: string,
    readonly holder: FileLockHolder | undefined,
    readonly waitedMs: number,
  ) {
    super(
      `exclusive-file-lock: timed out after ${Math.round(waitedMs)}ms waiting for ${lockPath}` +
        (holder !== undefined ? ` — held by pid ${holder.pid} on ${holder.hostname} since ${holder.acquiredAt}` : " (holder unknown)"),
    );
    this.name = "FileLockTimeoutError";
  }
}

/** The lock was acquired, but another process judged it stale and removed it before the holder's
 *  own {@link HeldFileLock.assertHeld} check ran — the fail-closed guard against a live holder that
 *  stalled past the stale threshold (this file's header, "failure modes"). */
export class FileLockLostError extends Error {
  constructor(readonly lockPath: string) {
    super(`exclusive-file-lock: lost ownership of ${lockPath} before the critical section finished — another process judged it stale`);
    this.name = "FileLockLostError";
  }
}

/** Whether a failed `open(path, "wx")` means "someone else already holds this lock" rather than a
 *  real fault (a missing parent directory, a permissions error, ...) that must propagate at once
 *  instead of being retried until a misleading timeout. `EPERM` is contention ONLY on win32, where
 *  opening a file pending deletion throws it (argued; not verified under Windows CI).
 *  @complexity O(1). */
export function isContendedLockError(code: string | undefined, platform: NodeJS.Platform): boolean {
  if (code === "EEXIST") return true;
  return code === "EPERM" && platform === "win32";
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** SECURITY: `process.kill(0, …)` and `process.kill(-1, …)` address a whole process GROUP, not one
 *  process — a lock body must never be allowed to steer a liveness check there. @complexity O(1). */
function isValidLockPid(pid: unknown): pid is number {
  return typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0;
}

/** Parses a lock file's body into a {@link FileLockHolder}, or `undefined` for anything that is not
 *  exactly that shape — including a 0-byte file (a partial write, e.g. after power loss) and a body
 *  whose `pid` {@link isValidLockPid} rejects. A malformed body is never a fault: it just means this
 *  lock cannot be liveness-checked, and falls back to the age rule alone.
 *  @complexity O(1) plus the body's own (small, fixed) size. */
function parseLockHolder(raw: string): FileLockHolder | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;

  const candidate = value as Record<string, unknown>;
  if (!isValidLockPid(candidate.pid)) return undefined;
  if (typeof candidate.hostname !== "string" || typeof candidate.token !== "string" || typeof candidate.acquiredAt !== "string") {
    return undefined;
  }
  return { pid: candidate.pid, hostname: candidate.hostname, token: candidate.token, acquiredAt: candidate.acquiredAt };
}

/** One lock file's observed state, read atomically off a single open file descriptor so `raw` and
 *  `mtimeMs`/`ino` always describe the same bytes — never one `stat` plus a separate `readFile`
 *  that could straddle another process's write. */
interface LockSnapshot {
  readonly raw: string;
  readonly holder: FileLockHolder | undefined;
  readonly mtimeMs: number;
  readonly ino: number;
}

/** Reads the lock file's current bytes plus filesystem metadata off ONE handle. `undefined` means
 *  "no lock right now" — either it never existed, it was removed between our failed create and this
 *  read, or (win32 only) it is pending deletion. Any other failure to open or read is a real fault
 *  and propagates.
 *  @complexity One open, one stat, one read, one close. */
async function inspectLockFile(lockPath: string): Promise<LockSnapshot | undefined> {
  let handle: FileHandle;
  try {
    handle = await open(lockPath, "r");
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || isContendedLockError(code, process.platform)) return undefined;
    throw error;
  }
  try {
    const stat = await handle.stat();
    const raw = await handle.readFile("utf8");
    return { raw, holder: parseLockHolder(raw), mtimeMs: stat.mtimeMs, ino: stat.ino };
  } finally {
    await handle.close();
  }
}

interface StaleJudgingOptions {
  readonly staleAfterMs: number;
  readonly hostname: () => string;
  readonly isProcessAlive: (pid: number) => boolean;
}

/** The two stale rules (this file's header): age, or a dead process on our own host. The hostname
 *  comparison guards the liveness probe — a pid recorded on a DIFFERENT host must never be handed
 *  to our own `isProcessAlive`, which only knows about processes on this machine.
 *  @complexity O(1) plus the caller-supplied liveness probe. */
function isStaleLock(snapshot: LockSnapshot, opts: StaleJudgingOptions): boolean {
  if (Date.now() - snapshot.mtimeMs > opts.staleAfterMs) return true;
  const holder = snapshot.holder;
  return holder !== undefined && holder.hostname === opts.hostname() && !opts.isProcessAlive(holder.pid);
}

/** Removes a lock judged stale, but only if it is still, right now, byte-for-byte what was judged —
 *  closing the race between two waiters that both decide the same lock is stale at once. Losing that
 *  race is silent and harmless: the other breaker's removal already cleared the way.
 *  @complexity One more inspect, plus an unlink when unchanged. */
async function removeLockIfUnchanged(
  lockPath: string,
  observed: LockSnapshot,
  onStaleLockRemoved: ((holder: FileLockHolder | undefined) => void) | undefined,
): Promise<void> {
  const current = await inspectLockFile(lockPath);
  if (current === undefined) return;
  if (current.raw !== observed.raw || current.mtimeMs !== observed.mtimeMs || current.ino !== observed.ino) return;

  try {
    await unlink(lockPath);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
  onStaleLockRemoved?.(observed.holder);
}

/** Attempts the one atomic step that can actually win a lock: an exclusive create. `false` means
 *  contended (someone else holds it); any other failure (a missing parent directory, EACCES, ...) is
 *  a real fault and must reach the caller now, not after a misleading wait-then-timeout.
 *  @complexity One open, one write, one close; unlinks its own half-written file on a write failure. */
async function tryCreateLockFile(lockPath: string, token: string, hostname: string): Promise<boolean> {
  let handle: FileHandle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (isContendedLockError(errorCode(error), process.platform)) return false;
    throw error;
  }

  const holder: FileLockHolder = { pid: process.pid, hostname, token, acquiredAt: new Date().toISOString() };
  try {
    await handle.writeFile(JSON.stringify(holder), "utf8");
  } catch (error) {
    await handle.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  return true;
}

/** `5 * 2^attempt` ms, capped at 100ms, times a 0.5-1.0x jitter — spreads out retries under
 *  contention without ever waiting long between them. @complexity O(1). */
function backoffDelay(attempt: number): number {
  return Math.min(5 * 2 ** attempt, 100) * (0.5 + Math.random() / 2);
}

interface AcquireOptions extends StaleJudgingOptions {
  readonly timeoutMs: number;
  readonly onStaleLockRemoved: ((holder: FileLockHolder | undefined) => void) | undefined;
}

/** The acquisition loop: try to create; if contended, inspect what is there; break it if stale;
 *  otherwise wait out the backoff and retry, until `timeoutMs` is spent.
 *  @complexity O(a) in the attempt count until acquired or timed out. */
async function acquireFileLock(lockPath: string, token: string, opts: AcquireOptions): Promise<void> {
  const start = performance.now();
  let attempt = 0;
  for (;;) {
    if (await tryCreateLockFile(lockPath, token, opts.hostname())) return;

    const snapshot = await inspectLockFile(lockPath);
    if (snapshot === undefined) continue; // vanished between our failed create and this read — try again at once

    if (isStaleLock(snapshot, opts)) {
      await removeLockIfUnchanged(lockPath, snapshot, opts.onStaleLockRemoved);
      continue;
    }

    const elapsed = performance.now() - start;
    if (elapsed >= opts.timeoutMs) throw new FileLockTimeoutError(lockPath, snapshot.holder, elapsed);
    await sleep(backoffDelay(attempt++));
  }
}

/** Whether the CURRENT lock at `lockPath` is still the one `token` created — the fail-closed check a
 *  long-running holder makes immediately before an irreversible step. @complexity One inspect. */
async function assertHeldBy(lockPath: string, token: string): Promise<void> {
  const snapshot = await inspectLockFile(lockPath);
  if (snapshot?.holder?.token !== token) throw new FileLockLostError(lockPath);
}

/** Releases the lock — but ONLY if `token` still owns it. A lock this process no longer owns (lost
 *  to a stale-break, or never actually held) must never be unlinked: that would delete a lock a
 *  DIFFERENT holder is now relying on. @complexity One inspect, plus an unlink when owned. */
async function releaseFileLock(lockPath: string, token: string): Promise<void> {
  const snapshot = await inspectLockFile(lockPath);
  if (snapshot?.holder?.token !== token) return;
  try {
    await unlink(lockPath);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but we lack permission to signal it — still alive. Any other error
    // (ESRCH, chiefly) means it is not.
    return errorCode(error) === "EPERM";
  }
}

/**
 * Runs `run` while holding an exclusive, cross-process lock on `lockPath`.
 *
 * @param lockPath - The lock file's own path (a sibling of the file it protects, by convention —
 * see `activation.ts`'s `ACTIVATIONS_LOCK_FILENAME`).
 * @param run - Receives the held lock, chiefly for {@link HeldFileLock.assertHeld}.
 * @throws {FileLockTimeoutError} No lock could be acquired within `timeoutMs`.
 * @returns Whatever `run` returns. Its rejection propagates unchanged; the lock is still released.
 * @complexity {@link acquireFileLock}'s cost, plus `run`'s own.
 */
export async function withExclusiveFileLock<T>(
  lockPath: string,
  run: (lock: HeldFileLock) => Promise<T>,
  options: ExclusiveFileLockOptions = {},
): Promise<T> {
  const token = randomUUID();
  const hostname = options.hostname ?? (() => os.hostname());
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;

  await acquireFileLock(lockPath, token, {
    timeoutMs: options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
    staleAfterMs: options.staleAfterMs ?? DEFAULT_LOCK_STALE_AFTER_MS,
    hostname,
    isProcessAlive,
    onStaleLockRemoved: options.onStaleLockRemoved,
  });

  try {
    return await run({ lockPath, assertHeld: () => assertHeldBy(lockPath, token) });
  } finally {
    await releaseFileLock(lockPath, token);
  }
}
