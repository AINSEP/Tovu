import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import {
  ExternalMcpReauthRequiredError,
  ExternalMcpSecretStoreUnconfiguredError,
  ExternalMcpValidationError,
  type ExternalMcpOAuthService,
} from "#src/assistant/index";
import { OAuthError } from "#src/platform/oauth/index";
import type { RateLimiter, RateLimitResult } from "#src/contracts/core/rate-limit/rate-limit";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import {
  registerAdminExternalMcpOAuthConnectRoute,
  registerAdminExternalMcpOAuthDevicePollRoute,
  registerAdminExternalMcpOAuthDisconnectRoute,
  type ExternalMcpOAuthRouteDeps,
} from "../oauth.js";

/**
 * @file The parts of `oauth.ts` that `admin-external-mcp-oauth-routes.test.ts` (real service,
 * scripted provider) never reaches: the per-IP rate limit and its ordering IN FRONT of the auth
 * check, and every branch of `sendExternalMcpOAuthError` other than the provider 400/502 split —
 * the reauth 409, the unconfigured-secret-store 503, the validation 400 and the catch-all 500.
 *
 * The OAuth service is a double here on purpose: these branches are the route's mapping of errors
 * the service raises, and the real service cannot be made to raise most of them on demand.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers/higgs/oauth`;

function limiterOf(result: RateLimitResult): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    check(key: string) {
      keys.push(key);
      return result;
    },
  };
}

function buildApp(options: {
  service?: Partial<ExternalMcpOAuthService>;
  limiter?: RateLimiter;
  allowed?: boolean;
}): { app: express.Express; authorizeCalls: unknown[] } {
  const base = createRouteDeps();
  const authorizeCalls: unknown[] = [];
  const deps = {
    ...base,
    authorize: async (input: unknown) => {
      authorizeCalls.push(input);
      return options.allowed === false ? { allowed: false, reason: "no_grant" } : { allowed: true, reason: "matched" };
    },
    externalMcpOAuth: {
      beginConnect: async () => {
        throw new Error("beginConnect not scripted");
      },
      pollDeviceAuthorization: async () => {
        throw new Error("pollDeviceAuthorization not scripted");
      },
      disconnect: async () => {
        throw new Error("disconnect not scripted");
      },
      ...options.service,
    },
  } as unknown as ExternalMcpOAuthRouteDeps;
  const limiter = options.limiter ?? limiterOf({ allowed: true });

  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminExternalMcpOAuthConnectRoute(app, deps, limiter);
  registerAdminExternalMcpOAuthDevicePollRoute(app, deps, limiter);
  registerAdminExternalMcpOAuthDisconnectRoute(app, deps);
  return { app, authorizeCalls };
}

const post = (baseUrl: string, path: string) => fetch(`${baseUrl}${BASE}${path}`, { method: "POST" });

test("connect and device poll: an exhausted limiter is a 429 with Retry-After, answered BEFORE the auth check runs", async (t) => {
  let serviceCalls = 0;
  const { app, authorizeCalls } = buildApp({
    limiter: limiterOf({ allowed: false, retryAfterSeconds: 42 }),
    service: {
      beginConnect: async () => {
        serviceCalls += 1;
        return { kind: "redirect_required", url: "https://auth.example.com" } as never;
      },
      pollDeviceAuthorization: async () => {
        serviceCalls += 1;
        return { status: "pending", retryAfterSeconds: 5 } as never;
      },
    },
  });
  const baseUrl = await startTestServer(app, t);

  for (const path of ["/connect", "/device/poll"]) {
    const res = await post(baseUrl, path);
    assert.equal(res.status, 429, path);
    assert.equal(res.headers.get("retry-after"), "42", path);
    assert.deepEqual(
      await res.json(),
      { error: "too many OAuth attempts", code: "RATE_LIMIT_EXCEEDED", details: { retryAfterSeconds: 42 } },
      path
    );
  }
  assert.equal(authorizeCalls.length, 0, "the limiter must sit in front of authorize()");
  assert.equal(serviceCalls, 0);
});

test("disconnect is not rate-limited: an exhausted limiter does not block it", async (t) => {
  const limiter = limiterOf({ allowed: false, retryAfterSeconds: 42 });
  const disconnected: unknown[] = [];
  const { app } = buildApp({
    limiter,
    service: {
      disconnect: async (input: unknown) => {
        disconnected.push(input);
      },
    } as Partial<ExternalMcpOAuthService>,
  });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${BASE}`, { method: "DELETE" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { disconnected: true, restartRequired: true });
  assert.deepEqual(disconnected, [{ serverId: "higgs" }]);
  assert.equal(limiter.keys.length, 0);
});

test("all three routes refuse a principal without admin.integrations.manage with 403, before the service is called", async (t) => {
  let serviceCalls = 0;
  const count = async () => {
    serviceCalls += 1;
    return {} as never;
  };
  const { app } = buildApp({
    allowed: false,
    service: { beginConnect: count, pollDeviceAuthorization: count, disconnect: count } as Partial<ExternalMcpOAuthService>,
  });
  const baseUrl = await startTestServer(app, t);

  const responses = [
    await post(baseUrl, "/connect"),
    await post(baseUrl, "/device/poll"),
    await fetch(`${baseUrl}${BASE}`, { method: "DELETE" }),
  ];
  for (const res of responses) {
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code: string; details: { permission: string; reason: string } };
    assert.equal(body.code, "FORBIDDEN");
    assert.deepEqual(body.details, { permission: "admin.integrations.manage", reason: "no_grant" });
  }
  assert.equal(serviceCalls, 0);
});

test("a revoked authorization is a 409 carrying the reauth code, retryable:false and the settings deep link", async (t) => {
  const error = new ExternalMcpReauthRequiredError({ serverId: "higgs", label: "Higgs" });
  const { app } = buildApp({
    service: {
      pollDeviceAuthorization: async () => {
        throw error;
      },
    },
  });
  const baseUrl = await startTestServer(app, t);

  const res = await post(baseUrl, "/device/poll");
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    error: error.message,
    code: "EXTERNAL_MCP_REAUTH_REQUIRED",
    details: { retryable: false, settingsLink: error.settingsLink },
  });
  assert.ok(error.settingsLink.length > 0);
});

test("an unconfigured secret store is a 503 SECRET_STORE_UNCONFIGURED, the same contract put.ts answers with", async (t) => {
  const { app } = buildApp({
    service: {
      beginConnect: async () => {
        throw new ExternalMcpSecretStoreUnconfiguredError("no root key is configured");
      },
    },
  });
  const baseUrl = await startTestServer(app, t);

  const res = await post(baseUrl, "/connect");
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "no root key is configured", code: "SECRET_STORE_UNCONFIGURED" });
});

test("a validation error is a 400 INVALID_MCP_SERVER naming the offending field", async (t) => {
  const { app } = buildApp({
    service: {
      beginConnect: async () => {
        throw new ExternalMcpValidationError("authMode must be oauth", "authMode");
      },
    },
  });
  const baseUrl = await startTestServer(app, t);

  const res = await post(baseUrl, "/connect");
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    error: "authMode must be oauth",
    code: "INVALID_MCP_SERVER",
    details: { field: "authMode" },
  });
});

test("an OAuth slow_down forwards retryable:true and retryAfterSeconds; one without an interval omits the key", async (t) => {
  let call = 0;
  const { app } = buildApp({
    service: {
      pollDeviceAuthorization: async () => {
        call += 1;
        throw call === 1
          ? new OAuthError("OAUTH_SLOW_DOWN", "polling too fast", { operatorAction: "Wait, then poll again.", retryAfterSeconds: 15 })
          : new OAuthError("OAUTH_ACCESS_DENIED", "access denied", { operatorAction: "Start again." });
      },
    },
  });
  const baseUrl = await startTestServer(app, t);

  const slow = await post(baseUrl, "/device/poll");
  assert.equal(slow.status, 400);
  assert.deepEqual(await slow.json(), {
    error: "polling too fast",
    code: "OAUTH_SLOW_DOWN",
    details: { retryable: true, operatorAction: "Wait, then poll again.", retryAfterSeconds: 15 },
  });

  const denied = await post(baseUrl, "/device/poll");
  assert.equal(denied.status, 400);
  assert.deepEqual(await denied.json(), {
    error: "access denied",
    code: "OAUTH_ACCESS_DENIED",
    details: { retryable: false, operatorAction: "Start again." },
  });
});

test("an unexpected error is a 500 INTERNAL_ERROR on every route, never the raw message", async (t) => {
  const boom = async () => {
    throw new Error("token=SECRET-ABC leaked");
  };
  const { app } = buildApp({
    service: { beginConnect: boom, pollDeviceAuthorization: boom, disconnect: boom } as Partial<ExternalMcpOAuthService>,
  });
  const baseUrl = await startTestServer(app, t);
  const originalError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalError;
  });

  const responses = [
    await post(baseUrl, "/connect"),
    await post(baseUrl, "/device/poll"),
    await fetch(`${baseUrl}${BASE}`, { method: "DELETE" }),
  ];
  for (const res of responses) {
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });
  }
});
