import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { DEV_PROXY_TLS } from "./fixtures/admin-dev-proxy-tls.js";
import test from "node:test";

import express from "express";

import { registerAdminStatic } from "../admin-static.js";
import { stripHopByHopHeaders } from "../admin-dev-proxy.js";

/**
 * @file Proves the dev-proxy branch of `registerAdminStatic` (`admin-dev-proxy.ts`) actually
 * forwards bytes and the HMR `upgrade` event, rather than just type-checking.
 *
 * Proxy tests stand up a REAL fake "Vite" server and a REAL Express app with
 * `registerAdminStatic` mounted, both bound to ephemeral ports, and drives them with real sockets —
 * no mocking of `node:http`/`node:https` itself. `TOVU_ADMIN_DEV_PROXY_URL` is pointed at
 * a loopback HTTP or HTTPS upstream. HTTPS fixtures use a self-signed development certificate
 * to exercise both content and HMR transport through the proxy's TLS branch.
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
  const received: Array<{ method: string | undefined; cookie: string | undefined; host: string | undefined; body: string }> = [];
  const fakeVite = createHttpServer((req, res) => {
    receivedPaths.push(req.url ?? "");
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        received.push({ method: req.method, cookie: req.headers.cookie, host: req.headers.host, body: Buffer.concat(chunks).toString("utf8") });
        res.writeHead(404, { "content-type": "text/plain", "x-fake-vite": "1" });
        res.end("upstream missing asset");
      });
      return;
    }
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
  const posted = await fetch(`${baseUrl}/admin/missing?probe=body`, {
    method: "POST", headers: { "content-type": "text/plain", cookie: "vite-session=probe" }, body: "distinct request payload",
  });
  assert.equal(posted.status, 404);
  assert.equal(posted.headers.get("x-fake-vite"), "1");
  assert.equal(await posted.text(), "upstream missing asset");
  assert.deepEqual(receivedPaths, ["/admin/src/main.tsx?t=123", "/admin/missing?probe=body"]);
  assert.deepEqual(received, [{ method: "POST", cookie: "vite-session=probe", host: `127.0.0.1:${fakeViteAddress.port}`, body: "distinct request payload" }]);
});

test("stripHopByHopHeaders: drops connection/transfer-encoding/upgrade but keeps every other header untouched", () => {
  const filtered = stripHopByHopHeaders({
    connection: "keep-alive",
    "transfer-encoding": "chunked",
    upgrade: "websocket",
    "keep-alive": "timeout=5",
    "proxy-authenticate": "Basic",
    "content-type": "text/javascript",
    "x-fake-vite": "1",
  });
  assert.deepEqual(filtered, {
    "content-type": "text/javascript",
    "x-fake-vite": "1",
  });
});

test("registerAdminStatic dev-proxy mode: does not relay the upstream's own Connection header value to the client — that header describes the proxy's hop to Vite, not the client's hop to this server, and (on an HTTP/2 client) forwarding it verbatim would throw ERR_HTTP2_INVALID_CONNECTION_HEADER outright; the fake Vite below sets `Connection: close`, a value the admin server's own keep-alive hop to the client would never choose on its own, to make a leak observable over plain HTTP/1.1 too", async (t) => {
  const fakeVite = createHttpServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain", connection: "close", "x-fake-vite": "1" });
    res.end("ok");
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

  const res = await fetch(`${baseUrl}/admin/whatever`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-fake-vite"), "1");
  assert.notEqual(res.headers.get("connection"), "close");
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

for (const protocol of ["http", "https"] as const) {
test(`registerAdminDevProxyUpgrade: forwards HMR data in both directions through a real ${protocol} upstream`, { timeout: 8_000 }, async (t) => {
  const { registerAdminDevProxyUpgrade } = await import("../admin-dev-proxy.js");
  const tunnelSockets = new Set<import("node:stream").Duplex>();
  t.after(() => { for (const socket of tunnelSockets) socket.destroy(); });

  // Stands in for Vite's own ws server: performs a real RFC 6455 handshake so this test proves the
  // proxy carries a genuine upgrade (matching `Sec-WebSocket-Accept`), not just that some bytes moved.
  const rejectPlainRequest = (_req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => { res.writeHead(404).end(); };
  const fakeVite = protocol === "https" ? createHttpsServer(DEV_PROXY_TLS, rejectPlainRequest) : createHttpServer(rejectPlainRequest);
  const clientFrame = Buffer.from([0x81, 0x82, 1, 2, 3, 4, 0x68 ^ 1, 0x69 ^ 2]); // masked "hi"
  const serverFrame = Buffer.concat([Buffer.from([0x81, 9]), Buffer.from("hmr-reply")]);
  let upstreamClosed!: () => void;
  const upstreamTermination = new Promise<void>((resolve) => { upstreamClosed = resolve; });
  fakeVite.on("upgrade", (req, socket) => {
    tunnelSockets.add(socket);
    socket.on("close", upstreamClosed);
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
    let buffered = Buffer.alloc(0);
    socket.on("data", (bytes) => {
      buffered = Buffer.concat([buffered, bytes]);
      if (buffered.length < clientFrame.length) return;
      if (!buffered.equals(clientFrame)) { socket.destroy(); return; }
      socket.write(serverFrame);
    });
  });
  fakeVite.listen(0);
  t.after(() => new Promise<void>((resolve) => fakeVite.close(() => resolve())));
  await new Promise<void>((resolve) => fakeVite.on("listening", () => resolve()));
  const fakeViteAddress = fakeVite.address();
  if (fakeViteAddress === null || typeof fakeViteAddress === "string") throw new Error("test setup: expected a bound TCP address");

  process.env.TOVU_ADMIN_DEV_PROXY_URL = `${protocol}://127.0.0.1:${fakeViteAddress.port}`;
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
    req.on("upgrade", (res, socket, head) => {
      tunnelSockets.add(socket);
      let buffered = head;
      socket.on("data", (bytes) => {
        buffered = Buffer.concat([buffered, bytes]);
        if (buffered.length < serverFrame.length) return;
        try {
          assert.deepEqual(buffered, serverFrame, "upstream HMR payload must cross the pipe unchanged");
          // Destroy rather than half-close: the upstream keeps a WebSocket open for its lifetime,
          // so end() can leave server.close() waiting forever. This also exercises the proxy's
          // cross-destroy cleanup, whose upstream close is awaited below.
          socket.destroy();
          resolve({ statusCode: res.statusCode, headers: res.headers });
        } catch (error) {
          socket.destroy();
          reject(error);
        }
      });
      socket.on("error", reject);
      socket.write(clientFrame);
    });
    req.on("response", (res) => reject(new Error(`expected an upgrade, got a plain ${res.statusCode} response`)));
    req.on("error", reject);
    req.end();
  });

  assert.equal(upgrade.statusCode, 101);
  assert.equal(upgrade.headers["sec-websocket-accept"], expectedAccept);
  await upstreamTermination;
});
}

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

test("registerAdminStatic proxies HTTPS content through a self-signed development certificate", async (t) => {
  const upstream = createHttpsServer(DEV_PROXY_TLS, (req, res) => {
    res.writeHead(req.url === "/admin/tls-probe" ? 200 : 404, { "content-type": "text/plain" });
    res.end("TLS upstream content");
  });
  t.after(() => { upstream.closeAllConnections(); return new Promise<void>((resolve) => upstream.close(() => resolve())); });
  upstream.listen(0);
  await new Promise<void>((resolve) => upstream.on("listening", resolve));
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");
  const previous = process.env.TOVU_ADMIN_DEV_PROXY_URL;
  process.env.TOVU_ADMIN_DEV_PROXY_URL = `https://127.0.0.1:${address.port}`;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_ADMIN_DEV_PROXY_URL; else process.env.TOVU_ADMIN_DEV_PROXY_URL = previous; });
  const baseUrl = await startAdminApp(t, "/nonexistent-dist-dir");
  const res = await fetch(`${baseUrl}/admin/tls-probe`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "TLS upstream content");
});
