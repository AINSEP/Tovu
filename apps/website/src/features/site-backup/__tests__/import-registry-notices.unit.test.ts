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
import * as platformFs from "@jini-ai/platform/fs";

test("the registry's store reports a lock timeout as a busy import registry under the Site imports prefix", async t => {
  const notices: platformFs.DurableJsonNotices[] = [];
  t.mock.module("@jini-ai/platform/fs", {
    namedExports: {
      ...platformFs,
      createDurableJsonFile: (required: Parameters<typeof platformFs.createDurableJsonFile>[0]) => {
        notices.push(required.notices);
        return platformFs.createDurableJsonFile(required);
      },
    },
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "import-registry-notices-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { SiteImportRegistry } = await import("../import-registry.js");
  new SiteImportRegistry({ directory }).saveUpload({ row: { uploadId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", principalId: "owner", createdAt: 0 } });
  const [notice] = notices;
  assert.deepEqual({ count: notices.length, prefix: notice?.prefix, lockTimeout: notice?.lockTimeout({ lockPath: path.join(directory, "x.json.lock"), waitMs: 5000 }) },
    { count: 1, prefix: "Site imports", lockTimeout: "Import registry is busy." });
});
