import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

/**
 * @file `installUnhandledRejectionGuard` — the process-level half of the 2026-08-16 crash fix (see
 * `process-error-guards.ts`'s own header for the full incident: an unhandled async rejection
 * anywhere beneath an Express 4 route handler used to take down the ENTIRE server process, not just
 * the one request that triggered it).
 *
 * Runs the fixture (`fixtures/unhandled-rejection-child.ts`) as a genuine, separate child process
 * rather than firing the rejection in-process — see that fixture's own header for why: `node:test`
 * installs its own `unhandledRejection` tracking that intercepts (and auto-fails the active test on)
 * a real unhandled rejection regardless of any other listener also handling it, which makes the test
 * harness itself unable to observe Node's real default behavior. A child process has no such
 * interference, so its exit code and stdout are honest evidence of whether the PROCESS survived —
 * not just whether some callback happened to run.
 */

const execFileAsync = promisify(execFile);
const FIXTURE_PATH = path.join(import.meta.dirname, "fixtures", "unhandled-rejection-child.ts");

async function runFixture(mode: "--with-guard" | "--without-guard"): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", FIXTURE_PATH, mode]);
    return { code: 0, stdout };
  } catch (err) {
    const failure = err as { code?: number; stdout?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "" };
  }
}

test("negative control: without the guard, an unhandled rejection really does kill the process before any later work runs — proves the fixture (and Node's default behavior) is real, not a false positive for the next test", async () => {
  const { code, stdout } = await runFixture("--without-guard");
  assert.notEqual(code, 0, "Node's default `--unhandled-rejections` behavior must terminate a process with no listener registered");
  assert.equal(stdout.includes("STILL_ALIVE"), false, "the deferred `setTimeout` callback must never run — the process ended before it could fire");
});

test("installUnhandledRejectionGuard: with the guard installed, the SAME unhandled rejection is logged instead, and the process survives to run later work", async () => {
  const { code, stdout } = await runFixture("--with-guard");
  assert.equal(code, 0, "the process must exit cleanly, not be terminated by the rejection");
  assert.equal(stdout.includes("STILL_ALIVE"), true, "the deferred `setTimeout` callback firing is direct proof the process was still alive well after the rejection — a dead process cannot print this");
});
