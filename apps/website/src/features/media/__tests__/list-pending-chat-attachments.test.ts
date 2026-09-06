import assert from "node:assert/strict";
import test, { describe } from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";
import type { PendingAttachmentSummary } from "@jini-ai/http-kit";

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
 * it always passes `ctx.principal.id` to `AttachmentStore.listPendingForOwner` and nothing else, so
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

function fakeStore(pending: PendingAttachmentSummary[]): PendingChatAttachmentLookup & { calledWith?: string } {
  const store: PendingChatAttachmentLookup & { calledWith?: string } = {
    async listPendingForOwner(ownerId) {
      store.calledWith = ownerId;
      return pending;
    },
  };
  return store;
}

describe("buildListPendingChatAttachmentsTool", () => {
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

  test("scopes the lookup to ctx.principal.id — never the run id, never an unscoped listing", async () => {
    const store = fakeStore([]);
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => store });

    await registration.handler(executionContext("run-42", "principal-alice"));

    assert.equal(store.calledWith, "principal-alice", "the lookup must be scoped by the calling principal, not the run");
  });

  test("maps each pending attachment to the wire shape the model reads, including an ISO uploadedAt", async () => {
    const pending: PendingAttachmentSummary[] = [
      { ref: "attachment:abc-123", name: "ai-caps.avif", kind: "image", size: 4096, createdAt: 1_757_116_800_000 },
    ];
    const registration = buildListPendingChatAttachmentsTool({ getStore: () => fakeStore(pending) });

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
