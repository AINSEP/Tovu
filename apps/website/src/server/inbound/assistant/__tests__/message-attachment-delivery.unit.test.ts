import { createAttachmentRunFieldsResolver } from "../agent-daemon-scope-attachments.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareMessageAttachments } from "@jini-ai/daemon";
import { sniffContentType } from "#src/features/media/index";
import { agentReceivesImageAttachments } from "@jini-ai/daemon/run-start-decisions";
import { captureDaemonRun } from "./helpers/daemon-source.js";

// Attachments are staged inside the site folder before delivery (site agents are confined to the
// site), so the paths the agent sees are the staged copies, never the upload directory.
test("the daemon exchanges both current-message refs for exact pixels and native CLI image paths", async (t) => {
  const claims: unknown[] = [];
  const reads: string[] = [];
  const stagingRoots: string[] = [];
  const site = await mkdtemp(join(tmpdir(), "tovu-current-run-"));
  t.after(() => rm(site, { recursive: true, force: true }));
  const staged = join(site, ".tovu", "attachments", "current-run");
  await mkdir(staged, { recursive: true });
  await writeFile(join(staged, "green.png"), Buffer.from("iVBORw0KGgoB", "base64"));
  await writeFile(join(staged, "yellow.png"), Buffer.from("iVBORw0KGgoC", "base64"));
  const resolve = createAttachmentRunFieldsResolver({
      getAttachmentStore: () => ({ claim: async (required: unknown) => {
        claims.push(required);
        return { batchDirectory: "/uploads/message", attachments: [
          { path: "/uploads/message/green.png", name: "green-square.png", kind: "image" },
          { path: "/uploads/message/yellow.png", name: "yellow-square.png", kind: "image" },
        ] };
      } }),
      stageAttachmentClaim: (required) => {
        stagingRoots.push(required.filesystemRoot);
        return Promise.resolve({ cleanup: async () => {}, claim: { batchDirectory: staged, attachments: required.claim.attachments.map(
          (attachment) => ({ ...attachment, path: attachment.path.replace("/uploads/message", staged) })) } });
      },
      stagedAttachmentCleanupByRunId: new Map(), routeDeps: { siteBinding: { dir: site } },
      prepareMessageAttachments, sniffContentType, agentReceivesImageAttachments, defaultAgentId: "claude",
      getAgentDef: () => ({ imageDelivery: "prompt-path" }),
      openFile: async (path, flags) => {
        assert.equal(flags, "r");
        reads.push(path);
        return open(path, flags);
      },
      failRunBeforeStart: () => assert.fail("the attachments should be accepted"),
      console: { error: () => assert.fail("the attachments should be accepted") },
    },
  );
  assert.deepEqual(await resolve({ run: { id: "current-run" }, attachmentIds: ["green-ref", "yellow-ref"], runLifecycle: {} as Parameters<typeof resolve>[0]["runLifecycle"] }, {}), {
    imagePaths: [`${staged}/green.png`, `${staged}/yellow.png`],
    imageContents: [{ mimeType: "image/png", data: "iVBORw0KGgoB" }, { mimeType: "image/png", data: "iVBORw0KGgoC" }],
    attachmentNotice: "", uploadRoot: staged,
  });
  assert.deepEqual(stagingRoots, [site]);
  assert.deepEqual(claims, [{ runId: "current-run", attachments: [
    { path: "green-ref", name: "", kind: "file" }, { path: "yellow-ref", name: "", kind: "file" },
  ] }]);
  assert.deepEqual(reads, [`${staged}/green.png`, `${staged}/yellow.png`]);
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
