import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

// F3.4/F4.4: only the filesystem reader is faulted. Existing get-chat-attachment-route.test.ts
// exercises that reader with real staged files; this test owns the handler's unexpected-error shell.
test("chat attachment handler redacts unexpected read errors while passing the authenticated owner and ref", async () => {
  const calls: unknown[] = [];
  const { registerAdminChatAttachmentReadRoute } = await import("../get-chat-attachment.js");
  const app = express();
  registerAdminChatAttachmentReadRoute(app, {
    uploadDirectory: "/test-owned/uploads",
    readChatAttachmentForOwner: async (deps, input) => {
      calls.push({ deps, input });
      throw new Error("filesystem failure /private/uploads with secret sidecar");
    },
  });
  const handler = extractRouteHandler(app, "get", "/api/attachments/:ref");
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "uploader-7" };
  await handler({ params: { ref: "attachment:11111111-2222-3333-4444-555555555555" } }, res);
  assert.deepEqual(calls, [{
    deps: { uploadDirectory: "/test-owned/uploads" },
    input: { ref: "attachment:11111111-2222-3333-4444-555555555555", ownerId: "uploader-7" },
  }]);
  assert.deepEqual(capture, { statusCode: 500, jsonBody: { error: "internal error" } });
});
