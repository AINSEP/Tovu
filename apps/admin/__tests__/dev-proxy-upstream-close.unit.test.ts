import { type ChildProcess, spawn } from "node:child_process";
import { createServer, get, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { createInterface } from "node:readline";
import { afterEach, expect, test } from "vitest";

/**
 * @file Regression coverage for `dev-proxy-upstream-close.ts`: a real Vite dev server proxying `/api`
 * to a throwaway upstream, run in a child process (see the fixture's header for why).
 *
 * The bug (2026-09-26): tsx watch restarted the API while the admin's frontend-session SSE feed was
 * open through the :5173 proxy. The browser's stream never ended, so `EventSource` never reconnected
 * and the assistant kept binding runs with the dead daemon's token.
 */

const fixture = path.resolve(__dirname, "fixtures/dev-proxy-server.mjs");
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

async function startUpstream(): Promise<{ server: Server; port: number; sockets: Set<Socket> }> {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    if (req.url === "/api/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      res.write("data: hello\n\n");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("complete body");
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => server.close());
  return { server, port: (server.address() as { port: number }).port, sockets };
}

async function startProxy(upstreamPort: number): Promise<number> {
  const child: ChildProcess = spawn(process.execPath, ["--no-warnings", fixture, String(upstreamPort)], {
    cwd: path.resolve(__dirname, ".."),
    stdio: ["ignore", "pipe", "inherit"],
  });
  cleanups.push(() => child.kill("SIGTERM"));
  const lines = createInterface({ input: child.stdout! });
  for await (const line of lines) {
    if (line.startsWith("{")) return (JSON.parse(line) as { port: number }).port;
  }
  throw new Error("proxy fixture exited before reporting its port");
}

function request(port: number, urlPath: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = get({ host: "127.0.0.1", port, path: urlPath }, resolve);
    req.on("error", reject);
    cleanups.push(() => req.destroy());
  });
}

test("the client's SSE stream ends when the upstream dies mid-stream", async () => {
  const upstream = await startUpstream();
  const proxyPort = await startProxy(upstream.port);

  const res = await request(proxyPort, "/api/stream");
  expect(res.statusCode).toBe(200);
  const firstChunk = await new Promise<string>((resolve) => res.once("data", (chunk: Buffer) => resolve(String(chunk))));
  expect(firstChunk).toContain("data: hello");

  const streamClosed = new Promise<"closed">((resolve) => res.once("close", () => resolve("closed")));
  // What a tsx watch restart does to the API: every open socket drops with no graceful end.
  for (const socket of upstream.sockets) socket.destroy();
  upstream.server.close();

  const outcome = await Promise.race([
    streamClosed,
    new Promise<"still open">((resolve) => setTimeout(() => resolve("still open"), 3000)),
  ]);
  expect(outcome).toBe("closed");
}, 20_000);

async function deadPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function outcomeOf(port: number, urlPath: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve) => {
    const req = get({ host: "127.0.0.1", port, path: urlPath, headers }, (res) => {
      res.resume();
      const marked = res.headers["x-tovu-dev-proxy"] === "upstream-refused" ? " upstream-refused" : "";
      resolve(`status ${res.statusCode}${marked}`);
    });
    req.on("error", () => resolve("connection dropped"));
    cleanups.push(() => req.destroy());
  });
}

test("an SSE reconnect while the upstream is down drops the connection, so EventSource keeps retrying", async () => {
  // `EventSource` retries a network error on its own but gives up for good on an HTTP error
  // status — and Vite answers an unreachable upstream with a 500.
  const proxyPort = await startProxy(await deadPort());

  expect(await outcomeOf(proxyPort, "/api/stream", { Accept: "text/event-stream" })).toBe("connection dropped");
  // The drop came from the hook, not from the proxy process dying under Vite's own error handler.
  expect(await outcomeOf(proxyPort, "/api/plain", { Accept: "application/json" })).toBe("status 503 upstream-refused");
}, 20_000);

// 2026-10-05: was "still gets Vite's 500". A refused upstream never saw the request, so the hook now
// says so (503 + marker header) and the admin's `request()` waits for the restart and retries it.
test("a non-SSE request to a refusing upstream gets a 503 marked upstream-refused", async () => {
  const proxyPort = await startProxy(await deadPort());

  expect(await outcomeOf(proxyPort, "/api/plain", { Accept: "application/json" })).toBe("status 503 upstream-refused");
}, 20_000);

test("a normal response still arrives whole", async () => {
  const upstream = await startUpstream();
  const proxyPort = await startProxy(upstream.port);

  const res = await request(proxyPort, "/api/plain");
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (chunk: string) => (body += chunk));
  await new Promise<void>((resolve, reject) => {
    res.once("end", resolve);
    res.once("error", reject);
  });
  expect(res.complete).toBe(true);
  expect(body).toBe("complete body");
}, 20_000);
