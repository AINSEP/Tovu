import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BACKSTOP_LIMITS } from "#src/features/publish-content/backstop-policy";
import { createRawFileSitePort, type BackstopFilesystem } from "../../../../features/publish-content/publish-backstop-file.js";

/**
 * @file Real-filesystem pins for the CMS raw site-file adapter: every path-safety refusal, the size
 * limit, private staging/undo folders, and checksum-verified undo.
 */

const LINK = "Links are never sent; choose a regular file inside the site folder.";
const NOT_REGULAR = "Choose a regular file inside the site folder.";
const TOO_LARGE = "Choose files totaling at most 50 MB per send.";

/** A temp site folder holding `assets/logo.txt`; removed by cleanup. */
function fixture() {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-backstop-file-")));
  const siteDir = path.join(parent, "site");
  fs.mkdirSync(path.join(siteDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "assets", "logo.txt"), "logo bytes", { mode: 0o644 });
  return { parent, siteDir, port: createRawFileSitePort({ siteDir }), cleanup: () => fs.rmSync(parent, { recursive: true, force: true }) };
}
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

test("check refuses a path the backstop policy denies", async () => {
  const f = fixture();
  try {
    assert.equal(await f.port.check({ relPath: "config.json" }), '"config.json" is a per-install site file, never part of a published tree');
  } finally { f.cleanup(); }
});

test("check refuses a site folder that is a regular file", async () => {
  const f = fixture();
  try {
    const file = path.join(f.parent, "file-site");
    fs.writeFileSync(file, "");
    assert.equal(await createRawFileSitePort({ siteDir: file }).check({ relPath: "a.txt" }), "The site folder must be a real directory, never a link.");
  } finally { f.cleanup(); }
});

test("check refuses a site folder reached through a link", async () => {
  const f = fixture();
  try {
    const link = path.join(f.parent, "linked-site");
    fs.symlinkSync(f.siteDir, link);
    assert.equal(await createRawFileSitePort({ siteDir: link }).check({ relPath: "assets/logo.txt" }), "The site folder must be a real directory, never a link.");
  } finally { f.cleanup(); }
});

test("check reports a missing site folder as unavailable", async () => {
  const f = fixture();
  try {
    assert.equal(await createRawFileSitePort({ siteDir: path.join(f.parent, "gone") }).check({ relPath: "a.txt" }), "The site folder is unavailable.");
  } finally { f.cleanup(); }
});

test("check accepts an existing regular file", async () => {
  const f = fixture();
  try { assert.equal(await f.port.check({ relPath: "assets/logo.txt" }), null); } finally { f.cleanup(); }
});

test("check accepts a file that does not exist yet under a missing folder", async () => {
  const f = fixture();
  try { assert.equal(await f.port.check({ relPath: "new/deeper/file.txt" }), null); } finally { f.cleanup(); }
});

test("check refuses a linked file", async () => {
  const f = fixture();
  try {
    fs.symlinkSync(path.join(f.siteDir, "assets", "logo.txt"), path.join(f.siteDir, "assets", "alias.txt"));
    assert.equal(await f.port.check({ relPath: "assets/alias.txt" }), LINK);
  } finally { f.cleanup(); }
});

test("check refuses a file under a linked folder", async () => {
  const f = fixture();
  try {
    fs.symlinkSync(path.join(f.siteDir, "assets"), path.join(f.siteDir, "mirror"));
    assert.equal(await f.port.check({ relPath: "mirror/logo.txt" }), LINK);
  } finally { f.cleanup(); }
});

test("check refuses a folder where a file is expected", async () => {
  const f = fixture();
  try { assert.equal(await f.port.check({ relPath: "assets" }), NOT_REGULAR); } finally { f.cleanup(); }
});

test("check refuses a file used as a folder", async () => {
  const f = fixture();
  try { assert.equal(await f.port.check({ relPath: "assets/logo.txt/inner.txt" }), NOT_REGULAR); } finally { f.cleanup(); }
});

test("check refuses a path component the filesystem cannot inspect", async () => {
  const f = fixture();
  try { assert.equal(await f.port.check({ relPath: `${"n".repeat(300)}.txt` }), "This file cannot be inspected safely."); } finally { f.cleanup(); }
});

test("read returns null for a missing file", async () => {
  const f = fixture();
  try { assert.equal(await f.port.read({ relPath: "assets/none.txt" }), null); } finally { f.cleanup(); }
});

test("read returns the bytes and normalized mode of a regular file", async () => {
  const f = fixture();
  try {
    const snapshot = await f.port.read({ relPath: "assets/logo.txt" });
    assert.deepEqual({ ...snapshot, bytes: snapshot?.bytes.toString() }, { absPath: path.join(f.siteDir, "assets", "logo.txt"), bytes: "logo bytes", mode: 0o644 });
  } finally { f.cleanup(); }
});

test("read refuses a file over the send limit", async () => {
  const f = fixture();
  try {
    fs.truncateSync(path.join(f.siteDir, "assets", "logo.txt"), BACKSTOP_LIMITS.bytes + 1);
    await assert.rejects(f.port.read({ relPath: "assets/logo.txt" }), { message: TOO_LARGE });
  } finally { f.cleanup(); }
});

test("read refuses an unsafe path with its reason", async () => {
  const f = fixture();
  try { await assert.rejects(f.port.read({ relPath: "assets" }), { message: NOT_REGULAR }); } finally { f.cleanup(); }
});

test("capture of a missing file records no backup", async () => {
  const f = fixture();
  try {
    assert.deepEqual(await f.port.capture({ relPath: "assets/new.txt" }), { relPath: "assets/new.txt", backupName: null, sha256: null, size: null, mode: 0o644 });
  } finally { f.cleanup(); }
});

test("capture keeps a private copy of an existing file", async () => {
  const f = fixture();
  try {
    const inverse = await f.port.capture({ relPath: "assets/logo.txt" });
    assert.match(String(inverse.backupName), /^[a-f0-9-]{36}$/);
    assert.deepEqual({ ...inverse, backupName: null }, { relPath: "assets/logo.txt", backupName: null, sha256: sha(Buffer.from("logo bytes")), size: 10, mode: 0o644 });
    const backup = path.join(f.siteDir, ".publish-previous", String(inverse.backupName));
    assert.equal(fs.readFileSync(backup, "utf8"), "logo bytes");
    assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(backup)).mode & 0o777, 0o700);
  } finally { f.cleanup(); }
});

test("replace writes verified bytes with the requested mode, creating parent folders", async () => {
  const f = fixture();
  try {
    await f.port.replace({ relPath: "new/deeper/file.txt", bytes: Buffer.from("fresh"), mode: 0o755 });
    const file = path.join(f.siteDir, "new", "deeper", "file.txt");
    assert.equal(fs.readFileSync(file, "utf8"), "fresh");
    assert.equal(fs.statSync(file).mode & 0o777, 0o755);
    assert.deepEqual(fs.readdirSync(path.join(f.siteDir, ".publish-staging")), []);
  } finally { f.cleanup(); }
});

test("replace overwrites an existing file in place", async () => {
  const f = fixture();
  try {
    await f.port.replace({ relPath: "assets/logo.txt", bytes: Buffer.from("new logo"), mode: 0o644 });
    assert.equal(fs.readFileSync(path.join(f.siteDir, "assets", "logo.txt"), "utf8"), "new logo");
  } finally { f.cleanup(); }
});

test("replace refuses bytes over the send limit before staging", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.port.replace({ relPath: "assets/big.bin", bytes: new Uint8Array(BACKSTOP_LIMITS.bytes + 1), mode: 0o644 }), { message: TOO_LARGE });
    assert.equal(fs.existsSync(path.join(f.siteDir, ".publish-staging")), false);
  } finally { f.cleanup(); }
});

test("replace refuses a staging folder that is not a directory", async () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.siteDir, ".publish-staging"), "");
    await assert.rejects(f.port.replace({ relPath: "assets/logo.txt", bytes: Buffer.from("x"), mode: 0o644 }), { message: "The publish staging folder is not a safe directory." });
  } finally { f.cleanup(); }
});

test("replace refuses an unsafe target", async () => {
  const f = fixture();
  try { await assert.rejects(f.port.replace({ relPath: "assets", bytes: Buffer.from("x"), mode: 0o644 }), { message: NOT_REGULAR }); } finally { f.cleanup(); }
});

test("restore without a backup removes the file the send created", async () => {
  const f = fixture();
  try {
    await f.port.restore({ inverse: { relPath: "assets/logo.txt", backupName: null, sha256: null, size: null, mode: 0o644 } });
    assert.equal(fs.existsSync(path.join(f.siteDir, "assets", "logo.txt")), false);
  } finally { f.cleanup(); }
});

test("restore without a backup accepts a file that is already gone", async () => {
  const f = fixture();
  try {
    await f.port.restore({ inverse: { relPath: "assets/none.txt", backupName: null, sha256: null, size: null, mode: 0o644 } });
    assert.equal(fs.existsSync(path.join(f.siteDir, "assets", "none.txt")), false);
  } finally { f.cleanup(); }
});

test("restore puts the captured bytes and mode back", async () => {
  const f = fixture();
  try {
    const inverse = await f.port.capture({ relPath: "assets/logo.txt" });
    await f.port.replace({ relPath: "assets/logo.txt", bytes: Buffer.from("changed"), mode: 0o600 });
    await f.port.restore({ inverse });
    const file = path.join(f.siteDir, "assets", "logo.txt");
    assert.equal(fs.readFileSync(file, "utf8"), "logo bytes");
    assert.equal(fs.statSync(file).mode & 0o777, 0o644);
  } finally { f.cleanup(); }
});

test("T42: a completed file undo reclaims its backup and keeps another pending undo", async () => {
  const f = fixture();
  try {
    const relPath = "assets/logo.txt";
    const otherPath = "assets/other.txt";
    fs.writeFileSync(path.join(f.siteDir, otherPath), "other original");
    const inverse = await f.port.capture({ relPath });
    const pending = await f.port.capture({ relPath: otherPath });
    assert.ok(inverse.backupName);
    assert.ok(pending.backupName);
    const backup = path.join(f.siteDir, ".publish-previous", inverse.backupName);
    const pendingBackup = path.join(f.siteDir, ".publish-previous", pending.backupName);
    assert.equal(fs.readFileSync(backup, "utf8"), "logo bytes");
    await f.port.replace({ relPath, bytes: Buffer.from("published logo"), mode: 0o600 });
    await f.port.replace({ relPath: otherPath, bytes: Buffer.from("other published"), mode: 0o600 });

    await f.port.restore({ inverse });

    assert.equal(fs.readFileSync(path.join(f.siteDir, relPath), "utf8"), "logo bytes");
    assert.equal(fs.statSync(path.join(f.siteDir, relPath)).mode & 0o777, 0o644);
    assert.equal(fs.readFileSync(pendingBackup, "utf8"), "other original", "pending undo bytes must be retained");
    // Expected red: restore reads the previous file but never removes the consumed backup.
    assert.equal(fs.existsSync(backup), false, "completed undo must reclaim its previous-file bytes");
    await f.port.restore({ inverse: pending });
    assert.equal(fs.readFileSync(path.join(f.siteDir, otherPath), "utf8"), "other original");
  } finally { f.cleanup(); }
});

test("restore refuses an unsafe backup name", async () => {
  const f = fixture();
  try {
    await assert.rejects(f.port.restore({ inverse: { relPath: "assets/logo.txt", backupName: "../../escape", sha256: "x", size: 1, mode: 0o644 } }), { message: "The saved undo file has an unsafe address." });
  } finally { f.cleanup(); }
});

test("restore refuses a tampered backup", async () => {
  const f = fixture();
  try {
    const inverse = await f.port.capture({ relPath: "assets/logo.txt" });
    fs.writeFileSync(path.join(f.siteDir, ".publish-previous", String(inverse.backupName)), "tampered");
    await assert.rejects(f.port.restore({ inverse }), { message: "The saved undo file failed its checksum check." });
    assert.equal(fs.readFileSync(path.join(f.siteDir, "assets", "logo.txt"), "utf8"), "logo bytes");
  } finally { f.cleanup(); }
});

/** An errno-style failure a real filesystem can raise mid-operation. */
function fault(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

test("read surfaces an open failure other than a missing file", async () => {
  const f = fixture();
  try {
    const filesystem: BackstopFilesystem = { ...fs, openSync: (() => { throw fault("ELOOP"); }) as typeof fs.openSync };
    await assert.rejects(createRawFileSitePort({ siteDir: f.siteDir }, { filesystem }).read({ relPath: "assets/logo.txt" }), { code: "ELOOP" });
  } finally { f.cleanup(); }
});

test("replace refuses staged bytes whose checksum changed and removes the stage", async () => {
  const f = fixture();
  try {
    const staging = path.join(f.siteDir, ".publish-staging");
    const filesystem: BackstopFilesystem = { ...fs, readFileSync: ((file: fs.PathOrFileDescriptor, options?: unknown) =>
      String(file).startsWith(staging) ? Buffer.from("flipped bits") : fs.readFileSync(file, options as undefined)) as typeof fs.readFileSync };
    await assert.rejects(createRawFileSitePort({ siteDir: f.siteDir }, { filesystem }).replace({ relPath: "assets/logo.txt", bytes: Buffer.from("x"), mode: 0o644 }), {
      message: "The staged file failed its checksum check.",
    });
    assert.deepEqual(fs.readdirSync(staging), []);
    assert.equal(fs.readFileSync(path.join(f.siteDir, "assets", "logo.txt"), "utf8"), "logo bytes");
  } finally { f.cleanup(); }
});

test("replace refuses a parent folder swapped for a non-directory after the check", async () => {
  const f = fixture();
  try {
    let staged = false;
    const swapped = path.join(f.siteDir, "new");
    const filesystem: BackstopFilesystem = {
      ...fs,
      writeFileSync: ((...args: Parameters<typeof fs.writeFileSync>) => { staged = true; fs.writeFileSync(...args); }) as typeof fs.writeFileSync,
      lstatSync: ((file: fs.PathLike) => staged && String(file) === swapped ? fs.lstatSync(path.join(f.siteDir, "assets", "logo.txt")) : fs.lstatSync(file)) as typeof fs.lstatSync,
    };
    await assert.rejects(createRawFileSitePort({ siteDir: f.siteDir }, { filesystem }).replace({ relPath: "new/file.txt", bytes: Buffer.from("x"), mode: 0o644 }), { message: LINK });
  } finally { f.cleanup(); }
});

test("replace surfaces a stage cleanup failure other than a missing stage", async () => {
  const f = fixture();
  try {
    const filesystem: BackstopFilesystem = { ...fs, unlinkSync: (() => { throw fault("EBUSY"); }) as typeof fs.unlinkSync };
    await assert.rejects(createRawFileSitePort({ siteDir: f.siteDir }, { filesystem }).replace({ relPath: "assets/logo.txt", bytes: Buffer.from("x"), mode: 0o644 }), { code: "EBUSY" });
  } finally { f.cleanup(); }
});

test("restore without a backup surfaces a removal failure other than a missing file", async () => {
  const f = fixture();
  try {
    const filesystem: BackstopFilesystem = { ...fs, unlinkSync: (() => { throw fault("EBUSY"); }) as typeof fs.unlinkSync };
    await assert.rejects(createRawFileSitePort({ siteDir: f.siteDir }, { filesystem }).restore({ inverse: { relPath: "assets/logo.txt", backupName: null, sha256: null, size: null, mode: 0o644 } }), { code: "EBUSY" });
    assert.equal(fs.existsSync(path.join(f.siteDir, "assets", "logo.txt")), true);
  } finally { f.cleanup(); }
});
