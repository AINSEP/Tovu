import assert from "node:assert/strict";
import test from "node:test";
import { prepareMessageAttachments } from "@jini-ai/daemon";
import { sniffContentType } from "#src/features/media/index";
import { captureDaemonRun, daemonFunction, evaluateDaemonExpression } from "./helpers/daemon-source.js";

test("the daemon exchanges both current-message refs for exact pixels and native CLI image paths", async () => {
  const claims: unknown[] = [];
  const reads: string[] = [];
  const resolve = evaluateDaemonExpression<(required: { run: { id: string }; attachmentIds: string[]; runLifecycle: unknown }, optional: {}) => Promise<unknown>>(
    daemonFunction("resolveAttachmentRunFields"), {
      attachmentStore: { claim: async (required: unknown) => {
        claims.push(required);
        return { batchDirectory: "/uploads/message", attachments: [
          { path: "/uploads/message/green.png", name: "green-square.png", kind: "image" },
          { path: "/uploads/message/yellow.png", name: "yellow-square.png", kind: "image" },
        ] };
      } },
      prepareMessageAttachments, sniffContentType, DEFAULT_AGENT_ID: "claude",
      getAgentDef: () => ({ imageDelivery: "prompt-path" }),
      readFile: async (path: string) => {
        reads.push(path);
        return Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, path.endsWith("green.png") ? 1 : 2);
      },
      failRunBeforeStart: () => assert.fail("the attachments should be accepted"),
      console: { error: () => assert.fail("the attachments should be accepted") },
    },
  );
  assert.deepEqual(await resolve({ run: { id: "current-run" }, attachmentIds: ["green-ref", "yellow-ref"], runLifecycle: {} }, {}), {
    imagePaths: ["/uploads/message/green.png", "/uploads/message/yellow.png"],
    imageContents: [{ mimeType: "image/png", data: "iVBORw0KGgoB" }, { mimeType: "image/png", data: "iVBORw0KGgoC" }],
    attachmentNotice: "", extraAllowedDirs: ["/uploads/message"], uploadRoot: "/uploads/message",
  });
  assert.deepEqual(claims, [{ runId: "current-run", attachments: [
    { path: "green-ref", name: "", kind: "file" }, { path: "yellow-ref", name: "", kind: "file" },
  ] }]);
  assert.deepEqual(reads, ["/uploads/message/green.png", "/uploads/message/yellow.png"]);
});

test("the daemon forwards prepared pixels and names a local video before executor dispatch", async () => {
  const imageContents = [{ mimeType: "image/png", data: "iVBORw0KGgoB" }];
  const run = await captureDaemonRun({ prompt: "describe the files" }, { bindings: {
    resolveAttachmentRunFields: async () => ({ imageContents, imagePaths: ["/uploads/a.png"],
      attachmentNotice: "\n\nclip.mp4: read the attached file at /uploads/clip.mp4." }),
  } });
  assert.deepEqual(run.imageContents, imageContents);
  assert.deepEqual(run.imagePaths, ["/uploads/a.png"]);
  assert.equal(run.prompt.endsWith("\n\nclip.mp4: read the attached file at /uploads/clip.mp4."), true);
});
