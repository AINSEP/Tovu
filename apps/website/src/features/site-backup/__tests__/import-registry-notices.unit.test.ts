/**
 * Pins the notices the import registry hands to Jini's durable JSON store. The lock-timeout notice
 * is only rendered by Jini when a store lock times out, which no registry operation reaches, so the
 * wording is captured at the wiring boundary instead of through a real lock race.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { leaveSavedKeysOut } from "@jini-ai/devops/backup/site/saved-keys";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import * as platformFs from "@jini-ai/platform/fs";

test("the production import registry wires the Site imports prefix and busy lock-timeout copy", async t => {
  const stores: Pick<Parameters<typeof platformFs.createDurableJsonFile>[0], "filePath" | "notices">[] = [];
  t.mock.module("@jini-ai/platform/fs", {
    namedExports: {
      ...platformFs,
      createDurableJsonFile: (required: Parameters<typeof platformFs.createDurableJsonFile>[0]) => {
        stores.push({ filePath: required.filePath, notices: required.notices });
        return platformFs.createDurableJsonFile(required);
      },
    },
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "import-registry-notices-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const workspace = createSitesWorkspace({}, { homeDir: directory, cwd: directory, appDataDir: directory, env: { TOVU_SITES_HOME: path.join(directory, "sites") } });
  const { composeSiteImportBackend } = await import("#src/server/runtime/composition/site-import-backend");
  const backend = composeSiteImportBackend({ workspaceId: "ws", workspace, savedKeys: { restore: leaveSavedKeysOut },
    startSite: async () => assert.fail("upload must not start a site"),
  });
  const { uploadId } = await backend.upload({ principalId: "owner", archive: Buffer.from("staged upload") });
  const uploadStores = stores.filter(store => path.basename(store.filePath) === `${uploadId}.upload.json`);
  const notice = uploadStores[0]?.notices;
  assert.deepEqual({ count: uploadStores.length, prefix: notice?.prefix, lockTimeout: notice?.lockTimeout({ lockPath: path.join(directory, "x.json.lock"), waitMs: 5000 }) },
    { count: 1, prefix: "Site imports", lockTimeout: "Import registry is busy." });
});
