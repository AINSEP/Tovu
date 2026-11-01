import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import { startTestServer } from "./helpers/http-test-server.js";

// Flake class (newsletter admin-route-gates, 11-01: "not found" is not valid JSON): the helper
// returned an http://127.0.0.1 URL for a wildcard listener. On macOS another process can hold that
// same port on 127.0.0.1, and the request then reaches that process instead of the test's app.
test("startTestServer's URL can only reach the test's own app, not another server on that port", async (t) => {
  const app = express();
  app.get("/probe", (_req, res) => { res.json({ from: "test-app" }); });
  const baseUrl = await startTestServer(app, t);
  const port = Number(new URL(baseUrl).port);

  const other: Server = createServer((_req, res) => { res.end("not found"); });
  other.listen(port, "127.0.0.1");
  // `once(.., "listening")` rejects with the bind error, which is the outcome being asserted.
  const outcome = await once(other, "listening").then(() => "took the port", (error: NodeJS.ErrnoException) => error.code);
  t.after(() => new Promise<void>((resolve) => { if (other.listening) other.close(() => resolve()); else resolve(); }));

  assert.equal(outcome, "EADDRINUSE", "another server could bind the test server's 127.0.0.1 address");
  assert.deepEqual(await (await fetch(`${baseUrl}/probe`)).json(), { from: "test-app" });
});
