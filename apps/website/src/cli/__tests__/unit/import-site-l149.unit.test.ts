import assert from "node:assert/strict";
import test from "node:test";
import { runImportSiteCommand } from "../../commands/import-site.js";

for (const server of ["invalid", "https://user@admin.example", "https://:password@admin.example", "https://admin.example/path", "https://admin.example/?q=1", "https://admin.example/#hash", "ftp://admin.example", "http://localhost", "http://192.0.2.1"]) {
  test(`import rejects ${server} before stdin`, async () => {
    await assert.rejects(runImportSiteCommand({ server, workspaceId: "ws" }, {
      readRequest: async () => assert.fail("must validate before reading"), post: async () => assert.fail("must not send"),
    }), { name: "ValidationError", message: server === "invalid" ? "import: --server must be an admin server origin." : "import: use an HTTPS server origin, or HTTP loopback for local development." });
  });
}
for (const raw of ["{", "null", "[]", "false", "1", '"text"']) {
  test(`import rejects non-object stdin ${raw}`, async () => {
    await assert.rejects(runImportSiteCommand({ server: "https://admin.example", workspaceId: "ws" }, { readRequest: async () => raw }), { name: "ValidationError", message: "import: stdin must contain one JSON request object." });
  });
}
for (const authorization of [undefined, 1, "Basic fixture", "Bearer ", "Bearer x\r\ny", "Bearer " + "x".repeat(4097)]) {
  test(`import rejects invalid authorization ${String(authorization).length}`, async () => {
    await assert.rejects(runImportSiteCommand({ server: "https://admin.example", workspaceId: "ws" }, {
      readRequest: async () => JSON.stringify({ authorization, url: "https://share.example/site.zip" }), post: async () => assert.fail("must not send"),
    }), { name: "ValidationError", message: "import: provide a Bearer API-key authorization in stdin JSON. Never provide an owner password." });
  });
}
test("import requires workspace before stdin", async () => {
  await assert.rejects(runImportSiteCommand({ server: "https://admin.example", workspaceId: "" }, { readRequest: async () => assert.fail("must not read") }), /--workspace is required/);
});
for (const server of ["https://admin.example", "http://127.0.0.1:3010", "http://[::1]:3010"]) {
  for (const response of [null, false, 0, "done", {}, { setupUrl: 4 }, { setupUrl: "/owner" }]) {
    test(`import ${server} preserves/normalizes ${JSON.stringify(response)}`, async () => {
      const result = await runImportSiteCommand({ server, workspaceId: "ws /one" }, {
        readRequest: async () => JSON.stringify({ authorization: "Bearer fixture", url: "https://share.example/site.zip", requestId: "retry" }),
        post: async (input, options) => {
          assert.deepEqual(input, { base: server, route: "/api/admin/v1/workspaces/ws%20%2Fone/site-imports", body: { url: "https://share.example/site.zip", displayName: undefined, requestId: "retry" } });
          assert.deepEqual(options, { headers: { authorization: "Bearer fixture" }, timeoutMs: 300000, maxResponseBytes: 65536 });
          return response;
        },
      });
      assert.deepEqual(result, response && typeof response === "object" && typeof response.setupUrl === "string" ? { setupUrl: server + "/owner" } : response);
    });
  }
}
test("import accepts an external setup URL (reported, not fixed)", async () => {
  assert.deepEqual(await runImportSiteCommand({ server: "https://admin.example", workspaceId: "ws" }, {
    readRequest: async () => JSON.stringify({ authorization: "Bearer fixture", url: "https://share.example/site.zip" }),
    post: async () => ({ setupUrl: "https://untrusted.example/owner" }),
  }), { setupUrl: "https://untrusted.example/owner" });
});

test("import posts to the real daemon client over loopback HTTP and returns a result without a setup URL unchanged", async (t) => {
  const { createServer } = await import("node:http");
  const { once } = await import("node:events");
  const seen: Array<{ method?: string; url?: string; authorization?: string; body: unknown }> = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ state: "queued", importId: "imp-1" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as import("node:net").AddressInfo;
  const result = await runImportSiteCommand({ server: `http://127.0.0.1:${port}`, workspaceId: "ws one" }, {
    readRequest: async () => JSON.stringify({ authorization: "Bearer loopback-key", url: "https://share.example/site.tovu.zip" }),
  });
  assert.deepEqual(result, { state: "queued", importId: "imp-1" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.method, "POST");
  assert.equal(seen[0]!.url, "/api/admin/v1/workspaces/ws%20one/site-imports");
  assert.equal(seen[0]!.authorization, "Bearer loopback-key");
  assert.equal((seen[0]!.body as Record<string, unknown>).authorization, undefined);
});
