import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { captureRootFor } from "@jini-ai/integrations/web-screenshot/capture-files";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { bindCaptureRetention, createCaptureRootFileLock } from "../capture-retention.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 25);

/** A real site folder with captures written as the writer names them, and the binding over real fs. */
async function harness() {
  const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), "capture-retention-"));
  const root = captureRootFor({ siteDir });
  const write = async (relPath: string, { ageDays, bytes = "jpg" }: { ageDays: number; bytes?: string }) => {
    const file = path.join(root, relPath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    const at = new Date(NOW - ageDays * DAY);
    await fs.utimes(file, at, at);
    return file;
  };
  let tick = 0;
  const previewStore = createCleanupPreviewStore({ randomToken: () => `token-${++tick}`, mono: () => 0 });
  const retention = bindCaptureRetention({
    siteDir, captureRootFor, fs, clock: () => NOW, previewStore,
    writerFence: createCaptureRootFileLock({ withFileLock }, {}),
    authorizeOwner: ({ context }: { context: { id: string } }) => {
      if (context.id !== "owner") throw new Error("Only the site owner can delete screenshots.");
      return { principal: context.id };
    },
  }, {});
  return { siteDir, root, write, retention, owner: { id: "owner" } };
}

test("preview shows only older completed captures", async () => {
  const { root, write, retention, owner } = await harness();
  const old = await write("2026-01-01/old.jpg", { ageDays: 300 });
  await write("2026-01-01/half.jpg.partial", { ageDays: 300 });
  await write("2026-11-24/recent.jpg", { ageDays: 1 });
  await write("notes.jpg", { ageDays: 300 });
  await write("2026-01-01/not-a-capture.png", { ageDays: 300 });
  await fs.symlink(old, path.join(root, "2026-01-01", "link.jpg"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "capture-outside-"));
  await fs.writeFile(path.join(outside, "elsewhere.jpg"), "x");
  await fs.symlink(outside, path.join(root, "2026-02-02"));

  const preview = await retention.preview({ context: owner, before: NOW - 30 * DAY });
  assert.deepEqual(preview.items, ["2026-01-01/old.jpg"]);
  assert.equal(preview.count, 1);
  await assert.rejects(retention.preview({ context: { id: "editor" }, before: NOW - 30 * DAY }), /site owner/);
  await assert.rejects(retention.preview({ context: owner, before: NOW + DAY }), /already passed/);
});

test("replaced capture is kept", async () => {
  const { write, retention, owner, root } = await harness();
  const replaced = await write("2026-01-01/a.jpg", { ageDays: 300, bytes: "first" });
  await write("2026-01-01/b.jpg", { ageDays: 300 });
  const preview = await retention.preview({ context: owner, before: NOW - 30 * DAY });
  assert.deepEqual(preview.items, ["2026-01-01/a.jpg", "2026-01-01/b.jpg"]);

  // The owner saw `a.jpg`, but a different picture now sits under that name (still old enough).
  await fs.rm(replaced);
  await write("2026-01-01/a.jpg", { ageDays: 300, bytes: "second picture" });

  await assert.rejects(retention.apply({ context: owner, previewToken: preview.previewToken, confirm: false }), /Confirm/);
  await assert.rejects(retention.apply({ context: { id: "editor" }, previewToken: preview.previewToken, confirm: true }), /site owner/);
  const result = await retention.apply({ context: owner, previewToken: preview.previewToken, confirm: true });
  assert.deepEqual(result.deleted, ["2026-01-01/b.jpg"]);
  assert.deepEqual(result.kept, [{ relPath: "2026-01-01/a.jpg", reason: "changed" }]);
  assert.equal(await fs.readFile(path.join(root, "2026-01-01/a.jpg"), "utf8"), "second picture");
  await assert.rejects(fs.lstat(path.join(root, "2026-01-01/b.jpg")), { code: "ENOENT" });
});
