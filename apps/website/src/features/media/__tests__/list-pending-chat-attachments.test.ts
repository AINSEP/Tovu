import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { isReadOnlyTool, type ToolExecutionContext } from "@jini-ai/core";
import { createDiskAttachmentStore, detectAttachmentKind, type PendingAttachmentSummary } from "@jini-ai/daemon/http";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";

import {
  buildListPendingChatAttachmentsTool,
  CHAT_LIST_PENDING_ATTACHMENTS_TOOL_ID,
  type PendingChatAttachmentLookup,
} from "../list-pending-chat-attachments.js";

/**
 * Regression coverage for the discovery half of the chat-attachment bridge — see
 * `list-pending-chat-attachments.ts`'s own header for the capability gap this closes:
 * `media_promote_chat_attachment` needs an `attachmentRef`, but nothing ever told the model one for
 * an attachment left unclaimed from an earlier turn. This tool is that missing identifier source.
 *
 * The scoping assertions here are the load-bearing ones: this tool's whole safety property is that
 * it passes authenticated `ctx.principal.id` and `ctx.run.id` to `AttachmentStore.listPendingForOwner`, so
 * a fake store that RECORDS the `ownerId` it was called with is what proves that — asserting only
 * the returned attachment list would not catch a version of this tool that queried by some other id
 * (a hardcoded value, `ctx.run.id`, an unscoped "list everything") and got lucky with a fixture that
 * happened to have exactly one owner in it.
 */

function executionContext(runId = "run-1", principalId = "principal-under-test"): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: principalId },
    run: { id: runId },
    input: {},
    signal: new AbortController().signal,
  };
}

function fakeStore(pending: PendingAttachmentSummary[]): PendingChatAttachmentLookup & { calledWith?: string; calledWithRunId?: string } {
  const store: PendingChatAttachmentLookup & { calledWith?: string; calledWithRunId?: string } = {
    async listPendingForOwner({ ownerId }, { runId } = {}) {
      store.calledWith = ownerId;
      if (runId !== undefined) store.calledWithRunId = runId;
      return pending;
    },
  };
  return store;
}

describe("buildListPendingChatAttachmentsTool", () => {
  test("lists an accepted message's image, video and generic file after run-start claiming, excluding other messages and conversations", async () => {
    // Regression: startup claims ALL message refs before tools run; an unclaimed-only store
    // listing then erased every accepted attachment. Use the real store, not a prefiltered fake.
    const root = await mkdtemp(join(tmpdir(), "tovu-message-attachments-"));
    try {
      const store = await createDiskAttachmentStore({ uploadDirectory: root }, {});
      const stage = async (batchId: string, name: string, bytes: Uint8Array) => {
        const directory = await store.createBatchDirectory({ batchId }, {});
        const path = join(directory, name);
        await writeFile(path, bytes);
        return store.register({ input: { batchId, path, name, kind: detectAttachmentKind({ body: bytes }, {}), size: bytes.length, ownerId: "principal-under-test" } }, {});
      };
      const videoBytes = new Uint8Array(334);
      videoBytes.set([0x1a, 0x45, 0xdf, 0xa3]); // MediaRecorder's WebM/EBML header; store kind is file.
      const image = await stage("current-message", "image.png", Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10));
      const video = await stage("current-message", "clip.webm", videoBytes);
      const file = await stage("current-message", "notes.txt", new TextEncoder().encode("meeting notes"));
      const otherVideo = await stage("other-conversation", "other.webm", videoBytes);
      const otherFile = await stage("other-conversation", "other.txt", Uint8Array.of(1));
      const earlier = await stage("earlier-message", "earlier.txt", Uint8Array.of(2));
      const otherClaimed = await stage("other-claimed-conversation", "claimed.webm", videoBytes);
      await store.claim({ attachments: [otherClaimed], runId: "other-run" }, {});
      assert.deepEqual([image.kind, video.kind, file.kind], ["image", "file", "file"]);
      const accepted = parseRunStartContextRef(JSON.stringify({
        prompt: "tell me about these attachments", principalId: "principal-under-test",
        conversationId: "current-conversation", attachmentIds: [image.path, video.path, file.path],
      }));
      assert.deepEqual(accepted.attachmentIds, [image.path, video.path, file.path]);
      const registration = buildListPendingChatAttachmentsTool({
        getStore: () => store,
        getMessageAttachmentRefs: ({ runId }) => runId === "current-run" ? accepted.attachmentIds : [],
      });
      const summaries = await store.listPendingForOwner({ ownerId: accepted.principalId }, {});
      const expected = { attachments: [image, video, file].map(attachment => ({
        attachmentRef: attachment.path, filename: attachment.name, kind: attachment.kind,
        size: attachment.size, uploadedAt: new Date(summaries.find(summary => summary.ref === attachment.path)!.createdAt).toISOString(),
      })) };
      assert.equal(expected.attachments.length, 3);
      assert.deepEqual(await registration.handler(executionContext("current-run")), expected);
      // Same claim that resolveAttachmentRunFields performs before model/tool execution.
      await store.claim({ attachments: accepted.attachmentIds.map(path => ({ path, name: "", kind: "file" as const })), runId: "current-run" }, {});
      assert.deepEqual(await registration.handler(executionContext("current-run")), expected);
      assert.deepEqual(await registration.handler(executionContext("no-message-binding")), { attachments: [] });
      // Even an exact ref cannot borrow another run's claim.
      const foreignRun = buildListPendingChatAttachmentsTool({ getStore: () => store, getMessageAttachmentRefs: () => accepted.attachmentIds });
      assert.deepEqual(await foreignRun.handler(executionContext("foreign-run")), { attachments: [] });
      // Listing must preserve the claim for the subsequent normal promotion lookup.
      assert.equal((await store.resolveForRun({ ref: video.path, runId: "current-run" }, {}))?.name, "clip.webm");
      const remaining = await store.listPendingForOwner({ ownerId: accepted.principalId }, {});
      assert.deepEqual(remaining.map(attachment => attachment.ref), [otherVideo.path, otherFile.path, earlier.path]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("never discovers another conversation or another message from the same owner", async () => {
    const pending: PendingAttachmentSummary[] = [
      { ref: "red", name: "red-square.png", kind: "image", size: 277, createdAt: 1 },
      { ref: "blue", name: "blue-square.png", kind: "image", size: 283, createdAt: 2 },
      { ref: "green", name: "green-square.png", kind: "image", size: 277, createdAt: 3 },
      { ref: "yellow", name: "yellow-square.png", kind: "image", size: 283, createdAt: 4 },
    ];
    const store = fakeStore(pending);
    const registration = buildListPendingChatAttachmentsTool({
      getStore: () => store,
      getMessageAttachmentRefs: ({ runId }) => runId === "new-chat-message" ? ["green", "yellow"] : [],
    });
    const result = await registration.handler(executionContext("new-chat-message"));
    assert.deepEqual(result, { attachments: [
      { attachmentRef: "green", filename: "green-square.png", kind: "image", size: 277, uploadedAt: new Date(3).toISOString() },
      { attachmentRef: "yellow", filename: "yellow-square.png", kind: "image", size: 283, uploadedAt: new Date(4).toISOString() },
    ] });
    assert.deepEqual(await registration.handler(executionContext("earlier-message")), { attachments: [] });
    assert.equal(store.calledWith, "principal-under-test");
  });

  test("fails closed when the current message has no attachment binding", async () => {
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => fakeStore([
      { ref: "old", name: "old.png", kind: "image", size: 1, createdAt: 1 },
    ]) });
    assert.deepEqual(await registration.handler(executionContext()), { attachments: [] });
  });
  test("descriptor exposes the expected id, zero-argument schema, and pass-through policy", () => {
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => fakeStore([]) });

    assert.equal(registration.descriptor.id, CHAT_LIST_PENDING_ATTACHMENTS_TOOL_ID);
    assert.equal(registration.descriptor.id, "chat_list_pending_attachments");
    assert.deepEqual(registration.descriptor.inputSchema, {
      type: "object",
      additionalProperties: false,
      properties: {},
    });
    assert.equal(registration.policy.authorize({} as never), "allow");
  });

  test("descriptor names every attachmentRef consumer, including both plugin install tools", () => {
    const { description } = buildListPendingChatAttachmentsTool({ getStore: () => fakeStore([]) }).descriptor;
    assert.ok(description, "attachment discovery must publish a description");
    for (const consumer of ["media_promote_chat_attachment", "plugins_install", "agent_plugins_install"]) assert.match(description, new RegExp(consumer));
  });

  test("scopes the lookup to ctx.principal.id — never the run id, never an unscoped listing", async () => {
    const store = fakeStore([]);
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => store });

    await registration.handler(executionContext("run-42", "principal-alice"));

    assert.equal(store.calledWith, "principal-alice", "the lookup must be scoped by the calling principal, not the run");
    assert.equal(store.calledWithRunId, "run-42", "already-claimed message attachments must remain discoverable to their own run");
  });

  test("maps each pending attachment to the wire shape the model reads, including an ISO uploadedAt", async () => {
    const pending: PendingAttachmentSummary[] = [
      { ref: "attachment:abc-123", name: "ai-caps.avif", kind: "image", size: 4096, createdAt: 1_757_116_800_000 },
    ];
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => fakeStore(pending), getMessageAttachmentRefs: () => pending.map(attachment => attachment.ref) });

    const result = await registration.handler(executionContext());

    assert.deepEqual(result, {
      attachments: [
        {
          attachmentRef: "attachment:abc-123",
          filename: "ai-caps.avif",
          kind: "image",
          size: 4096,
          uploadedAt: new Date(1_757_116_800_000).toISOString(),
        },
      ],
    });
  });

  test("returns an empty list rather than throwing when nothing is pending for this principal", async () => {
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => fakeStore([]) });

    const result = await registration.handler(executionContext());

    assert.deepEqual(result, { attachments: [] });
  });

  test("throws when the attachment store has not finished starting yet", async () => {
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => undefined });

    await assert.rejects(registration.handler(executionContext()), /attachment store is not ready/);
  });
});

// It only filters an in-memory map (`listPendingForOwner` in `@jini-ai/daemon/http`'s attachments.ts),
// so the read-only gateway may run it. Before this flag, `execute_readonly_delegated_tool` refused it
// (chat 94b1063a, 2026-09-07).
test("is registered read-only, so the read-only delegated-tool gateway accepts it", () => {
  const registration = buildListPendingChatAttachmentsTool({ getStore: () => fakeStore([]) });
  assert.equal(isReadOnlyTool({ descriptor: registration.descriptor }), true);
});
