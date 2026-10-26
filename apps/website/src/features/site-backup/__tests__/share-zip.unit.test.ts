/**
 * Pins every refusal and pass-through branch of `buildShareZip` with a typed encoder fake and real
 * temp files, so the order of checks (caps → path claims → per-entry scan → manifest → encoder),
 * the exact refusal texts, and the entries handed to Jini's encoder stay provably identical.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { buildShareZip } from "../share-zip.js";
import { SHARE_LIMITS } from "../share-policy.js";
import type { SiteSharePlanContent } from "../plan-store.js";
import { fileIdentity, type PlannedDiskFile } from "../sources.js";

type ZipArgs = Parameters<typeof zipFolderFiles>[0];
const ZIP_BYTES = Buffer.from("encoded zip");
const LIMIT = (message: string) => ({ code: "LIMIT_EXCEEDED", message });
const DUPLICATE = { code: "UNSAFE_PATH", message: "Duplicate file or file/directory collision." };
const credentialShaped = (): Buffer => Buffer.from(["gh", "p_"].join("") + "x".repeat(36));

function plan(overrides: Partial<SiteSharePlanContent> = {}): SiteSharePlanContent {
  return {
    target: { kind: "zip" }, profile: "share",
    include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("db"), watermarkAtCapture: 4 },
    files: [], skipped: [], scopeNotes: {}, totalBytes: 2,
    site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "t" }, tovuVersion: "1.0.0", createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
/** An encoder fake that records each call and returns fixed bytes (or throws `error`). */
function encoder(options: { error?: unknown } = {}) {
  const calls: ZipArgs[] = [];
  const zip: typeof zipFolderFiles = async args => {
    calls.push(args);
    if (options.error !== undefined) throw options.error;
    return new File([ZIP_BYTES], "share.zip");
  };
  return { zip, calls };
}
function diskFile(t: TestContext, relative: string, content: string): PlannedDiskFile {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "share-zip-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const absPath = path.join(dir, "file");
  fs.writeFileSync(absPath, content);
  return { path: relative, bytes: Buffer.byteLength(content), scope: "themes", root: dir, absPath, mtimeMs: fs.statSync(absPath).mtimeMs, identity: fileIdentity(fs.statSync(absPath, { bigint: true })), nlink: 1 };
}
const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const relativePaths = (args: ZipArgs): string[] => args.files.map(file => (file as File & { webkitRelativePath?: string }).webkitRelativePath ?? `(none) ${file.name}`);

test("buffered files, then the database, then disk files, then the manifest reach the encoder once", async t => {
  const { zip, calls } = encoder();
  const disk = diskFile(t, "themes/page.html", "page");
  const bytes = await buildShareZip({ plan: plan({ bufferedFiles: [{ path: "uploads/m1", content: Buffer.from("media") }], files: [disk] }), zip });
  assert.deepEqual(bytes, ZIP_BYTES);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.maxBytes, SHARE_LIMITS.maxArchiveBytes);
  assert.deepEqual(relativePaths(calls[0]!), ["share/uploads/m1", "share/database/content.db", "share/themes/page.html", "(none) tovu-backup.json"]);
  assert.deepEqual(calls[0]!.files.map(file => file.name), ["m1", "content.db", "page.html", "tovu-backup.json"]);
});

test("each archived entry keeps its exact bytes", async t => {
  const { zip, calls } = encoder();
  await buildShareZip({ plan: plan({ bufferedFiles: [{ path: "uploads/m1", content: Buffer.from("media") }], files: [diskFile(t, "themes/page.html", "page")] }), zip });
  const contents = await Promise.all(calls[0]!.files.slice(0, 3).map(async file => Buffer.from(await file.arrayBuffer()).toString()));
  assert.deepEqual(contents, ["media", "db", "page"]);
});

test("the manifest inventories every entry with its size and sha256, in archive order", async t => {
  const { zip, calls } = encoder();
  await buildShareZip({ plan: plan({ bufferedFiles: [{ path: "uploads/m1", content: Buffer.from("media") }], files: [diskFile(t, "themes/page.html", "page")] }), zip });
  const manifest = JSON.parse(Buffer.from(await calls[0]!.files.at(-1)!.arrayBuffer()).toString());
  assert.deepEqual(manifest.files, [
    { path: "uploads/m1", bytes: 5, sha256: sha(Buffer.from("media")) },
    { path: "database/content.db", bytes: 2, sha256: sha(Buffer.from("db")) },
    { path: "themes/page.html", bytes: 4, sha256: sha(Buffer.from("page")) },
  ]);
});

test("a plan without a database or buffered files archives only its disk files and manifest", async t => {
  const { zip, calls } = encoder();
  await buildShareZip({ plan: plan({ database: null, files: [diskFile(t, "themes/page.html", "page")] }), zip });
  assert.deepEqual(relativePaths(calls[0]!), ["share/themes/page.html", "(none) tovu-backup.json"]);
});

test("progress counts every archived entry and its bytes, not the manifest", async t => {
  const progress = { filesDone: 0, filesTotal: 3, bytesDone: 0, bytesTotal: 11 };
  await buildShareZip({ plan: plan({ bufferedFiles: [{ path: "uploads/m1", content: Buffer.from("media") }], files: [diskFile(t, "themes/page.html", "page")] }), zip: encoder().zip }, { progress });
  assert.deepEqual(progress, { filesDone: 3, filesTotal: 3, bytesDone: 11, bytesTotal: 11 });
});

test("the plan's expanded caps are checked before any path claim or read", async () => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ totalBytes: SHARE_LIMITS.maxExpandedBytes + 1, bufferedFiles: [{ path: "bad\\path", content: Buffer.from("x") }] }), zip }),
    LIMIT("Share exceeds the v1 300 MiB expanded cap. Reduce the site or wait for streaming exports."));
  assert.equal(calls.length, 0);
});

test("an unsafe path is refused before any entry is scanned", async () => {
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [{ path: "uploads/ok", content: credentialShaped() }, { path: "themes/a?.txt", content: Buffer.from("x") }] }), zip: encoder().zip }),
    { code: "UNSAFE_PATH", message: "Share path 'themes/a?.txt' is unsafe." });
});

test("a file at the manifest path is refused as a duplicate", async () => {
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [{ path: "tovu-backup.json", content: Buffer.from("{}") }] }), zip: encoder().zip }), DUPLICATE);
});

test("a buffered file and the database at the same path are refused as a duplicate", async () => {
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [{ path: "database/content.db", content: Buffer.from("x") }] }), zip: encoder().zip }), DUPLICATE);
});

test("credential-shaped bytes refuse the share before encoding", async () => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles: [{ path: "themes/leak.txt", content: credentialShaped() }] }), zip }),
    { code: "SECRET_IN_CONTENT", message: "Share refused: 'themes/leak.txt' contains credential-shaped content. Remove the secret before sharing." });
  assert.equal(calls.length, 0);
});

test("a disk file that changed since the plan is refused as stale", async t => {
  const disk = diskFile(t, "themes/page.html", "page");
  fs.writeFileSync(disk.absPath, "changed");
  await assert.rejects(buildShareZip({ plan: plan({ files: [disk] }), zip: encoder().zip }),
    { code: "PLAN_STALE", message: "'themes/page.html' changed since the plan was made. Call site_backup_plan again." });
});

test("an already-aborted signal stops at the first entry", async () => {
  const controller = new AbortController(); const reason = new Error("stop now"); controller.abort(reason);
  const progress = { filesDone: 0, filesTotal: 1, bytesDone: 0, bytesTotal: 2 };
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder().zip }, { signal: controller.signal, progress }), reason);
  assert.equal(progress.filesDone, 0);
});

test("an aborted signal stops before encoding even when the plan has no entries", async () => {
  const controller = new AbortController(); const reason = new Error("stop now"); controller.abort(reason);
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ database: null }), zip }, { signal: controller.signal }), reason);
  assert.equal(calls.length, 0);
});

test("a live signal lets the share encode", async () => {
  assert.deepEqual(await buildShareZip({ plan: plan(), zip: encoder().zip }, { signal: new AbortController().signal }), ZIP_BYTES);
});

test("a manifest over 2 MiB is refused before encoding", async () => {
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ site: { name: "n".repeat(SHARE_LIMITS.maxManifestBytes), folderName: "site" } }), zip }), LIMIT("Share manifest exceeds 2 MiB."));
  assert.equal(calls.length, 0);
});

test("a manifest of exactly 2 MiB is accepted", async () => {
  const base = plan();
  const { zip, calls } = encoder();
  await buildShareZip({ plan: base, zip });
  const baseSize = (calls[0]!.files.at(-1)!).size;
  const sized = plan({ site: { name: "Site" + "n".repeat(SHARE_LIMITS.maxManifestBytes - baseSize), folderName: "site" } });
  await buildShareZip({ plan: sized, zip });
  assert.equal(calls[1]!.files.at(-1)!.size, SHARE_LIMITS.maxManifestBytes);
});

test("the file cap counts the manifest itself after every entry is scanned", async () => {
  const bufferedFiles = Array.from({ length: SHARE_LIMITS.maxFiles - 1 }, (_, index) => ({ path: `themes/f${index}`, content: Buffer.from("x") }));
  const progress = { filesDone: 0, filesTotal: SHARE_LIMITS.maxFiles, bytesDone: 0, bytesTotal: 0 };
  const { zip, calls } = encoder();
  await assert.rejects(buildShareZip({ plan: plan({ bufferedFiles }), zip }, { progress }), LIMIT("Share exceeds the v1 2,000-file cap. Reduce the site or wait for streaming exports."));
  assert.deepEqual({ scanned: progress.filesDone, encoded: calls.length }, { scanned: SHARE_LIMITS.maxFiles, encoded: 0 });
});

for (const message of ["Folder is over the upload limit.", "Too many entries.", "Archive too LARGE"]) {
  test(`an encoder size failure ('${message}') is reported as the v1 archive cap`, async () => {
    await assert.rejects(buildShareZip({ plan: plan(), zip: encoder({ error: new Error(message) }).zip }), LIMIT("Share exceeds the v1 300 MiB ZIP archive cap."));
  });
}

test("any other encoder Error propagates unchanged", async () => {
  const error = new Error("disk on fire");
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder({ error }).zip }), error);
});

test("a non-Error encoder failure propagates unchanged, even if it mentions a limit", async () => {
  await assert.rejects(buildShareZip({ plan: plan(), zip: encoder({ error: "limit" }).zip }), (thrown: unknown) => thrown === "limit");
});
