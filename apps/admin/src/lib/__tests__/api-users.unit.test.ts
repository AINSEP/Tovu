import { afterEach, expect, test, vi } from "vitest";

import { ApiError, api, type AdminIdentityUser } from "../api";

/**
 * @file First direct coverage pass for `api.ts`'s users/roles/policies-CRUD-completion endpoints
 * (SPEC-006 0.6.0). `listUsers`, `disableUser`, and `enableUser` had zero test anywhere in this
 * suite. `createUser`, `updateUser`, `resetUserPassword`, `assignRole`, and `attachPolicy` already
 * had option-branch body assertions in `api-endpoint-option-branches.unit.test.ts`, but none of
 * those asserted the exact URL/method or an error path — this file adds that, without duplicating
 * the existing option-branch tests.
 *
 * Same stub-real-`fetch`-and-assert-on-the-call pattern as `api-themes.unit.test.ts`/
 * `api-media.unit.test.ts`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function errJson(status: number, error: string, code?: string): Response {
  return new Response(JSON.stringify({ error, code }), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetchCapturing(response: Response = okJson({})): {
  calls: Array<{ url: string; init?: RequestInit }>;
  body(n?: number): unknown;
} {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return response;
    })
  );
  return {
    calls,
    body(n = 0) {
      const raw = calls[n]?.init?.body;
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    },
  };
}

const BASE = "/api/admin/v1/workspaces/workspace-local";

function user(overrides: Partial<AdminIdentityUser> = {}): AdminIdentityUser {
  return {
    principalId: "p1",
    workspaceId: "w1",
    username: "bob",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    roleIds: [],
    policyIds: [],
    ...overrides,
  };
}

// --- listUsers ---------------------------------------------------------------

test("listUsers GETs the workspace's user list and resolves it verbatim", async () => {
  const users = [user()];
  const { calls } = stubFetchCapturing(okJson({ users }));
  await expect(api.listUsers()).resolves.toEqual({ users });
  expect(calls[0].url).toBe(`${BASE}/users`);
  expect(calls[0].init?.method).toBeUndefined();
});

test("listUsers throws ApiError on a non-2xx response", async () => {
  stubFetchCapturing(errJson(403, "not permitted", "FORBIDDEN"));
  const error = await api.listUsers().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("FORBIDDEN");
});

// --- createUser ---------------------------------------------------------------

test("createUser POSTs to the users collection and resolves the created user", async () => {
  const created = user({ principalId: "p2" });
  const { calls } = stubFetchCapturing(okJson({ user: created }));
  const result = await api.createUser({ username: "bob", password: "pw" });
  expect(calls[0].url).toBe(`${BASE}/users`);
  expect(calls[0].init?.method).toBe("POST");
  expect(result).toEqual({ user: created });
});

test("createUser throws ApiError with code RESOURCE_CONFLICT for a username already in use", async () => {
  stubFetchCapturing(errJson(409, "that username is already in use", "RESOURCE_CONFLICT"));
  const error = await api.createUser({ username: "bob", password: "pw" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("RESOURCE_CONFLICT");
});

// --- updateUser ---------------------------------------------------------------

test("updateUser PATCHes /users/:principalId", async () => {
  const updated = user({ email: "new@x.com" });
  const { calls } = stubFetchCapturing(okJson({ user: updated }));
  const result = await api.updateUser({ principalId: "p1" }, { email: "new@x.com" });
  expect(calls[0].url).toBe(`${BASE}/users/p1`);
  expect(calls[0].init?.method).toBe("PATCH");
  expect(result).toEqual({ user: updated });
});

test("updateUser throws ApiError for an unknown principalId", async () => {
  stubFetchCapturing(errJson(404, "user not found"));
  const error = await api.updateUser({ principalId: "missing" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(404);
});

// --- disableUser / enableUser ---------------------------------------------------------------

test("disableUser POSTs to /users/:principalId/disable and resolves the disabled user", async () => {
  const disabled = user({ status: "disabled" });
  const { calls } = stubFetchCapturing(okJson({ user: disabled }));
  const result = await api.disableUser("p1");
  expect(calls[0].url).toBe(`${BASE}/users/p1/disable`);
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.body).toBeUndefined();
  expect(result).toEqual({ user: disabled });
});

test("disableUser throws ApiError for an unknown principalId", async () => {
  stubFetchCapturing(errJson(404, "user not found"));
  const error = await api.disableUser("missing").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

test("enableUser POSTs to /users/:principalId/enable and resolves the enabled user", async () => {
  const enabled = user({ status: "active" });
  const { calls } = stubFetchCapturing(okJson({ user: enabled }));
  const result = await api.enableUser("p1");
  expect(calls[0].url).toBe(`${BASE}/users/p1/enable`);
  expect(calls[0].init?.method).toBe("POST");
  expect(calls[0].init?.body).toBeUndefined();
  expect(result).toEqual({ user: enabled });
});

test("enableUser throws ApiError for an unknown principalId", async () => {
  stubFetchCapturing(errJson(404, "user not found"));
  const error = await api.enableUser("missing").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

// --- resetUserPassword ---------------------------------------------------------------

test("resetUserPassword POSTs to /users/:principalId/reset-password with the password in the body", async () => {
  const { calls, body } = stubFetchCapturing(okJson(null));
  const result = await api.resetUserPassword({ principalId: "p1", password: "new-pw" });
  expect(calls[0].url).toBe(`${BASE}/users/p1/reset-password`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ password: "new-pw" });
  expect(result).toBeNull();
});

test("resetUserPassword throws ApiError for a password that fails validation", async () => {
  stubFetchCapturing(errJson(400, "password too short", "VALIDATION_ERROR"));
  const error = await api.resetUserPassword({ principalId: "p1", password: "x" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe("VALIDATION_ERROR");
});

// --- assignRole ---------------------------------------------------------------

test("assignRole POSTs to /users/:principalId/roles with roleId in the body", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ assignment: { principalId: "p1", roleId: "r1" } }));
  const result = await api.assignRole({ principalId: "p1", roleId: "r1" });
  expect(calls[0].url).toBe(`${BASE}/users/p1/roles`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ roleId: "r1" });
  expect(result).toEqual({ assignment: { principalId: "p1", roleId: "r1" } });
});

test("assignRole throws ApiError for an unknown roleId", async () => {
  stubFetchCapturing(errJson(404, "role not found"));
  const error = await api.assignRole({ principalId: "p1", roleId: "missing" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});

// --- attachPolicy ---------------------------------------------------------------

test("attachPolicy POSTs to /users/:principalId/policies with policyId in the body", async () => {
  const { calls, body } = stubFetchCapturing(okJson({ attachment: { principalId: "p1", policyId: "pol1" } }));
  const result = await api.attachPolicy({ principalId: "p1", policyId: "pol1" });
  expect(calls[0].url).toBe(`${BASE}/users/p1/policies`);
  expect(calls[0].init?.method).toBe("POST");
  expect(body()).toEqual({ policyId: "pol1" });
  expect(result).toEqual({ attachment: { principalId: "p1", policyId: "pol1" } });
});

test("attachPolicy throws ApiError for an unknown policyId", async () => {
  stubFetchCapturing(errJson(404, "policy not found"));
  const error = await api.attachPolicy({ principalId: "p1", policyId: "missing" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
});
