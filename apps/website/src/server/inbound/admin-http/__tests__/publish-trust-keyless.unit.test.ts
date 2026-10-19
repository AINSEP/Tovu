import assert from "node:assert/strict";
import test from "node:test";

import type { NextFunction, Request, Response } from "express";

import { requirePublishTrust } from "../publish-trust-auth.js";

// A process started without its site key cannot derive its own installation id. A bearer token it
// cannot verify must still reach the session gate (an API key uses the same header), not leave the
// request hanging on the rejected derivation.
test("a keyless instance passes a bearer request on to the session gate instead of hanging", async () => {
  const noKey = Promise.reject(new Error("no site key"));
  noKey.catch(() => undefined);
  const middleware = requirePublishTrust({
    keyring: {} as never,
    workspaceId: "w-1",
    clock: { nowIso: () => "2026-09-26T00:00:00.000Z" },
    targetInstallationId: noKey,
    grants: (() => {
      throw new Error("grants must not be read");
    }) as never,
    revocations: async () => {
      throw new Error("revocations must not be read");
    },
  });
  const req = { headers: { authorization: "Bearer some-api-key" }, originalUrl: "/api/admin/v1/me" } as unknown as Request;
  const res = {} as Response;
  let nextCalls = 0;
  let nextArg: unknown;
  const next: NextFunction = (arg?: unknown) => {
    nextCalls += 1;
    nextArg = arg;
  };

  await middleware(req, res, next);

  assert.equal(nextCalls, 1);
  assert.equal(nextArg, undefined);
});

// The id was derived at boot, but the session key is derived per request: a site key that goes
// missing afterwards must not turn into a rejected middleware either.
test("a keyring that fails at verify time passes the request on instead of hanging", async () => {
  const middleware = requirePublishTrust({
    keyring: {
      derive: async () => {
        throw new Error("no site key");
      },
    } as never,
    workspaceId: "w-1",
    clock: { nowIso: () => "2026-09-26T00:00:00.000Z" },
    targetInstallationId: Promise.resolve("dest-1"),
    grants: (() => {
      throw new Error("grants must not be read");
    }) as never,
    revocations: async () => {
      throw new Error("revocations must not be read");
    },
  });
  const req = { headers: { authorization: "Bearer payload.mac" }, originalUrl: "/api/admin/v1/me" } as unknown as Request;
  let nextCalls = 0;
  let nextArg: unknown;
  const next: NextFunction = (arg?: unknown) => {
    nextCalls += 1;
    nextArg = arg;
  };

  await middleware(req, {} as Response, next);

  assert.equal(nextCalls, 1);
  assert.equal(nextArg, undefined);
});

test("non-bearer authorization proceeds to the ordinary credential gate without reading publishing state", async () => {
  let reads = 0;
  const middleware = requirePublishTrust({
    keyring: { derive: async () => { reads++; throw new Error("must not derive"); } } as never,
    workspaceId: "ws-1", clock: { nowIso: () => "2026-10-19T00:00:00Z" },
    targetInstallationId: Promise.resolve("destination"),
    grants: (() => { reads++; throw new Error("must not read grants"); }) as never,
    revocations: async () => { reads++; throw new Error("must not read revocations"); },
  });
  for (const authorization of [undefined, "Basic dXNlcjpwYXNz", "Bearer", "Bearer   "]) {
    const headers = authorization === undefined ? {} : { authorization };
    let calls = 0;
    await middleware({ headers } as Request, {} as Response, (error) => {
      assert.equal(error, undefined);
      calls++;
    });
    assert.equal(calls, 1);
  }
  assert.equal(reads, 0);
});

import { getPublishTrustContext, type PublishTrustContext } from "../publish-trust-auth.js";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";

test("publishing context remains absent for ordinary credentials and preserves an attached grant", () => {
  const { res } = createCapturingResponse();
  assert.equal(getPublishTrustContext(res), null);
  const context: PublishTrustContext = {
    sourceInstallationId: "source-1", capabilities: ["publish_content.apply"], entityTypes: ["post"], generation: 2,
  };
  res.locals.publishTrust = context;
  assert.strictEqual(getPublishTrustContext(res), context);
});
