import assert from "node:assert/strict";
import test from "node:test";
import { prepareByokMessageAttachments } from "../byok-message-attachments.js";
import { daemonFunction, evaluateDaemonExpression } from "./helpers/daemon-source.js";

/** Exercises the production adapter and shared byte preparation without booting the daemon. */
function harness({ mime = "image", delivery = "delivered", owner = "alice" }: {
  mime?: "image" | "file"; delivery?: "delivered" | "unsupported" | "not-running"; owner?: string;
} = {}) {
  const reads: unknown[] = [];
  const sends: unknown[] = [];
  const principalByRunId = new Map([["live-run", { id: "alice" }]]);
  const deliver = evaluateDaemonExpression<(input: { runId: string; text: string; id?: string; attachmentIds?: string[] }, options: {}) => Promise<string>>(
    daemonFunction("deliverRunUserMessage"), {
      principalByRunId, ATTACHMENT_UPLOAD_DIRECTORY: "/booted-site/chat-attachments",
      prepareByokMessageAttachments: (input: Parameters<typeof prepareByokMessageAttachments>[0]) => {
        assert.equal(input.uploadDirectory, "/booted-site/chat-attachments");
        return prepareByokMessageAttachments(input, { read: async required => {
          reads.push(required);
          if (required.ownerId !== owner) return { ok: false, refusal: "not-owner" };
          return { ok: true, bytes: mime === "image" ? Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 1) : new TextEncoder().encode("notes") };
        } });
      },
      agentExecutor: { sendUserMessage: async (...args: unknown[]) => { sends.push(args); return delivery; } },
    },
  );
  return { deliver, reads, sends, principalByRunId };
}

test("mid-run screenshot refs become authorized pixels on the same message as its text", async () => {
  const h = harness();
  assert.equal(await h.deliver({ runId: "live-run", text: "see screenshot", id: "message-image", attachmentIds: ["attachment:image"] }, {}), "delivered");
  assert.deepEqual(h.reads, [{ ref: "attachment:image", ownerId: "alice" }]);
  assert.deepEqual(h.sends, [[{ runId: "live-run", text: "see screenshot", id: "message-image", attachmentIds: ["attachment:image"] }, {
    imageContents: [{ mimeType: "image/png", data: "iVBORw0KGgoB" }],
  }]]);
});

test("text-only live messages preserve the accepted ID without reading uploads", async () => {
  const h = harness();
  assert.equal(await h.deliver({ runId: "live-run", text: "keep going", id: "message-text" }, {}), "delivered");
  assert.deepEqual(h.sends, [[{ runId: "live-run", text: "keep going", id: "message-text" }]]);
  assert.deepEqual(h.reads, []);
});

test("unreadable or foreign screenshots never deliver their text alone", async () => {
  const h = harness({ owner: "bob" });
  await assert.rejects(h.deliver({ runId: "live-run", text: "see screenshot", attachmentIds: ["attachment:foreign"] }, {}), /unavailable/);
  assert.deepEqual(h.sends, []);
});

test("non-image files defer the complete message to idle delivery", async () => {
  const h = harness({ mime: "file" });
  assert.equal(await h.deliver({ runId: "live-run", text: "read notes", attachmentIds: ["attachment:notes"] }, {}), "unsupported");
  assert.deepEqual(h.sends, []);
});

test("unsupported or ended live inputs report a fallback without consuming the upload", async () => {
  for (const delivery of ["unsupported", "not-running"] as const) {
    const h = harness({ delivery });
    assert.equal(await h.deliver({ runId: "live-run", text: "see screenshot", attachmentIds: ["attachment:image"] }, {}), delivery);
    assert.equal(h.reads.length, 1);
    assert.equal(h.sends.length, 1);
  }
  const h = harness();
  h.principalByRunId.clear();
  assert.equal(await h.deliver({ runId: "live-run", text: "see screenshot", attachmentIds: ["attachment:image"] }, {}), "not-running");
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.sends, []);
});
