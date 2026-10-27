/** ZIP assembly reuses Jini's picker encoder; assertions inspect bytes actually handed to it. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildShareZip } from "../share-zip.js";
import { SHARE_LIMITS } from "../share-policy.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import type { PlannedDiskFile } from "../sources.js";
type ZipArgs = Parameters<typeof zipFolderFiles>[0];
function plan(overrides: Partial<SiteSharePlanContent> = {}): SiteSharePlanContent {
  return { target: { kind: "zip" }, profile: "share", include: { database: true, media: true, themes: true, plugins: true, settings: true }, database: { bytes: Buffer.from("db"), watermarkAtCapture: 4 }, files: [], bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }], media: [], plugins: [], skipped: [], scopeNotes: {}, totalBytes: 4, site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "test" }, tovuVersion: "test", createdAt: "2026-10-26", ...overrides };
}
function encoder(error?: Error) {
  const calls: ZipArgs[] = [];
  const zip: typeof zipFolderFiles = async args => { calls.push(args); if (error) throw error; return new File(["encoded"], "share.zip"); };
  return { zip, calls };
}
function disk(t: TestContext, relative: string, text: string): PlannedDiskFile {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "v2-zip-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const absPath = path.join(root, "file"); fs.writeFileSync(absPath, text);
  return { path: relative, bytes: Buffer.byteLength(text), scope: "themes", absPath, mtimeMs: fs.statSync(absPath).mtimeMs };
}
test("root v2 inventory matches every actual entry and its mapped path", async t => {
  const { zip, calls } = encoder();
  const progress = { filesDone: 0, bytesDone: 0, filesTotal: 3, bytesTotal: 8 };
  await buildShareZip({ plan: plan({ files: [disk(t, "themes/static/site/index.html", "page")] }), zip }, { packageFiles: new Map(), progress });
  const picked = calls[0]!.files;
  const names = picked.map(file => (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? file.name);
  assert.deepEqual(names, ["share/settings.json", "share/content.db", "share/themes/site/index.html", "manifest.json"]);
  const manifest = JSON.parse(await picked.at(-1)!.text());
  assert.equal(manifest.formatVersion, 2);
  assert.deepEqual(manifest.files.map((file: { path: string }) => file.path), ["settings.json", "content.db", "themes/site/index.html"]);
  assert.deepEqual(await Promise.all(picked.slice(0, 3).map(file => file.text())), ["{}", "db", "page"]);
  assert.equal(progress.filesDone, 3); assert.equal(progress.bytesDone, 8);
  assert.equal(calls[0]!.maxBytes, SHARE_LIMITS.maxArchiveBytes);
});
test("stale disk files and unsafe aliases refuse before encoding", async t => {
  const file = disk(t, "themes/static/site/index.html", "page"), { zip, calls } = encoder();
  fs.writeFileSync(file.absPath, "changed");
  await assert.rejects(buildShareZip({ plan: plan({ files: [file] }), zip }), { code: "PLAN_STALE" });
  for (const paths of [["themes/A.txt", "themes/a.txt"], ["themes/Dir/a", "themes/dir/b"], ["themes/x", "themes/x/y"], ["manifest.json"]]) {
    await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: paths.map(path => ({ path, content: Buffer.from("x") })) }), zip }), { code: "UNSAFE_PATH" });
  }
  assert.equal(calls.length, 0);
});
test("limits and secret scans refuse without invoking the encoder", async () => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ totalBytes: SHARE_LIMITS.maxExpandedBytes + 1 }), zip }), { code: "LIMIT_EXCEEDED" });
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [{ path: "themes/site/script.js", content: Buffer.from('const key="gh' + 'p_' + "x".repeat(36) + '"') }] }), zip }), { code: "SECRET_IN_CONTENT" });
  assert.equal(calls.length, 0);
});
test("v2 requires the database and portable settings", async () => {
  const { zip } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ database: null }), zip }), { code: "INVALID_ARCHIVE" });
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [] }), zip }), { code: "INVALID_ARCHIVE" });
});
test("cancellation and encoder failures preserve their error", async () => {
  const stopped = new Error("stopped");
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder().zip }, { signal: AbortSignal.abort(stopped) }), stopped);
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder(new Error("too large")).zip }), { code: "LIMIT_EXCEEDED" });
  const failure = new Error("encoder broke");
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder(failure).zip }), failure);
});
