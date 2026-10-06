import assert from "node:assert/strict";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { describe } from "node:test";
import ts from "typescript";

import { getAgentDef } from "@jini-ai/agent-runtime";
import { sniffContentType } from "@jini-ai/cms/media";
import { prepareMessageAttachments, type AgentExecutorRunInput, type RunLifecycle } from "@jini-ai/daemon";
import { createDiskAttachmentStore, detectAttachmentKind } from "@jini-ai/daemon/http";
import { captureDaemonRun, daemonFunction, daemonInitializer, daemonSource, evaluateDaemonExpression } from "./helpers/daemon-source.js";

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
 * - the first `describe` guards unfiltered claimed refs entering shared preparation and all three
 *   outputs reaching the executor, so neither a kind filter nor a dropped notice can hide a file;
 * - the second `describe` executes the production resolver and complete onStarted callback,
 *   asserting the executor receives exact image pixels/paths and a PDF notice. It proves this is safe
 *   for a genuinely binary, non-text, non-image
 *   attachment — not just a `.md`, which a naive "reads as UTF-8 text" runtime could pass by
 *   accident — using the real `@jini-ai/http-kit` disk-backed `AttachmentStore` end to end
 *   (register -> claim -> prepare -> executor), so the claimed path and bytes are real, not fabricated.
 *
 * The old imagePaths naming-mismatch guard is obsolete: Jini now puts only images in imagePaths;
 * non-images reach the agent through a notice naming their local path. Directory access alone does
 * not tell an agent that a file exists, so forwarding that notice is part of both source guards.
 */

// AST boundaries scope the scans to live functions; removing comments lets the why comments quote
// the historical kind filter without satisfying (or tripping) executable-code assertions.
const sourcePrinter = ts.createPrinter({ removeComments: true });
const resolveAttachmentRunFieldsSource = sourcePrinter.printNode(ts.EmitHint.Unspecified, daemonFunction("resolveAttachmentRunFields"), daemonSource);
const onStartedSource = sourcePrinter.printNode(ts.EmitHint.Expression, daemonInitializer("onStarted"), daemonSource);

/** Both guards pin the complete delivery contract: adding a filter OR dropping a notice must fail
 * either guard independently. A readable PDF must be named to the agent before executor dispatch. */
function assertAttachmentDeliveryContract() {
  assert.match(resolveAttachmentRunFieldsSource,
    /const\s+byPath\s*=\s*new Map\(claimed\.attachments\.map\(\s*\(?attachment\)?\s*=>\s*\[attachment\.path,\s*attachment\]\s*\)\s*\)\s*;/,
    "every claimed attachment must enter the path map without filtering");
  assert.match(resolveAttachmentRunFieldsSource,
    /const\s+prepared\s*=\s*await prepareMessageAttachments\(\s*\{\s*refs:\s*\[\.\.\.byPath\.keys\(\)\]/,
    "all claimed paths must be passed to shared preparation");
  assert.doesNotMatch(resolveAttachmentRunFieldsSource, /\.filter\s*\(/,
    "the resolver must not filter claimed attachments before shared preparation classifies their bytes");
  assert.match(resolveAttachmentRunFieldsSource,
    /return\s*\{\s*imagePaths:\s*prepared\.imagePaths,\s*imageContents:\s*prepared\.images,\s*attachmentNotice:\s*prepared\.notice,/,
    "image paths, pixels and non-image notices must all be returned");
  assert.match(onStartedSource, /prompt\s*\+=\s*attachmentRunFields\.attachmentNotice\s*\?\?\s*""/,
    "the notice must be added to the actual executor prompt");
  assert.match(onStartedSource, /\.\.\.attachmentRunFields\s*,/,
    "prepared image paths and pixels must be forwarded to the executor");
}

describe("resolveAttachmentRunFields — no claimed attachment is silently dropped", () => {
  test("all claimed refs reach preparation and its paths, pixels and notice reach the executor", () => {
    assertAttachmentDeliveryContract();
  });

  test('the old kind === "image" filter is absent from executable preparation wiring', () => {
    assertAttachmentDeliveryContract();
    assert.doesNotMatch(resolveAttachmentRunFieldsSource, /\.kind\s*===?\s*["']image["']/,
      "claimed metadata must not exclude files before shared byte-based preparation; comments may quote the old filter");
  });
});

describe("real AttachmentStore + a genuine binary non-image fixture", () => {
  test("the production resolver delivers a real PDF and image to the daemon executor", async (t) => {
    const uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-attachment-kind-filter-"));
    t.after(() => fs.rmSync(uploadDirectory, { recursive: true, force: true }));
    const store = await createDiskAttachmentStore({ uploadDirectory });
    const batchId = "batch-kind-filter-test";
    const batchDirectory = await store.createBatchDirectory({ batchId });

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

    const kind = detectAttachmentKind({ body: pdfBytes });
    assert.equal(
      kind,
      "file",
      "a real PDF's leading bytes must not match any of the four recognized image signatures (PNG/JPEG/GIF/WEBP) — this is exactly why the old kind === \"image\" filter silently dropped it",
    );

    const registered = await store.register({ input: { batchId, path: filePath, name: "report.pdf", kind, size: pdfBytes.length } });
    const claimed = await store.claim({ attachments: [{ path: registered.path, name: "", kind: "file" }], runId: "run-kind-filter-test" });

    assert.equal(claimed.attachments.length, 1);
    assert.equal(claimed.attachments[0]?.kind, "file");
    assert.equal(claimed.attachments[0]?.path, filePath);
    // The claimed path is real and its bytes are exactly what was written — the store pipeline does
    // not truncate, re-encode, or otherwise touch binary content on its way to being named in a
    // file notice. The PDF must not be sent as image pixels or a native CLI image argument.
    assert.deepEqual(fs.readFileSync(filePath), pdfBytes);

    const secondPath = path.join(batchDirectory, "second-report.pdf");
    fs.writeFileSync(secondPath, pdfBytes, { mode: 0o600 });
    const second = await store.register({ input: { batchId, path: secondPath, name: "second-report.pdf", kind: "file", size: pdfBytes.length } });
    const imagePath = path.join(batchDirectory, "screenshot.png");
    const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZioAAAAASUVORK5CYII=", "base64");
    assert.equal(detectAttachmentKind({ body: imageBytes }), "image");
    fs.writeFileSync(imagePath, imageBytes);
    const image = await store.register({ input: { batchId, path: imagePath, name: "screenshot.png", kind: "image", size: imageBytes.length } });
    const resolve = evaluateDaemonExpression<(required: {
      run: { id: string }; attachmentIds: readonly string[]; runLifecycle: RunLifecycle; agentId?: string;
    }, optional: {}) => Promise<Partial<AgentExecutorRunInput> | null>>(daemonFunction("resolveAttachmentRunFields"), {
      attachmentStore: store,
      // Source evaluation does not inherit imports. Use the exact production dependencies rather
      // than replacing preparation or MIME detection, so this covers the real binary delivery path.
      DEFAULT_AGENT_ID: "claude", getAgentDef, prepareMessageAttachments, readFile, sniffContentType,
      // Let the resolver report its original caught error instead of masking it with a fixture error.
      failRunBeforeStart: async () => {},
      console: { error: (...args: unknown[]) => assert.fail(args.map(String).join(" ")) },
    });
    // F2.3/F2.4: both the production resolver and its caller run; dropping the spread fails here.
    const input = await captureDaemonRun({ prompt: "Read both attachments", attachmentIds: [second.path, image.path] }, {
      bindings: { resolveAttachmentRunFields: resolve },
    });
    assert.deepEqual(input.imagePaths, [imagePath], "only actual images become native CLI image arguments");
    assert.deepEqual(input.imageContents, [{ mimeType: "image/png", data: imageBytes.toString("base64") }],
      "the image's exact bytes must reach the executor as normalized pixels");
    const notice = `\n\nAttachments to this message:\nsecond-report.pdf: read the attached file at ${secondPath}.`;
    assert.equal(input.prompt, `<<SUBAGENT_DISPATCH>>\n\nRead both attachments${notice}`,
      "the real PDF must be explicitly named to the agent, not merely granted directory access");
    assert.deepEqual(input.extraAllowedDirs, [batchDirectory]);
    assert.equal(input.uploadRoot, batchDirectory);
    assert.deepEqual(fs.readFileSync(secondPath), pdfBytes);
  });
});
