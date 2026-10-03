import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvOrFileKeyring } from "../keyring.env.js";

/** The host keeps legacy defaults while Jini requires explicit source permissions. */
test("host default still generates and reuses a file; explicit generation refusal still writes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "host-keyring-policy-"));
  const envVarName = "TOVU_TEST_KEYRING_JINI_FLAGS";
  const original = process.env[envVarName];
  delete process.env[envVarName];
  try {
    const input = { workspaceId: "ws", purpose: "sealer", info: "v1" };
    const keyFilePath = join(dir, "default.hex");
    const secret = await new EnvOrFileKeyring({ envVarName, keyFilePath }).derive(input);
    assert.match(readFileSync(keyFilePath, "utf8"), /^[a-f0-9]{64}$/);
    assert.deepEqual(await new EnvOrFileKeyring({ envVarName, keyFilePath }).derive(input), secret);
    const refusedPath = join(dir, "never.hex");
    await assert.rejects(new EnvOrFileKeyring({ envVarName, keyFilePath: refusedPath, allowFileAutoGenerate: false }).derive(input), /does not auto-generate/);
    assert.equal(existsSync(refusedPath), false);
    await assert.rejects(new EnvOrFileKeyring({ envVarName, keyFilePath, allowFileFallback: false }).derive(input), /allowFileFallback is disabled/);
  } finally {
    if (original === undefined) delete process.env[envVarName]; else process.env[envVarName] = original;
    rmSync(dir, { recursive: true, force: true });
  }
});
