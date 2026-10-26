import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";

import { SiteShareRegistry, newShareIdentity, type SiteShareRecord } from "#src/features/site-backup/share-registry";
import { receiveSiteShareArtifact, revokeSiteShare } from "#src/features/site-backup/share-service";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerPublicShareRoutes } from "../site-share.js";

/**
 * @file Public `/_share/:token/:file` download route over a real registry directory whose
 * `findToken` lookup is replaced by a hand-written answer, so each delivery outcome (served,
 * unreadable artifact, foreign storage, lookup failure, client abort) is reached directly.
 */

const SHARE_ID = "00000000-0000-4000-8000-000000000001";

function record(overrides: Partial<SiteShareRecord> = {}): SiteShareRecord {
  return {
    shareId: SHARE_ID, token: "a".repeat(16), site: "main", file: "main.tovu.zip", bytes: 3, sha256: "0".repeat(64),
    url: null, status: "active", createdAt: "2026-10-21T00:00:00.000Z", revokedAt: null, ...overrides,
  };
}

class AnsweringRegistry extends SiteShareRegistry {
  constructor(directory: string, private readonly answer: () => Promise<SiteShareRecord | null>) { super({ directory }); }
  override async findToken(): Promise<SiteShareRecord | null> { return this.answer(); }
}

function shareDir(t: import("node:test").TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-site-share-route-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function serve(t: import("node:test").TestContext, registry?: SiteShareRegistry): Promise<string> {
  const app = express();
  registerPublicShareRoutes({ app, registry });
  return startTestServer(app, t);
}

const DOWNLOAD = `/_share/${"a".repeat(16)}/main.tovu.zip`;

test("a found share streams its archive as a no-store attachment", async (t) => {
  const dir = shareDir(t);
  writeFileSync(path.join(dir, `${SHARE_ID}.tovu.zip`), "zip");
  const base = await serve(t, new AnsweringRegistry(dir, async () => record({ storage: { provider: "tovu-server", key: "k" } })));
  const res = await fetch(base + DOWNLOAD);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="main.tovu.zip"');
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(await res.text(), "zip");
});

test("no registry, an unknown token, or a share hosted by another provider are all a plain 404", async (t) => {
  const dir = shareDir(t);
  writeFileSync(path.join(dir, `${SHARE_ID}.tovu.zip`), "zip");
  for (const registry of [undefined, new AnsweringRegistry(dir, async () => null), new AnsweringRegistry(dir, async () => record({ storage: { provider: "s3", key: "k" } }))]) {
    const res = await fetch((await serve(t, registry)) + DOWNLOAD);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("content-disposition"), null);
    assert.equal(res.headers.get("cache-control"), "no-store");
  }
});

test("a registry lookup failure and an unreadable archive answer 404 without leaking the cause", async (t) => {
  const dir = shareDir(t);
  mkdirSync(path.join(dir, `${SHARE_ID}.tovu.zip`));
  const failing = await fetch((await serve(t, new AnsweringRegistry(dir, async () => { throw new Error("metadata unreadable"); }))) + DOWNLOAD);
  assert.equal(failing.status, 404);
  assert.doesNotMatch(await failing.text(), /metadata unreadable/);
  const directory = await fetch((await serve(t, new AnsweringRegistry(dir, async () => record()))) + DOWNLOAD);
  assert.equal(directory.status, 404);
});

test("a client that aborts mid-download leaves the server serving the next request", async (t) => {
  const dir = shareDir(t);
  writeFileSync(path.join(dir, `${SHARE_ID}.tovu.zip`), Buffer.alloc(32 * 1024 * 1024, 1));
  const base = await serve(t, new AnsweringRegistry(dir, async () => record()));
  await new Promise<void>((resolve, reject) => {
    const req = request(base + DOWNLOAD, (res) => {
      assert.equal(res.statusCode, 200);
      res.once("data", () => { req.destroy(); resolve(); });
    });
    req.on("error", (error) => { if ((error as NodeJS.ErrnoException).code !== "ECONNRESET") reject(error); });
    req.end();
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const next = await fetch(base + DOWNLOAD, { method: "HEAD" });
  assert.equal(next.status, 200);
});

test("any other path under /_share is a no-store 404 that never reaches the registry", async (t) => {
  let asked = 0;
  const base = await serve(t, new AnsweringRegistry(shareDir(t), async () => { asked += 1; return record(); }));
  for (const tail of ["", "/only-a-token", `/${"a".repeat(16)}/main.tovu.zip/extra`]) {
    const res = await fetch(`${base}/_share${tail}`);
    assert.equal(res.status, 404, tail);
    assert.equal(res.headers.get("cache-control"), "no-store", tail);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", tail);
  }
  assert.equal(asked, 0);
});

test("a real registry serves a minted 16-letter link and 404s a 64-hex link even when its files remain", async (t) => {
  const dir = shareDir(t);
  const registry = new SiteShareRegistry({ directory: dir });
  const { token } = newShareIdentity({});
  await receiveSiteShareArtifact({ registry, site: "main", token, file: "main.tovu.zip", archive: Buffer.from("PK\u0003\u0004zip") });
  const old = "0f".repeat(32);
  writeFileSync(path.join(dir, `${old}.token`), SHARE_ID);
  writeFileSync(path.join(dir, `${SHARE_ID}.json`), JSON.stringify(record({ token: old })));
  writeFileSync(path.join(dir, `${SHARE_ID}.tovu.zip`), "zip");
  const base = await serve(t, registry);
  assert.equal((await fetch(`${base}/_share/${token}/main.tovu.zip`)).status, 200);
  const legacy = await fetch(`${base}/_share/${old}/main.tovu.zip`);
  assert.equal(legacy.status, 404);
  assert.equal(legacy.headers.get("cache-control"), "no-store");
});

test("an old 64-hex share still revokes cleanly and deletes its ZIP, and its link stays a 404", async (t) => {
  // Owner 2026-10-25: no 64-hex SERVING, but rows minted before the switch must still be cleanable.
  const dir = shareDir(t);
  const registry = new SiteShareRegistry({ directory: dir });
  const old = "0f".repeat(32);
  writeFileSync(path.join(dir, `${old}.token`), SHARE_ID);
  writeFileSync(path.join(dir, `${SHARE_ID}.json`), JSON.stringify(record({ token: old })));
  writeFileSync(path.join(dir, `${SHARE_ID}.tovu.zip`), "zip");
  const revoked = await revokeSiteShare({ registry, site: "main", shareId: SHARE_ID });
  assert.equal(revoked.status, "revoked");
  assert.equal((await registry.get({ shareId: SHARE_ID }))?.status, "revoked");
  assert.equal(existsSync(path.join(dir, `${SHARE_ID}.tovu.zip`)), false);
  const base = await serve(t, registry);
  assert.equal((await fetch(`${base}/_share/${old}/main.tovu.zip`)).status, 404);
});
