import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { DirectoryRunningRecord } from "@jini-ai/platform/fs";
import { createSitesWorkspace } from "../../sites-home.js";
import { claimServingSite, claimSiteRunning, readSiteRunning, runningSiteUrl } from "../../site-running.js";

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-running-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = createSitesWorkspace({}, { homeDir: root, env: {} });
  const dir = path.join(root, "website");
  fs.mkdirSync(dir);
  return { root, dir, workspace };
}

function writeSite(dir: string): void {
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Running Site", domain: null, port: null }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "running-id", templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "2026-10-09T00:00:00.000Z" }));
}

test("runningSiteUrl names the admin URL only once a port is bound", () => {
  const record: DirectoryRunningRecord = { app: "Web", port: 0, scheme: "https", pid: 1, token: "t", started: "" };
  assert.equal(runningSiteUrl({ record }), null);
  assert.equal(runningSiteUrl({ record: { ...record, port: 4321 } }), "https://localhost:4321/admin/");
});

test("readSiteRunning reports no record for an idle site, through the default shared workspace too", (t) => {
  const { dir, workspace } = fixture(t);
  assert.equal(readSiteRunning({ dir }, { workspace }), null);
  assert.equal(readSiteRunning({ dir }), null);
});

test("a second app attaches without changing the owner token, and ready records the port", (t) => {
  const { dir, workspace } = fixture(t);
  const lease = claimSiteRunning({ dir, app: "Web" }, { workspace });
  try {
    const starting = claimSiteRunning({ dir, app: "Desktop" }, { workspace });
    assert.equal(starting.attached?.port, 0);
    starting.ready({ port: 4999 }); starting.release();
    assert.equal(readSiteRunning({ dir }, { workspace })?.port, 0, "an attachment cannot publish its own port");
    assert.equal(readSiteRunning({ dir }, { workspace })?.scheme, "http", "http is the default scheme");
    lease.ready({ port: 3001 });
    assert.equal(readSiteRunning({ dir }, { workspace })?.port, 3001);
    const attached = claimSiteRunning({ dir, app: "Desktop" }, { workspace });
    assert.equal(attached.attached?.port, 3001);
    attached.release();
    assert.equal(readSiteRunning({ dir }, { workspace })?.port, 3001, "attachment cannot release the owner's lease");
    assert.deepEqual(workspace.registry({}).list({}), [], "a folder without install-dir markers is never registered");
  } finally { lease.release(); }
  assert.equal(readSiteRunning({ dir }, { workspace }), null, "release ends the lease");
});

test("ready registers an install-dir site and marks it opened", (t) => {
  const { dir, workspace } = fixture(t);
  writeSite(dir);
  const lease = claimSiteRunning({ dir, app: "Desktop", scheme: "https" }, { workspace });
  try {
    lease.ready({ port: 3443 });
    const [entry] = workspace.registry({}).list({});
    assert.equal(entry?.id, "running-id");
    assert.equal(entry?.name, "Running Site");
    assert.equal(entry?.createdBy, "Desktop");
    assert.equal(typeof entry?.lastOpened, "string");
    assert.equal(readSiteRunning({ dir }, { workspace })?.scheme, "https");
  } finally { lease.release(); }
});

test("ready rethrows a site read failure that is not an invalid install dir", (t) => {
  const { dir, workspace } = fixture(t);
  const lease = claimSiteRunning({ dir, app: "Web" }, { workspace, readSite: () => { throw new Error("disk unavailable"); } });
  try {
    assert.throws(() => lease.ready({ port: 3002 }), /disk unavailable/);
  } finally { lease.release(); }
});

test("with the default workspace a claim is exclusive and released", (t) => {
  const { dir } = fixture(t);
  const lease = claimSiteRunning({ dir, app: "Web" });
  try {
    assert.notEqual(readSiteRunning({ dir }), null);
  } finally { lease.release(); }
  assert.equal(readSiteRunning({ dir }), null);
});

test("isHeld is true only for the claiming lease while its token is on the record", (t) => {
  const { root, dir, workspace } = fixture(t);
  const lease = claimSiteRunning({ dir, app: "Web", purpose: "maintenance" }, { workspace });
  const attached = claimSiteRunning({ dir, app: "Desktop" }, { workspace, log: () => {} });
  assert.equal(lease.isHeld(), true);
  assert.equal(attached.isHeld(), false, "an attachment never holds the lease");
  // The record now names another token (a replaced lease): this claim no longer holds it.
  const recordFile = fs.readdirSync(root, { recursive: true }).map((name) => path.join(root, String(name)))
    .find((file) => fs.statSync(file).isFile() && /"purpose":\s*"maintenance"/.test(fs.readFileSync(file, "utf8")));
  assert.ok(recordFile, "the running record is on disk");
  const original = fs.readFileSync(recordFile, "utf8");
  fs.writeFileSync(recordFile, original.replace(/"token":\s*"[^"]+"/, '"token":"someone-else"'));
  assert.equal(lease.isHeld(), false, "token mismatch");
  fs.writeFileSync(recordFile, original);
  assert.equal(lease.isHeld(), true);
  lease.release();
  assert.equal(lease.isHeld(), false, "released");
});

test("server waits for maintenance then starts without a premature DB open", async (t) => {
  const { dir, workspace } = fixture(t);
  const maintenance = claimSiteRunning({ dir, app: "Web", purpose: "maintenance" }, { workspace, log: () => {} });
  t.after(() => maintenance.release());
  const order: string[] = [];
  let elapsed = 0;
  const lease = await claimServingSite({ dir, app: "Web", scheme: "http",
    claim: required => { order.push("claim"); return claimSiteRunning(required, { workspace, log: () => {} }); },
    sleep: async ms => { order.push("wait"); elapsed += ms; maintenance.release(); },
    mono: () => elapsed,
  }, {});
  t.after(() => lease.release());
  assert.equal(lease.attached, null);
  assert.equal(lease.isHeld(), true);
  order.push("open-db");
  assert.deepEqual(order, ["claim", "wait", "claim", "open-db"]);
  assert.equal(elapsed, 500);
  const serve = fs.readFileSync(new URL("../../../../cli/commands/serve.ts", import.meta.url), "utf8");
  const index = fs.readFileSync(new URL("../../../../index.ts", import.meta.url), "utf8");
  assert.match(serve, /const runningLease = await claimServingSite\(/);
  assert.ok(serve.indexOf("await claimServingSite(") < serve.indexOf("await bootSiteDir("));
  assert.match(index, /const runningLease = useMemory \? undefined : await claimServingSite\(/);
  assert.ok(index.indexOf("await claimServingSite(") < index.indexOf("await guardContentDbSchemaOrExit("));
  lease.release();
  const blocked = claimSiteRunning({ dir, app: "Web", purpose: "maintenance" }, { workspace, log: () => {} });
  t.after(() => blocked.release());
  let time = 0;
  await assert.rejects(claimServingSite({ dir, app: "Web", scheme: "http",
    claim: required => claimSiteRunning(required, { workspace, log: () => {} }),
    sleep: async ms => { time += ms; }, mono: () => time,
  }, { timeoutMs: 1000 }), /storage maintenance has not finished/);
  assert.equal(time, 1000);
});

test("boot unaffected when preflight fails", async (t) => {
  const { dir, workspace } = fixture(t);
  const refusal = new Error("unreadable lease");
  let sleeps = 0;
  await assert.rejects(claimServingSite({ dir, app: "Web", scheme: "http",
    claim: () => { throw refusal; }, sleep: async () => { sleeps += 1; }, mono: () => 0,
  }, {}), error => error === refusal);
  assert.equal(sleeps, 0);
  assert.equal(readSiteRunning({ dir }, { workspace }), null);
});
