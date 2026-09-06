import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import test from "node:test";

import express from "express";

import { registerAdminStatic } from "../admin-static.js";

/**
 * @file Proves the dev-proxy branch of `registerAdminStatic` (`admin-dev-proxy.ts`) actually
 * forwards bytes and the HMR `upgrade` event, rather than just type-checking.
 *
 * Every test here stands up a REAL fake "Vite" server (`node:http`) and a REAL Express app with
 * `registerAdminStatic` mounted, both bound to ephemeral ports, and drives them with real sockets —
 * no mocking of `node:http`/`node:https` itself. `TOVU_ADMIN_DEV_PROXY_URL` is pointed at
 * `http://127.0.0.1:<fake vite port>` throughout: the proxy's request/response plumbing is scheme-
 * agnostic (it picks `http`/`https` off the target URL), so plain HTTP keeps these tests free of TLS
 * setup while exercising the exact same code path TLS mode uses.
 */

/** Starts a bare Express app with `registerAdminStatic` mounted, listening on an ephemeral port. */
function startAdminApp(t: import("node:test").TestContext, distDir: string): Promise<string> {
  const app = express();
  registerAdminStatic(app, { distDir });
  const server = app.listen(0);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return new Promise((resolve) => {
    server.on("listening", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("test setup: expected a bound TCP address");
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

test("registerAdminStatic dev-proxy mode: forwards /admin/* to the configured Vite origin, unmodified path and body", async (t) => {
  const receivedPaths: string[] = [];
  const fakeVite = createHttpServer((req, res) => {
    receivedPaths.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/javascript", "x-fake-vite": "1" });
    res.end("console.log('served by fake vite')");
  });
  fakeVite.listen(0);
  t.after(() => new Promise<void>((resolve) => fakeVite.close(() => resolve())));
  await new Promise<void>((resolve) => fakeVite.on("listening", () => resolve()));
  const fakeViteAddress = fakeVite.address();
  if (fakeViteAddress === null || typeof fakeViteAddress === "string") throw new Error("test setup: expected a bound TCP address");

  process.env.TOVU_ADMIN_DEV_PROXY_URL = `http://127.0.0.1:${fakeViteAddress.port}`;
  t.after(() => {
    delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  });
  const baseUrl = await startAdminApp(t, "/nonexistent-dist-dir");

  const res = await fetch(`${baseUrl}/admin/src/main.tsx?t=123`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-fake-vite"), "1");
  assert.equal(await res.text(), "console.log('served by fake vite')");
  assert.deepEqual(receivedPaths, ["/admin/src/main.tsx?t=123"]);
});

test("registerAdminStatic dev-proxy mode: rewrites a bare /admin to /admin/ before it reaches Vite (Vite's own base match is exact)", async (t) => {
  const receivedPaths: string[] = [];
  const fakeVite = createHttpServer((req, res) => {
    receivedPaths.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html></html>");
  });
  fakeVite.listen(0);
  t.after(() => new Promise<void>((resolve) => fakeVite.close(() => resolve())));
  await new Promise<void>((resolve) => fakeVite.on("listening", () => resolve()));
  const fakeViteAddress = fakeVite.address();
  if (fakeViteAddress === null || typeof fakeViteAddress === "string") throw new Error("test setup: expected a bound TCP address");

  process.env.TOVU_ADMIN_DEV_PROXY_URL = `http://127.0.0.1:${fakeViteAddress.port}`;
  t.after(() => {
    delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  });
  const baseUrl = await startAdminApp(t, "/nonexistent-dist-dir");

  const res = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
  assert.equal(res.status, 200, "a bare /admin must be served, not redirected or 404ed");
  assert.deepEqual(receivedPaths, ["/admin/"]);
});

test("registerAdminStatic dev-proxy mode: an unreachable Vite origin gets a 502, not a hang or a crash", async (t) => {
  // Port 1 is a privileged port nothing in this test suite is listening on; the OS refuses the
  // connection immediately (ECONNREFUSED) instead of timing out, keeping this test fast.
  process.env.TOVU_ADMIN_DEV_PROXY_URL = "http://127.0.0.1:1";
  t.after(() => {
    delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  });
  const baseUrl = await startAdminApp(t, "/nonexistent-dist-dir");

  const res = await fetch(`${baseUrl}/admin/`);
  assert.equal(res.status, 502);
});

test("registerAdminStatic: falls back to the 'admin shell not built' pointer page when TOVU_ADMIN_DEV_PROXY_URL is unset and no build exists (unchanged by this change)", async (t) => {
  delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  const baseUrl = await startAdminApp(t, "/nonexistent-dist-dir");

  const res = await fetch(`${baseUrl}/admin/`);
  assert.equal(res.status, 503);
  assert.match(await res.text(), /Admin shell not built/);
});

test("registerAdminDevProxyUpgrade: forwards the HMR WebSocket upgrade end to end through a real server pair", async (t) => {
  const { registerAdminDevProxyUpgrade } = await import("../admin-dev-proxy.js");

  // Stands in for Vite's own ws server: performs a real RFC 6455 handshake so this test proves the
  // proxy carries a genuine upgrade (matching `Sec-WebSocket-Accept`), not just that some bytes moved.
  const fakeVite = createHttpServer((_req, res) => {
    res.writeHead(404).end();
  });
  fakeVite.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash("sha1")
      .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: vite-hmr\r\n\r\n`
    );
    // A real WS server (the `ws` package Vite itself uses) closes its side on disconnect; this bare
    // stand-in must do the same or `fakeVite.close()` below hangs forever. `http.Server` sockets are
    // `allowHalfOpen: true`, so a graceful disconnect only ever delivers `end`, never `close` — the
    // exact gap `admin-dev-proxy.ts`'s own `destroyOnTermination` exists to close on the proxy side.
    socket.on("end", () => socket.destroy());
  });
  fakeVite.listen(0);
  t.after(() => new Promise<void>((resolve) => fakeVite.close(() => resolve())));
  await new Promise<void>((resolve) => fakeVite.on("listening", () => resolve()));
  const fakeViteAddress = fakeVite.address();
  if (fakeViteAddress === null || typeof fakeViteAddress === "string") throw new Error("test setup: expected a bound TCP address");

  process.env.TOVU_ADMIN_DEV_PROXY_URL = `http://127.0.0.1:${fakeViteAddress.port}`;
  t.after(() => {
    delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  });

  const proxyServer = createHttpServer((_req, res) => res.writeHead(404).end());
  registerAdminDevProxyUpgrade(proxyServer);
  proxyServer.listen(0);
  t.after(() => new Promise<void>((resolve) => proxyServer.close(() => resolve())));
  await new Promise<void>((resolve) => proxyServer.on("listening", () => resolve()));
  const proxyAddress = proxyServer.address();
  if (proxyAddress === null || typeof proxyAddress === "string") throw new Error("test setup: expected a bound TCP address");

  const clientKey = crypto.randomBytes(16).toString("base64");
  const expectedAccept = crypto
    .createHash("sha1")
    .update(clientKey + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  const { request } = await import("node:http");
  const upgrade = await new Promise<{ statusCode?: number; headers: Record<string, unknown> }>((resolve, reject) => {
    const req = request({
      hostname: "127.0.0.1",
      port: proxyAddress.port,
      path: "/admin/?token=abc",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": clientKey,
      },
    });
    req.on("upgrade", (res, socket) => {
      // `.destroy()`, not `.end()`: the fake Vite server above never closes its own side (a real WS
      // server does not either — the connection stays open for the app's lifetime), so a graceful
      // half-close here would never reach a full `close` on either socket, and `t.after`'s
      // `server.close()` calls below would hang waiting for a connection that never fully ends. An
      // abrupt destroy is also the more realistic test of the proxy's own cross-destroy cleanup
      // (`admin-dev-proxy.ts`'s `proxyAdminUpgrade`), which exists for exactly this kind of teardown.
      socket.destroy();
      resolve({ statusCode: res.statusCode, headers: res.headers });
    });
    req.on("response", (res) => reject(new Error(`expected an upgrade, got a plain ${res.statusCode} response`)));
    req.on("error", reject);
    req.end();
  });

  assert.equal(upgrade.statusCode, 101);
  assert.equal(upgrade.headers["sec-websocket-accept"], expectedAccept);
});

test("registerAdminDevProxyUpgrade: no-ops (no 'upgrade' listener added) when TOVU_ADMIN_DEV_PROXY_URL is unset", async () => {
  delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  const { registerAdminDevProxyUpgrade } = await import("../admin-dev-proxy.js");

  const registeredEvents: string[] = [];
  registerAdminDevProxyUpgrade({
    on: (event) => {
      registeredEvents.push(event);
      return undefined;
    },
  });

  assert.deepEqual(registeredEvents, []);
});

test("registerAdminDevProxyUpgrade: ignores an upgrade request outside /admin, leaving the socket untouched for any other listener", async (t) => {
  process.env.TOVU_ADMIN_DEV_PROXY_URL = "http://127.0.0.1:1";
  t.after(() => {
    delete process.env.TOVU_ADMIN_DEV_PROXY_URL;
  });
  const { registerAdminDevProxyUpgrade } = await import("../admin-dev-proxy.js");

  let capturedListener: ((req: unknown, socket: unknown, head: unknown) => void) | undefined;
  registerAdminDevProxyUpgrade({
    on: (_event, listener) => {
      capturedListener = listener as typeof capturedListener;
      return undefined;
    },
  });
  assert.ok(capturedListener, "an 'upgrade' listener must be registered when the proxy is configured");

  let destroyed = false;
  const fakeSocket = { destroy: () => (destroyed = true), write: () => {}, on: () => {} };
  // A non-/admin upgrade (e.g. some other future WS route) must be left alone, not destroyed —
  // destroying it here would pre-empt any other 'upgrade' listener on the same server.
  capturedListener?.({ url: "/something-else" }, fakeSocket, Buffer.alloc(0));

  assert.equal(destroyed, false);
});
