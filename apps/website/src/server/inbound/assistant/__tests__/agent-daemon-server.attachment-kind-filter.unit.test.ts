import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { describe } from "node:test";

import { createDiskAttachmentStore, detectAttachmentKind } from "@jini-ai/http-kit";

/**
 * @file Regression coverage for the bug where a non-image chat attachment (a `.md`, a PDF, any
 * `kind !== "image"` upload) was claimed, granted filesystem access via `extraAllowedDirs`, and then
 * silently dropped before `imagePaths` was built — so the agent CLI was never told the file existed
 * at all. Read `agent-daemon-server.ts`'s SOURCE rather than importing it, same reason
 * `agent-daemon-server.session-resume-wiring.unit.test.ts` next to this file gives: that module is a
 * flat top-level script that opens a real SQLite connection and binds a real port as a side effect of
 * being loaded.
 *
 * Two layers of evidence:
 * - the first `describe` pins the exact shape of the `imagePaths:` field inside
 *   `resolveAttachmentRunFields` in the real source file, so a future edit that reintroduces a
 *   `kind`-based filter there fails this test immediately;
 * - the second `describe` proves the fix is safe for a genuinely binary, non-text, non-image
 *   attachment — not just a `.md`, which a naive "reads as UTF-8 text" runtime could pass by
 *   accident — using the real `@jini-ai/http-kit` disk-backed `AttachmentStore` end to end
 *   (register -> claim), so the claimed path and bytes are real, not fabricated.
 */

const DAEMON_ENTRY_SOURCE = fs.readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

/** Scopes every assertion in the first `describe` to `resolveAttachmentRunFields`'s own body, so a
 * coincidental match elsewhere in the file could never make a reintroduced filter pass by accident. */
const resolveAttachmentRunFieldsSource = (() => {
  const startIndex = DAEMON_ENTRY_SOURCE.indexOf("async function resolveAttachmentRunFields(");
  assert.ok(startIndex > -1, "this test's own anchor (the resolveAttachmentRunFields declaration) must still exist verbatim — update the anchor if that line's shape changes");
  const endIndex = DAEMON_ENTRY_SOURCE.indexOf("const onStarted: RunStartHandler", startIndex);
  assert.ok(endIndex > -1, "this test's own anchor (the onStarted declaration that follows) must still exist verbatim");
  return DAEMON_ENTRY_SOURCE.slice(startIndex, endIndex);
})();

describe("resolveAttachmentRunFields — imagePaths must not drop non-image attachments", () => {
  test("the imagePaths field maps every claimed attachment's path, with no kind filter ahead of it", () => {
    assert.match(
      resolveAttachmentRunFieldsSource,
      /imagePaths:\s*claimed\.attachments\.map\(\s*\(attachment\)\s*=>\s*attachment\.path\s*\)\s*,/,
      'imagePaths must be built from claimed.attachments.map(...) directly, with no .filter(kind === "image") ahead of it — a non-image attachment (a .md, a PDF, any file the composer accepted) must still reach AgentExecutor.run()\'s imagePaths, not be silently dropped before the agent CLI is ever told it exists',
    );
  });

  test('the old kind === "image" filter is gone from the live imagePaths assignment (the explanatory comment above it is allowed to quote the old code)', () => {
    const imagePathsLineMatch = resolveAttachmentRunFieldsSource.match(/^\s*imagePaths:\s*[^\n]+,\s*$/m);
    assert.ok(imagePathsLineMatch, "this test's own anchor (the imagePaths: field-assignment line) must still exist verbatim");
    assert.doesNotMatch(
      imagePathsLineMatch[0],
      /attachment\.kind\s*===\s*["']image["']/,
      "the live imagePaths: field-assignment line must not filter attachments by kind before building imagePaths — quoting the old code in a comment above it is fine, but the executable line itself must not",
    );
  });

  test("the imagePaths/\"image\" naming mismatch left by this fix is recorded in a comment, not left silent", () => {
    assert.match(
      resolveAttachmentRunFieldsSource,
      /imagePaths/,
      "sanity check: the field name itself is still present to comment on",
    );
    assert.match(
      DAEMON_ENTRY_SOURCE,
      /imagePaths.{0,400}(name|word).{0,200}(inaccurate|misleading|no longer accurate)/is,
      "the call site (or the surrounding block) must carry a comment recording that `imagePaths` now also carries non-image paths, and that the name/prompt wording are known-inaccurate follow-up work for Jini's image-prompt-delivery.ts / AgentExecutor.run() option naming — silence here would let the mismatch look accidental instead of a recorded tradeoff",
    );
  });
});

describe("real AttachmentStore + a genuine binary non-image fixture", () => {
  test("a claimed non-image binary attachment (a real PDF, kind 'file') is included by the fixed imagePaths mapping — and would have been silently dropped by the old kind === \"image\" filter", async () => {
    const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-attachment-kind-filter-"));
    const store = await createDiskAttachmentStore({ uploadDirectory });
    const batchId = "batch-kind-filter-test";
    const batchDirectory = await store.createBatchDirectory(batchId);

    // A genuinely binary, non-text PDF — the real `%PDF-1.4` header followed by the classic
    // high-byte binary marker real PDF writers emit (`%\xe2\xe3\xcf\xd3`, the RFC-recommended
    // "this file is binary" signal to old FTP clients) plus non-UTF8 filler bytes. This is not a
    // text file wearing a `.pdf` extension — the sanity check below confirms it cannot even be
    // decoded as UTF-8.
    const pdfBytes = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, // "%PDF-1.4\n"
      0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a, // "%\xe2\xe3\xcf\xd3\n" binary marker
      0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x80, 0x81, // non-UTF8 filler bytes
    ]);
    assert.throws(
      () => new TextDecoder("utf-8", { fatal: true }).decode(pdfBytes),
      "fixture sanity check: this must actually be invalid UTF-8 — a real binary file, not a text file wearing a .pdf name",
    );

    const filePath = path.join(batchDirectory, "report.pdf");
    fs.writeFileSync(filePath, pdfBytes, { mode: 0o600 });

    const kind = detectAttachmentKind(pdfBytes);
    assert.equal(
      kind,
      "file",
      "a real PDF's leading bytes must not match any of the four recognized image signatures (PNG/JPEG/GIF/WEBP) — this is exactly why the old kind === \"image\" filter silently dropped it",
    );

    const registered = await store.register({ batchId, path: filePath, name: "report.pdf", kind, size: pdfBytes.length });
    const claimed = await store.claim([{ path: registered.path, name: "", kind: "file" }], "run-kind-filter-test");

    assert.equal(claimed.attachments.length, 1);
    assert.equal(claimed.attachments[0]?.kind, "file");
    assert.equal(claimed.attachments[0]?.path, filePath);
    // The claimed path is real and its bytes are exactly what was written — the store pipeline does
    // not truncate, re-encode, or otherwise touch binary content on its way to becoming an
    // imagePaths entry.
    assert.deepEqual(fs.readFileSync(filePath), pdfBytes);

    const fixedImagePaths = claimed.attachments.map((attachment) => attachment.path);
    const oldFilteredImagePaths = claimed.attachments.filter((attachment) => attachment.kind === "image").map((attachment) => attachment.path);

    assert.deepEqual(fixedImagePaths, [filePath], "the fixed mapping (no kind filter) must include the real, claimed PDF path");
    assert.deepEqual(oldFilteredImagePaths, [], "the removed kind === \"image\" filter would have silently dropped this exact real attachment — the bug this fix closes");
  });
});
