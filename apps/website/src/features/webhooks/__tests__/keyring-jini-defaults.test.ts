import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvOrFileKeyring, generateFileSiteKey } from "../keyring.env.js";

/** Host source policy is read-only; generation belongs to an explicit writer. */
test("readers refuse missing files, reuse an explicit key and never mint", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "host-keyring-policy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const input = { workspaceId: "ws", purpose: "sealer", info: "v1" };
  const keyFilePath = join(dir, "site-key.hex");
  const sources = [{ kind: "per-site-file" as const, path: keyFilePath }];
  const keyring = new EnvOrFileKeyring({ sources }, { env: () => ({}) });
  await assert.rejects(keyring.derive(input), /no site key/);
  assert.equal(existsSync(keyFilePath), false);
  generateFileSiteKey({ keyFilePath });
  const before = readFileSync(keyFilePath, "utf8");
  const secret = await keyring.derive(input);
  assert.deepEqual(await new EnvOrFileKeyring({ sources }, { env: () => ({}) }).derive(input), secret);
  assert.equal(readFileSync(keyFilePath, "utf8"), before);
  await assert.rejects(new EnvOrFileKeyring({ sources: [{ kind: "env" }] }, { env: () => ({}) }).derive(input), /no site key/);
});
