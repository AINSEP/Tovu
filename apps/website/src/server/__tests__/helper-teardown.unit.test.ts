import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

for (const fault of ["work", "remove", "login", "none"]) {
  test(`site helper closes server and DB and restores fixtures after ${fault === "none" ? "successful boot" : `${fault} failure`}`, async () => {
    // The child is expected to fail on the injected error; its cleanup must still complete.
    const env: NodeJS.ProcessEnv = { ...process.env, TEARDOWN_FAULT: fault };
    delete env.NODE_TEST_CONTEXT;
    const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "--test-timeout=120000",
      fileURLToPath(new URL("./helper-teardown.fixture.ts", import.meta.url))], {
      env, timeout: 15_000,
    }).then(output => ({ ...output, code: 0 }), error => ({ stdout: error.stdout as string, stderr: error.stderr as string, code: error.code }));
    assert.equal(result.code, fault === "none" ? 0 : 1, result.stderr);
    for (const marker of ["server closed", "database closed", "parent removed", "socket removed", "socket env: original"]) {
      assert.ok(result.stdout.includes(marker), `missing ${marker}: ${result.stdout}`);
    }
    assert.ok(result.stdout.indexOf("server closed") < result.stdout.indexOf("database closed"), "HTTP must close before a DB teardown error can skip its hook");
    if (fault === "work") assert.match(result.stdout, /background boot failed/);
    if (fault === "remove") assert.match(result.stdout, /fixture removal failed/);
    if (fault === "login") assert.match(result.stdout, /login failed after listening/);
  });
}
