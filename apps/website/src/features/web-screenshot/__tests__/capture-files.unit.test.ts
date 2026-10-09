import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CAPTURES_DIR_NAME, captureRootFor, createCaptureFileWriter } from "../capture-files.js";

/**
 * @file Where `web_screenshot_page` saves its captures: `<siteDir>/.captures/<date>/<name>.jpg`,
 * written under a real temp directory. Paths come back absolute so a report can cite them.
 */

async function tempRoot(t: import("node:test").TestContext): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "web-screenshot-captures-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("the captures root is the site folder's .captures directory", () => {
  assert.equal(CAPTURES_DIR_NAME, ".captures");
  assert.equal(captureRootFor({ siteDir: "/sites/demo" }), path.join("/sites/demo", ".captures"));
});

test("files are written under the root, creating the date folder, and their absolute paths are returned in order", async (t) => {
  const root = path.join(await tempRoot(t), ".captures");
  const save = createCaptureFileWriter({ rootDir: root });
  const paths = await save({ files: [
    { relPath: "2026-10-08/090507-042-site-desktop-1.jpg", bytes: Buffer.from("one") },
    { relPath: "2026-10-08/090507-042-site-desktop-2.jpg", bytes: Buffer.from("two") },
  ] });
  assert.deepEqual(paths, [path.join(root, "2026-10-08", "090507-042-site-desktop-1.jpg"), path.join(root, "2026-10-08", "090507-042-site-desktop-2.jpg")]);
  assert.equal(await readFile(paths[0]!, "utf8"), "one");
  assert.equal(await readFile(paths[1]!, "utf8"), "two");
});

test("an existing file is never overwritten", async (t) => {
  const root = await tempRoot(t);
  await mkdir(path.join(root, "2026-10-08"), { recursive: true });
  await writeFile(path.join(root, "2026-10-08", "a.jpg"), "earlier");
  await assert.rejects(createCaptureFileWriter({ rootDir: root })({ files: [{ relPath: "2026-10-08/a.jpg", bytes: Buffer.from("later") }] }), { code: "EEXIST" });
  assert.equal(await readFile(path.join(root, "2026-10-08", "a.jpg"), "utf8"), "earlier");
});

test("a relative path that escapes the root is refused before anything is written", async (t) => {
  const root = await tempRoot(t);
  for (const relPath of ["../outside.jpg", "/abs.jpg", "2026-10-08/../../x.jpg"]) {
    await assert.rejects(createCaptureFileWriter({ rootDir: path.join(root, ".captures") })({ files: [{ relPath, bytes: Buffer.from("x") }] }), /escapes the captures folder/, relPath);
  }
});
