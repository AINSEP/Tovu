import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { newShareIdentity, SHARE_FILE, SHARE_TOKEN, SiteShareRegistry } from "../share-registry.js";

/**
 * @file Input guards of the private share catalog (Stryker lane L14: `share-registry.ts` 69.3 %, the
 * id/token/file regex anchors and both INVALID_INPUT throws were removable, AP4/AP7). A share id or
 * token is joined into a file path under the catalog directory, so a value with junk before or after
 * the hex must be refused BEFORE any file is created.
 */

const ID = "0123abcd-0123-4567-89ab-0123456789ab";
const TOKEN = "a".repeat(64);

function registry(t: TestContext): { reg: SiteShareRegistry; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-share-reg-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { reg: new SiteShareRegistry({ directory: path.join(dir, "shares") }), dir: path.join(dir, "shares") };
}

const refused = (message: string) => (e: unknown) => (e as { code?: string }).code === "INVALID_INPUT" && (e as Error).message === message;

test("SHARE_TOKEN: exactly 64 lowercase hex chars, anchored both ends", () => {
  const cases: Array<[string, boolean]> = [
    [TOKEN, true], ["0123456789abcdef".repeat(4), true],
    ["a".repeat(63), false], ["a".repeat(65), false], [`x${TOKEN}`, false], [`${TOKEN}\n`, false], ["A".repeat(64), false], ["g".repeat(64), false], ["", false],
  ];
  for (const [token, ok] of cases) assert.equal(SHARE_TOKEN.test(token), ok, JSON.stringify(token));
});

test("SHARE_FILE: '<slug>.tovu.zip' with a 1-80 char lowercase slug, anchored both ends", () => {
  const cases: Array<[string, boolean]> = [
    ["a.tovu.zip", true], ["my-site-2.tovu.zip", true], [`${"a".repeat(80)}.tovu.zip`, true],
    [`${"a".repeat(81)}.tovu.zip`, false], ["-a.tovu.zip", false], ["A.tovu.zip", false], ["a.tovu.zip.exe", false], ["a.tovu.zip\n", false],
    ["../a.tovu.zip", false], ["a.zip", false], [".tovu.zip", false],
  ];
  for (const [file, ok] of cases) assert.equal(SHARE_FILE.test(file), ok, JSON.stringify(file));
});

test("artifactPath / reserveToken: a share id with leading or trailing junk is refused before anything is written", async (t) => {
  const { reg, dir } = registry(t);
  for (const shareId of [`x${ID}`, `${ID}x`, `${ID}\n`, "../../etc/passwd", "", ID.toUpperCase()]) {
    assert.throws(() => reg.artifactPath({ shareId }), refused("Invalid shareId."), JSON.stringify(shareId));
    await assert.rejects(reg.reserveToken({ token: TOKEN, shareId }), refused("Invalid shareId."), JSON.stringify(shareId));
  }
  assert.equal(fs.existsSync(dir), false, "no refused input created the catalog directory");
  assert.equal(reg.artifactPath({ shareId: ID }), path.join(dir, `${ID}.tovu.zip`));
});

test("reserveToken: a malformed token is refused before the id is even checked or anything is written", async (t) => {
  const { reg, dir } = registry(t);
  for (const token of [`${TOKEN}0`, `../${TOKEN}`, TOKEN.toUpperCase(), ""]) {
    await assert.rejects(reg.reserveToken({ token, shareId: "not-an-id" }), refused("Invalid share token."), JSON.stringify(token));
  }
  assert.equal(fs.existsSync(dir), false);
});

test("reserveToken: the same (token, id) pair is idempotent; the token for a different id is refused as TOKEN_EXISTS; files are private", async (t) => {
  const { reg, dir } = registry(t);
  await reg.reserveToken({ token: TOKEN, shareId: ID });
  await reg.reserveToken({ token: TOKEN, shareId: ID });
  await assert.rejects(reg.reserveToken({ token: TOKEN, shareId: ID.replace("0123abcd", "ffffffff") }), (e: unknown) => (e as { code?: string }).code === "TOKEN_EXISTS");
  assert.equal(fs.statSync(path.join(dir, `${TOKEN}.token`)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
});

test("newShareIdentity mints an id and token that pass their own guards, fresh each call", () => {
  const a = newShareIdentity({});
  const b = newShareIdentity({});
  assert.ok(SHARE_TOKEN.test(a.token));
  assert.match(a.shareId, /^[0-9a-f-]{36}$/);
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.shareId, b.shareId);
});
