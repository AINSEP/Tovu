import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import test from "node:test";

import { AUTO_START_PORT_ATTEMPTS, reserveBootListener } from "../boot-listener.js";

/**
 * @file `reserveBootListener` against REAL loopback sockets: the bound address is what `TOVU_HOST`
 * actually changes, so it is read back from `server.address()` rather than from a fake's arguments.
 */

const servers: Server[] = [];

function freshServer(): Server {
  const server = createServer();
  servers.push(server);
  return server;
}

test.afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

/** A port currently held on 127.0.0.1 by another server, low enough that the whole auto-start range
 *  fits under 65535 (`listenServer` refuses a range past it with a RangeError). */
async function heldPort(): Promise<number> {
  for (;;) {
    const holder = freshServer();
    await new Promise<void>((resolve) => holder.listen({ port: 0, host: "127.0.0.1" }, resolve));
    const { port } = holder.address() as { port: number };
    if (port + AUTO_START_PORT_ATTEMPTS <= 65535) return port;
  }
}

test("a resolved bindHost is the address the server actually binds", async () => {
  const server = freshServer();
  const port = await reserveBootListener({ server, port: 0, bindHost: "127.0.0.1" });

  assert.deepEqual(server.address(), { address: "127.0.0.1", family: "IPv4", port });
});

test("an undefined bindHost keeps Node's own all-interfaces bind", async () => {
  const server = freshServer();
  await reserveBootListener({ server, port: 0, bindHost: undefined });

  assert.ok(["::", "0.0.0.0"].includes((server.address() as { address: string }).address));
});

test("without autoStartPort a held port is one attempt and fails with EADDRINUSE", async () => {
  const port = await heldPort();

  await assert.rejects(reserveBootListener({ server: freshServer(), port, bindHost: "127.0.0.1" }), { code: "EADDRINUSE" });
});

test("autoStartPort moves past a held port to the next free one in its range", async () => {
  const port = await heldPort();
  const server = freshServer();

  const bound = await reserveBootListener({ server, port, bindHost: "127.0.0.1" }, { autoStartPort: true });

  assert.ok(bound > port && bound < port + AUTO_START_PORT_ATTEMPTS, `bound ${bound}, held ${port}`);
  assert.equal((server.address() as { address: string }).address, "127.0.0.1");
});
