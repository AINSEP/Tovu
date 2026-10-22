import "../helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createNodeAtomicFilesystem, type AtomicFilesystemPort } from "@jini-ai/platform/fs";

import { initSite } from "../../init-site.js";
import { readTemplate } from "../../read-template.js";
import { runtimeSchemaVersion } from "../../schema-guard.js";
import { resolveSiteDatabasePaths } from "../../site-databases.js";
import { createSitesWorkspace } from "../../sites-home.js";

/** SPEC-003 C-007 / INV-02: unsupported directory flushes preserve a complete install;
 * real I/O failures still reject and remove the partial install. */
function fixture({ t }: { t: TestContext }, _options = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-init-directory-sync-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "Documents"));
  const workspace = createSitesWorkspace({}, {
    homeDir: root, cwd: root, env: {}, sourceRoots: [], appDataDir: path.join(root, "profile"),
  });
  workspace.updateConfig({ patch: { databases: "inSite" } });
  return { root, dir: path.join(root, "site"), workspace };
}

/** Keep real opens, writes, file fsyncs and closes; fail only on an opened directory. */
function directorySyncFailure({ code }: { code: "EPERM" | "EIO" }, _options = {}) {
  const native = createNodeAtomicFilesystem({}, {});
  const calls = { directorySyncs: 0, fileSyncs: 0 };
  const filesystem: AtomicFilesystemPort = {
    ...native,
    sync(required) {
      if (fs.fstatSync(required.descriptor).isDirectory()) {
        calls.directorySyncs += 1;
        throw Object.assign(new Error(`${code}: injected directory fsync failure`), { code });
      }
      native.sync(required);
      calls.fileSyncs += 1;
    },
  };
  return { filesystem, calls };
}

// Windows skips directory fsync entirely; POSIX exercises the unsupported-error fallback
// for the EPERM reported during Windows site creation before Jini's fix.
const directorySyncOptions = { skip: process.platform === "win32" };

test("initSite completes both atomic JSON writes when directory fsync throws EPERM", directorySyncOptions, async (t) => {
  const { dir, workspace } = fixture({ t });
  const { filesystem, calls } = directorySyncFailure({ code: "EPERM" });

  const result = await initSite({ dir, name: "Directory EPERM Site" }, { workspace, filesystem, detectTimeZone: () => "Asia/Tokyo" });

  assert.equal(result.dir, dir);
  assert.match(result.siteId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")), {
    name: "Directory EPERM Site", domain: null, port: null, timezone: "Asia/Tokyo",
  });
  const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8"));
  const { template } = readTemplate({ templateId: "starter" });
  const runtime = runtimeSchemaVersion();
  assert.equal(typeof meta.createdAt, "string");
  assert.equal(new Date(meta.createdAt).toISOString(), meta.createdAt);
  assert.deepEqual(meta, {
    siteId: result.siteId,
    templateId: template.id,
    templateVersion: template.version,
    schemaVersion: runtime.index,
    schemaTag: runtime.tag,
    createdAt: meta.createdAt,
    siteKeyId: result.siteId,
    storage: { kind: "sqlite" },
  });
  const { contentDbPath } = resolveSiteDatabasePaths({ dir, siteId: result.siteId }, { workspace });
  assert.equal(contentDbPath, path.join(dir, "data.nosync", "content.db"));
  assert.ok(fs.statSync(contentDbPath).isFile(), "the content database must stay inside the temporary site");
  assert.ok(calls.directorySyncs >= 2, "both config and metadata must use the injected directory fsync");
  assert.equal(calls.fileSyncs, 2, "both JSON files must still fsync their bytes for real");
});

test("initSite rejects directory fsync EIO and removes the partial install", directorySyncOptions, async (t) => {
  const { dir, workspace } = fixture({ t });
  const { filesystem, calls } = directorySyncFailure({ code: "EIO" });

  await assert.rejects(() => initSite({ dir, name: "Directory EIO Site" }, { workspace, filesystem }), {
    name: "InternalError",
    message: /EIO: injected directory fsync failure/,
  });

  assert.equal(calls.directorySyncs, 1, "the error must come from the config directory flush");
  assert.equal(calls.fileSyncs, 1, "the config bytes must have been flushed before the directory failed");
  assert.equal(fs.existsSync(dir), false, "cleanup must remove the entire partial install");
});
