import { createAttachmentRunFieldsResolver } from "../agent-daemon-scope-attachments.js";
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import type { prepareMessageAttachments } from "@jini-ai/daemon";
import type { AttachmentStore } from "@jini-ai/core/contracts/site/daemon-http";
import { agentReceivesImageAttachments } from "@jini-ai/daemon/run-start-decisions";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";


/**
 * @file Behaviour pins for every branch of `resolveAttachmentRunFields` (attachment claiming is a
 * trust boundary: only the store's own registry decides what a run may read). Executes the real
 * function's AST with typed fakes; importing the entry script would boot the daemon.
 */

type Resolve = (required: { run: { id: string }; attachmentIds: readonly string[]; runLifecycle: unknown; agentId?: string }, optional: {}) => Promise<unknown>;
type PrepareOptions = Parameters<typeof prepareMessageAttachments>[1];
type Claim = AttachmentStore["claim"];

const RUN = { id: "attachment-run" };
const LIFECYCLE = { name: "lifecycle" } as unknown as Parameters<ReturnType<typeof createAttachmentRunFieldsResolver>>[0]["runLifecycle"];

function resolver({ claim, def, attachmentStoreMissing = false }: {
  claim?: Claim; def?: { imageDelivery?: string; promptInputFormat?: string } | null; attachmentStoreMissing?: boolean;
} = {}) {
  const calls = { failures: [] as unknown[], errors: [] as unknown[][], defs: [] as unknown[], prepareOptions: [] as PrepareOptions[] };
  const attachmentStore: Pick<AttachmentStore, "claim"> = { claim: claim ?? (async () => assert.fail("the store must not be consulted")) };
  const resolve = createAttachmentRunFieldsResolver({
    getAttachmentStore: () => attachmentStoreMissing ? undefined : attachmentStore,
    routeDeps: { siteBinding: { dir: '/site' } }, stagedAttachmentCleanupByRunId: new Map(),
    stageAttachmentClaim: async ({ claim }) => ({ claim, cleanup: async () => {} }),
    defaultAgentId: "default-agent", agentReceivesImageAttachments,
    getAgentDef: (input: unknown) => { calls.defs.push(input); return def; },
    prepareMessageAttachments: async (_required: unknown, options: PrepareOptions) => {
      calls.prepareOptions.push(options);
      return { imagePaths: ["/batch/a.png"], images: [], notice: "notice" };
    },
    openFile: async () => assert.fail("the fake preparation reads nothing"),
    sniffContentType: () => "application/octet-stream",
    failRunBeforeStart: async (input: unknown) => { calls.failures.push(input); },
    console: { error: (...args: unknown[]) => { calls.errors.push(args); } },
  });
  return { resolve, calls };
}

const claimedBatch: Claim = async () => ({ batchDirectory: "/batch", attachments: [{ path: "/batch/a.png", name: "a.png", kind: "image" }] });

test("a staged video is sniffed from a prefix without reading its payload; PNG pixels stay exact", async t => {
  const directory = await mkdtemp(join(tmpdir(), "staged-prefix-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const videoPath = join(directory, "clip.mov"), imagePath = join(directory, "pixel.png");
  const video = Buffer.alloc(128 * 1024);
  Buffer.from([0, 0, 0, 24, ...Buffer.from("ftypisom"), 0, 0, 2, 0, ...Buffer.from("isomiso2")]).copy(video);
  const png = Buffer.from("iVBORw0KGgoB", "base64");
  await writeFile(videoPath, video);
  await writeFile(imagePath, png);
  const closed: string[] = [], fullReads: string[] = [];
  const resolve = createAttachmentRunFieldsResolver({
    getAttachmentStore: () => ({ claim: async () => ({ batchDirectory: directory, attachments: [
      { path: videoPath, name: "clip.mov", kind: "file" }, { path: imagePath, name: "pixel.png", kind: "image" },
    ] }) }),
    routeDeps: { siteBinding: { dir: directory } }, stagedAttachmentCleanupByRunId: new Map(),
    stageAttachmentClaim: async ({ claim }) => ({ claim, cleanup: async () => {} }),
    defaultAgentId: "claude", getAgentDef: () => ({ imageDelivery: "native" }),
    openFile: async path => {
      const handle = await open(path, "r");
      return {
        stat: () => handle.stat(), read: options => { assert.equal(options.position, 0); assert.ok(options.length <= 64 * 1024); return handle.read(options); },
        readFile: async () => { assert.notEqual(path, videoPath, "video payload must not be hydrated"); fullReads.push(path); return handle.readFile(); },
        close: async () => { closed.push(path); await handle.close(); },
      };
    },
    failRunBeforeStart: async () => assert.fail("attachment preparation must succeed"),
  });
  const result = await resolve({ run: RUN, attachmentIds: ["video", "png"], runLifecycle: LIFECYCLE }, {});
  assert.ok(result);
  assert.deepEqual(result.imagePaths, [imagePath]);
  assert.deepEqual(result.imageContents, [{ mimeType: "image/png", data: png.toString("base64") }]);
  assert.match(result.attachmentNotice!, /clip.mov: video attachments are unsupported/);
  assert.ok(result.attachmentNotice!.includes(videoPath));
  assert.deepEqual(fullReads, [imagePath]);
  assert.deepEqual(closed, [videoPath, imagePath]);
});

describe("resolveAttachmentRunFields", () => {
  test("a message without attachments contributes no fields and never touches the store", async () => {
    const { resolve } = resolver();
    assert.deepEqual(await resolve({ run: RUN, attachmentIds: [], runLifecycle: LIFECYCLE }, {}), {});
  });

  test("a claim before the store is ready fails the run with a plain reason", async () => {
    const { resolve, calls } = resolver({ attachmentStoreMissing: true });
    assert.equal(await resolve({ run: RUN, attachmentIds: ["ref"], runLifecycle: LIFECYCLE }, {}), null);
    assert.deepEqual(calls.failures, [{ lifecycle: LIFECYCLE, runId: RUN.id, message: "The assistant could not start: attachments are not ready yet." }]);
    assert.deepEqual(calls.errors, [["[agent-daemon] run attachment-run: attachment claim requested before the attachment store was ready"]]);
  });

  test("a claim that yields no batch directory contributes no fields", async () => {
    const { resolve, calls } = resolver({ claim: async () => ({ attachments: [] }) });
    assert.deepEqual(await resolve({ run: RUN, attachmentIds: ["ref"], runLifecycle: LIFECYCLE }, {}), {});
    assert.deepEqual(calls.prepareOptions, []);
  });

  test("a failed claim fails the run and logs the error message", async () => {
    const { resolve, calls } = resolver({ claim: async () => { throw new Error("already claimed"); } });
    assert.equal(await resolve({ run: RUN, attachmentIds: ["ref"], runLifecycle: LIFECYCLE }, {}), null);
    assert.deepEqual(calls.failures, [{ lifecycle: LIFECYCLE, runId: RUN.id, message: "The assistant could not start: an attached file could not be read." }]);
    assert.deepEqual(calls.errors, [["[agent-daemon] run attachment-run: attachment claim failed", "already claimed"]]);
  });

  test("a non-Error rejection is logged as its string form", async () => {
    const { resolve, calls } = resolver({ claim: async () => { throw "expired"; } });
    assert.equal(await resolve({ run: RUN, attachmentIds: ["ref"], runLifecycle: LIFECYCLE }, {}), null);
    assert.deepEqual(calls.errors, [["[agent-daemon] run attachment-run: attachment claim failed", "expired"]]);
  });

  test("a staged batch returns prepared paths, pixels and notice without adding directories", async () => {
    const { resolve } = resolver({ claim: claimedBatch, def: { imageDelivery: "native" } });
    assert.deepEqual(await resolve({ run: RUN, attachmentIds: ["ref"], runLifecycle: LIFECYCLE, agentId: "claude" }, {}), {
      imagePaths: ["/batch/a.png"], imageContents: [], attachmentNotice: "notice", uploadRoot: "/batch",
    });
  });

  test("the default agent's definition is used when the run names none", async () => {
    const { resolve, calls } = resolver({ claim: claimedBatch });
    await resolve({ run: RUN, attachmentIds: ["ref"], runLifecycle: LIFECYCLE }, {});
    assert.deepEqual(calls.defs, [{ id: "default-agent" }]);
  });

  for (const [label, def, imageAccess] of [
    ["native image delivery", { imageDelivery: "native" }, true],
    ["prompt-path image delivery", { imageDelivery: "prompt-path" }, true],
    ["a stream-json prompt", { promptInputFormat: "stream-json" }, true],
    ["unsupported image delivery", { imageDelivery: "unsupported", promptInputFormat: "text" }, false],
    ["an unknown agent", null, false],
  ] as const) {
    test(`${label} ${imageAccess ? "receives" : "does not receive"} image access`, async () => {
      const { resolve, calls } = resolver({ claim: claimedBatch, def });
      await resolve({ run: RUN, attachmentIds: ["ref"], runLifecycle: LIFECYCLE, agentId: "agent" }, {});
      assert.deepEqual(calls.prepareOptions, [{ fileAccess: true, imageAccess }]);
    });
  }
});
