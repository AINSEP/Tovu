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

for (const server of ["not a URL", "ftp://admin.example", "http://public.example", "http://localhost", "http://192.168.1.1", "https://user@admin.example", "https://:pass@admin.example", "https://admin.example/path", "https://admin.example/?q=x", "https://admin.example/#x"]) {
  test(`CLI rejects unsafe admin origin ${server} before reading credentials`, async () => {
    await assert.rejects(runImportSiteCommand({ server, workspaceId: "ws" }, {
      readRequest: async () => assert.fail("invalid origin must not read stdin"),
      post: async () => assert.fail("invalid origin must not post"),
    }), { name: "ValidationError" });
  });
}
test("CLI requires workspace before reading credentials", async () => {
  await assert.rejects(runImportSiteCommand({ server: "https://admin.example", workspaceId: "" }, {
    readRequest: async () => assert.fail("missing workspace must not read stdin"),
  }), /--workspace is required/);
});
for (const text of ["", "{", "null", "[]", "1", '"text"', JSON.stringify({}), JSON.stringify({ authorization: 3 }), JSON.stringify({ authorization: "Basic key" }), JSON.stringify({ authorization: "Bearer " }), JSON.stringify({ authorization: "Bearer key\r\ninjected" }), JSON.stringify({ authorization: "Bearer " + "x".repeat(4097) })]) {
  test(`CLI refuses malformed request/auth ${text.slice(0, 45)}`, async () => {
    await assert.rejects(runImportSiteCommand({ server: "https://admin.example", workspaceId: "ws" }, {
      readRequest: async () => text, post: async () => assert.fail("invalid stdin must not post"),
    }), { name: "ValidationError" });
  });
}
for (const server of ["http://127.0.0.1:3010", "http://[::1]:3010"]) {
  for (const response of [null, false, "done", {}, { setupUrl: 4 }, { setupUrl: "https://setup.example/owner" }]) {
    test(`CLI admits ${server} and preserves response ${JSON.stringify(response)}`, async () => {
      const calls: unknown[] = [];
      assert.deepEqual(await runImportSiteCommand({ server, workspaceId: "ws /one" }, {
        readRequest: async () => JSON.stringify({ authorization: "Bearer fixture", uploadId: "00000000-0000-4000-8000-000000000001", displayName: "Copied site", requestId: "request_1" }),
        post: async (input, options) => { calls.push({ input, options }); return response; },
      }), response);
      assert.deepEqual(calls, [{ input: { base: server, route: "/api/admin/v1/workspaces/ws%20%2Fone/site-imports", body: { uploadId: "00000000-0000-4000-8000-000000000001", displayName: "Copied site", requestId: "request_1" } },
        options: { headers: { authorization: "Bearer fixture" }, timeoutMs: 300000, maxResponseBytes: 65536 } }]);
    });
  }
}
