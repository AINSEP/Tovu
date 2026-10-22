import assert from "node:assert/strict";
import test from "node:test";
import { readProcessStart, verifyAttemptChildDead } from "../attempt-process-identity.js";

/**
 * @file `readProcessStart` against the real `ps`: the live test process has a readable OS start
 * identity, and a PID that does not exist reads as `null` (ps exits 1 — "no such process"), which
 * `verifyAttemptChildDead` treats as proof the old child is gone.
 */

test("readProcessStart reads a stable, non-empty OS start identity for a live process", async () => {
  const first = await readProcessStart({ pid: process.pid }, {});
  assert.equal(typeof first, "string");
  assert.match(first!, /\d{2}:\d{2}:\d{2}/);
  assert.equal(await readProcessStart({ pid: process.pid }, {}), first);
  assert.equal(await verifyAttemptChildDead({ pid: process.pid, startedAt: first! }), false);
});

test("readProcessStart answers null for a PID with no process, so the child is proven dead", async () => {
  const unusedPid = 2 ** 22 + 12345; // above Linux's pid_max ceiling: never a live process
  assert.equal(await readProcessStart({ pid: unusedPid }, {}), null);
  assert.equal(await verifyAttemptChildDead({ pid: unusedPid, startedAt: "anything" }), true);
});

test("readProcessStart rejects when ps itself fails (not ps's exit-1 'no such process'), leaving the identity uncertain", async () => {
  const failure = Object.assign(new Error("spawn ps ENOENT"), { code: "ENOENT" });
  const calls: unknown[][] = [];
  const exec = ((file: string, args: string[], _options: unknown, callback: (error: unknown, stdout: string) => void) => {
    calls.push([file, args]);
    callback(failure, "");
  }) as never;
  await assert.rejects(readProcessStart({ pid: 4242 }, { exec }), failure);
  assert.deepEqual(calls, [["ps", ["-o", "lstart=", "-p", "4242"]]]);
});
