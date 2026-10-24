import assert from "node:assert/strict";
import test, { describe } from "node:test";

import type { prepareMessageAttachments } from "@jini-ai/daemon";
import type { AttachmentStore } from "@jini-ai/daemon/http";
import { agentReceivesImageAttachments } from "../run-start-decisions.js";
import { daemonFunction, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/**
 * @file Behaviour pins for every branch of `resolveAttachmentRunFields` (attachment claiming is a
 * trust boundary: only the store's own registry decides what a run may read). Executes the real
 * function's AST with typed fakes; importing the entry script would boot the daemon.
 */

type Resolve = (required: { run: { id: string }; attachmentIds: readonly string[]; runLifecycle: unknown; agentId?: string }, optional: {}) => Promise<unknown>;
type PrepareOptions = Parameters<typeof prepareMessageAttachments>[1];
type Claim = AttachmentStore["claim"];

const RUN = { id: "attachment-run" };
const LIFECYCLE = { name: "lifecycle" };

function resolver({ claim, def, attachmentStoreMissing = false }: {
  claim?: Claim; def?: { imageDelivery?: string; promptInputFormat?: string } | null; attachmentStoreMissing?: boolean;
} = {}) {
  const calls = { failures: [] as unknown[], errors: [] as unknown[][], defs: [] as unknown[], prepareOptions: [] as PrepareOptions[] };
  const attachmentStore: Pick<AttachmentStore, "claim"> = { claim: claim ?? (async () => assert.fail("the store must not be consulted")) };
  const resolve = evaluateDaemonExpression<Resolve>(daemonFunction("resolveAttachmentRunFields"), {
    attachmentStore: attachmentStoreMissing ? undefined : attachmentStore,
    routeDeps: { siteBinding: { dir: '/site' } }, stagedAttachmentCleanupByRunId: new Map(),
    stageAttachmentClaim: async ({ claim }: { claim: unknown }) => ({ claim, cleanup: async () => {} }),
    DEFAULT_AGENT_ID: "default-agent", agentReceivesImageAttachments,
    getAgentDef: (input: unknown) => { calls.defs.push(input); return def; },
    prepareMessageAttachments: async (_required: unknown, options: PrepareOptions) => {
      calls.prepareOptions.push(options);
      return { imagePaths: ["/batch/a.png"], images: [], notice: "notice" };
    },
    readFile: async () => assert.fail("the fake preparation reads nothing"),
    sniffContentType: () => "application/octet-stream",
    failRunBeforeStart: async (input: unknown) => { calls.failures.push(input); },
    console: { error: (...args: unknown[]) => { calls.errors.push(args); } },
  });
  return { resolve, calls };
}

const claimedBatch: Claim = async () => ({ batchDirectory: "/batch", attachments: [{ path: "/batch/a.png", name: "a.png", kind: "image" }] });

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
