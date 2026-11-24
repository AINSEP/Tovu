import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminChatAttachmentReadRoute } from "#src/server/runtime/composition/modules/assistant-attachment-read";

// F3.4/F4.4: only the filesystem reader is faulted. Existing get-chat-attachment-route.test.ts
// exercises that reader with real staged files; this test owns the handler's unexpected-error shell.
// Driven through a real request since the route became a bridged Jini route (no Express route object
// to extract); the failure copy is therefore the one a real GET has always received.
test("chat attachment handler redacts unexpected read errors while passing the authenticated owner and ref", async (t) => {
  const calls: unknown[] = [];
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "uploader-7" }; next(); });
  registerAdminChatAttachmentReadRoute({ app, deps: {
    uploadDirectory: "/test-owned/uploads",
    readChatAttachmentForOwner: async (deps, input) => {
      calls.push({ deps, input });
      throw new Error("filesystem failure /private/uploads with secret sidecar");
    },
  } });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/api/attachments/${encodeURIComponent("attachment:11111111-2222-3333-4444-555555555555")}`);
  assert.deepEqual(calls, [{
    deps: { uploadDirectory: "/test-owned/uploads" },
    input: { ref: "attachment:11111111-2222-3333-4444-555555555555", ownerId: "uploader-7" },
  }]);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assertAdminResponse({ actual: { statusCode: response.status, jsonBody: await response.json() }, expected: { statusCode: 500, jsonBody: { error: "internal error" } } }, { failure: {"message":"The requested information could not be loaded.","action":"Try loading them again. If it still fails, copy details and report this problem.","step":"Load information"} });
});
