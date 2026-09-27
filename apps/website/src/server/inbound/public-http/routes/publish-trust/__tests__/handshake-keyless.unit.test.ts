import assert from "node:assert/strict";
import test from "node:test";

import type { Express, Request, Response } from "express";

import { InMemoryPublishChallengeStore } from "#src/features/publish-trust/challenge";
import type { PublishTrustResolution } from "#src/features/publish-trust/provisioning";
import { registerPublishTrustHandshakeRoutes, type PublishTrustHandshakeDeps } from "../handshake.js";

// A process started without its root key cannot derive its own installation id. Express 4 does not
// catch a rejected async handler, so each handshake route that awaited the derivation left the
// caller hanging and logged an unhandled rejection. Each must answer at once with a typed 503.

type Handler = (req: Request, res: Response) => Promise<void>;

const clock = { nowIso: () => "2026-09-26T00:00:00.000Z" };

/** Registers the routes on a stand-in app and returns each handler by `METHOD path`. */
function routes(overrides: Partial<PublishTrustHandshakeDeps> = {}): Map<string, Handler> {
  const noKey = Promise.reject(new Error("no root key"));
  noKey.catch(() => undefined);
  const handlers = new Map<string, Handler>();
  const app = {
    get: (path: string, handler: Handler) => handlers.set(`GET ${path}`, handler),
    post: (path: string, handler: Handler) => handlers.set(`POST ${path}`, handler),
  } as unknown as Express;
  registerPublishTrustHandshakeRoutes(app, {
    keyring: {} as never,
    workspaceId: "w-1",
    clock,
    idGen: { newId: () => "nonce-1" },
    challengeStore: new InMemoryPublishChallengeStore(clock),
    targetInstallationId: noKey,
    grants: async () => ({ state: "configured", origin: "env", grants: [ACTIVE_GRANT], reason: null }) as PublishTrustResolution,
    ...overrides,
  });
  return handlers;
}

const ACTIVE_GRANT = {
  version: 1,
  sourceInstallationId: "src-1",
  publicKeys: [{ publicKeyB64u: "k", generation: 1 }],
  workspaceId: "w-1",
  entityTypes: ["page"],
  capabilities: ["publish_content.apply"],
  notAfter: "2027-01-01T00:00:00.000Z",
};

function fakeReq(body: unknown = {}): Request {
  return {
    body,
    protocol: "https",
    headers: {},
    socket: { remoteAddress: "10.0.0.1" },
    ip: "10.0.0.1",
    get: (name: string) => (name.toLowerCase() === "host" ? "dest.example" : undefined),
  } as unknown as Request;
}

function fakeRes() {
  const sent: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    setHeader: () => res,
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

const KEYLESS_BODY = {
  error: "This site has no usable Site Token yet, so it cannot accept publishes. Set one up on this site first.",
  code: "SECRET_STORE_UNCONFIGURED",
};

test("GET /identity on a keyless instance answers 503 instead of hanging", async () => {
  const { res, sent } = fakeRes();
  await routes().get("GET /api/publish-trust/v1/identity")!(fakeReq(), res);
  assert.equal(sent.status, 503);
  assert.deepEqual(sent.body, KEYLESS_BODY);
});

test("POST /challenge on a keyless instance answers 503 instead of hanging", async () => {
  const { res, sent } = fakeRes();
  await routes().get("POST /api/publish-trust/v1/challenge")!(fakeReq(), res);
  assert.equal(sent.status, 503);
  assert.deepEqual(sent.body, KEYLESS_BODY);
});

test("POST /session with an active grant on a keyless instance answers 503 instead of hanging", async () => {
  const { res, sent } = fakeRes();
  const body = { nonce: "n", sourceInstallationId: "src-1", generation: 1, capabilities: ["publish_content.apply"], signatureB64u: "s" };
  await routes().get("POST /api/publish-trust/v1/session")!(fakeReq(body), res);
  assert.equal(sent.status, 503);
  assert.deepEqual(sent.body, KEYLESS_BODY);
});

test("POST /session answers 500 rather than hanging when the grant store throws", async () => {
  const { res, sent } = fakeRes();
  const handlers = routes({
    grants: async () => {
      throw new Error("grant store exploded");
    },
  });
  const body = { nonce: "n", sourceInstallationId: "src-1", generation: 1, capabilities: [], signatureB64u: "s" };
  const logged: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    await handlers.get("POST /api/publish-trust/v1/session")!(fakeReq(body), res);
  } finally {
    console.error = originalError;
  }
  assert.equal(sent.status, 500);
  assert.deepEqual(sent.body, { error: "the publishing handshake failed", code: "INTERNAL_ERROR" });
  assert.equal(logged.length, 1);
});
