/** Approved round17 row 6. Baseline RED: authenticated import CLI adapter absent. */
import assert from "node:assert/strict";
import test from "node:test";
import { runImportSiteCommand } from "../../../cli/commands/import-site.js";

test("B CLI reuses the authenticated route and keeps credentials out of the request body", async () => {
  const calls: unknown[] = [];
  const result = await runImportSiteCommand({ server: "https://admin.example", workspaceId: "workspace-local" }, {
    readRequest: async () => JSON.stringify({ authorization: "Bearer test-key", url: "https://share.example/site.tovu.zip", requestId: "retry" }),
    post: async (input, options) => { calls.push({ input, options }); return { state: "needs-owner", setupUrl: "/api/admin/v1/workspaces/workspace-local/site-imports/id/owner" }; },
  });
  const call = calls[0] as { input: { body: Record<string, unknown> }; options: { headers: unknown } };
  assert.equal(call.input.body.authorization, undefined);
  assert.equal(call.input.body.adminPassword, undefined);
  assert.equal(call.input.body.requestId, "retry");
  assert.deepEqual(call.options.headers, { authorization: "Bearer test-key" });
  assert.match((result as { setupUrl: string }).setupUrl, /^https:\/\/admin.example\//);
  await assert.rejects(runImportSiteCommand({ server: "https://admin.example", workspaceId: "ws" }, {
    readRequest: async () => JSON.stringify({ authorization: "Bearer test-key", path: "/tmp/site.zip" }),
    post: async () => { assert.fail("filesystem paths must not reach the remote API"); },
  }));
});
