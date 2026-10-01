import assert from "node:assert/strict";
import test, { mock } from "node:test";
import * as dns from "node:dns";
import type { Express, Request, Response, RequestHandler } from "express";
import type { AssistantExecutionRouteDeps } from "../execution-deps.js";

// Mock only DNS answers. The route, credential selection, runtime validators and outbound
// transports remain real; private-address tests must never open an external connection.
let addresses = [{ address: "10.0.0.5", family: 4 }];
const lookups: string[] = [];
const { default: dnsDefault, ...dnsExports } = dns;
mock.module("node:dns", {
  defaultExport: dnsDefault,
  namedExports: {
    ...dnsExports,
    promises: {
      ...dns.promises,
      lookup: async (hostname: string) => {
        assert.equal(hostname, "provider.invalid");
        lookups.push(hostname);
        return addresses;
      },
    },
  },
});
const { registerAdminAssistantListModelsRoute } = await import("../list-models.js");
const { registerAdminAssistantTestConnectionRoute } = await import("../test-connection.js");

const registrars = [registerAdminAssistantListModelsRoute, registerAdminAssistantTestConnectionRoute];

async function probe(registrar: (typeof registrars)[number], baseUrl: string) {
  let handler: RequestHandler | undefined;
  registrar({ post: (_path: string, registered: RequestHandler) => { handler = registered; } } as unknown as Express, {
    workspaceId: "workspace-local",
    authorize: async () => ({ allowed: true, reason: "allowed" }),
  } as AssistantExecutionRouteDeps);
  let status = 200;
  let body: { ok: boolean; message: string; models?: string[] } | undefined;
  const response = {
    locals: { principal: { id: "admin" } },
    status: (value: number) => { status = value; return response; },
    json: (value: typeof body) => { body = value; },
  };
  assert.ok(handler);
  await handler({
    params: { workspaceId: "workspace-local" },
    body: { protocol: "openai", baseUrl, apiKey: "sk-fake", model: "guard-model" },
  } as Request, response as unknown as Response, (error) => { throw error; });
  assert.equal(status, 200);
  assert.ok(body);
  return body;
}

for (const registrar of registrars) {
  test(`${registrar.name}: rejects private and mixed DNS answers through the real route`, async () => {
    for (const answers of [
      [{ address: "10.0.0.5", family: 4 }],
      [{ address: "fc00::1", family: 6 }],
      [{ address: "fe80::1", family: 6 }],
      [{ address: "::ffff:10.0.0.5", family: 6 }],
      [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }],
    ]) {
      addresses = answers;
      lookups.length = 0;
      const body = await probe(registrar, "http://provider.invalid");
      assert.equal(body.ok, false);
      assert.equal(body.message, "Internal IPs blocked");
      assert.deepEqual(lookups, ["provider.invalid"], "the route must run DNS-aware validation");
    }
  });

  test(`${registrar.name}: refuses a provider redirect without reaching its target`, async (t) => {
    // Native fetch owns redirect handling. Only its HTTP dispatcher is in-memory, so this
    // exercises fetch's real follow/error behavior without opening sockets in the sandbox.
    const nativeFetch = globalThis.fetch;
    for (const target of ["http://169.254.169.254/", "http://127.0.0.1:4322/"]) {
      const requests: string[] = [];
      const dispatcher = {
        dispatch(options: { origin: string; path: string }, handler: {
          onConnect: (abort: () => void) => void;
          onHeaders: (status: number, headers: Buffer[], resume: () => void, statusText: string) => void;
          onData: (chunk: Buffer) => void;
          onComplete: (trailers: Buffer[]) => void;
        }) {
          const url = `${options.origin}${options.path}`;
          requests.push(url);
          queueMicrotask(() => {
            handler.onConnect(() => {});
            if (requests.length === 1) {
              handler.onHeaders(302, [Buffer.from("location"), Buffer.from(target)], () => {}, "Found");
            } else {
              handler.onHeaders(200, [Buffer.from("content-type"), Buffer.from("application/json")], () => {}, "OK");
              handler.onData(Buffer.from(JSON.stringify({ data: [{ id: "guard-model" }], choices: [{ message: { content: "OK" } }] })));
            }
            handler.onComplete([]);
          });
          return true;
        },
      };
      const fetchMock = t.mock.method(globalThis, "fetch", (url: Parameters<typeof nativeFetch>[0], init?: RequestInit) =>
        nativeFetch(url, { ...init, dispatcher } as RequestInit));
      try {
        const body = await probe(registrar, "http://127.0.0.1:4321");
        assert.equal(requests.length, 1, `redirect to ${target} must never dispatch a second request`);
        assert.equal(body.ok, false);
      } finally {
        fetchMock.mock.restore();
      }
    }
  });
}
