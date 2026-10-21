import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { DirectoryRunningRecord } from "@jini-ai/platform/fs";
import { createSitesWorkspace } from "../../sites-home.js";
import { claimSiteRunning, readSiteRunning, runningSiteUrl } from "../../site-running.js";

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

test("a starting claim refuses a second app with a wait message, and ready records the port", (t) => {
  const { dir, workspace } = fixture(t);
  const lease = claimSiteRunning({ dir, app: "Web" }, { workspace });
  try {
    assert.throws(() => claimSiteRunning({ dir, app: "Desktop" }, { workspace }), {
      message: "Running in Web (starting). Wait for this site to finish starting.",
    });
    assert.equal(readSiteRunning({ dir }, { workspace })?.scheme, "http", "http is the default scheme");
    lease.ready({ port: 3001 });
    assert.equal(readSiteRunning({ dir }, { workspace })?.port, 3001);
    assert.throws(() => claimSiteRunning({ dir, app: "Desktop" }, { workspace }), {
      message: "Running in Web (port 3001). http://localhost:3001/admin/",
    });
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
