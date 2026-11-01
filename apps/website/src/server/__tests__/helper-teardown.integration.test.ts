import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Coordinator check: requires loopback listen permission; unit cases exercise the same hook ordering.
test("a rejected boot pass still closes the real HTTP listener and database", async () => {
  const env: NodeJS.ProcessEnv = { ...process.env, TEARDOWN_FAULT: "work", TEARDOWN_REAL_HTTP: "1" };
  delete env.NODE_TEST_CONTEXT;
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=120000",
    fileURLToPath(new URL("./helper-teardown.fixture.ts", import.meta.url))], { env, timeout: 15_000 })
    .then(output => ({ ...output, code: 0 }), error => ({ stdout: error.stdout as string, stderr: error.stderr as string, code: error.code }));
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stdout, /background boot failed/);
  for (const marker of ["server closed", "database closed", "parent removed", "socket removed", "socket env: original"]) {
    assert.ok(result.stdout.includes(marker), `missing ${marker}: ${result.stdout}`);
  }
});
