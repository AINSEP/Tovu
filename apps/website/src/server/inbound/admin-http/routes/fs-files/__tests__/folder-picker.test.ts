import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "#src/features/fs-files/custom-root-permission";
import { registerAdminFsFilesFolderPickerRoutes } from "../folder-picker.js";

type Deps = Parameters<typeof registerAdminFsFilesFolderPickerRoutes>[0]["deps"];
const path = "/api/admin/v1/workspaces/:workspaceId/fs-files/folder-picker";
type RequestInput = {
  method?: "get" | "post"; local?: string; remote?: string; host?: string; origin?: string;
  headers?: Record<string, string>; credential?: string; workspaceId?: string; protocol?: string;
};

function fixture(overrides: Partial<Pick<Deps, "localHost">> & { available?: boolean; pick?: () => Promise<string | null> } = {}) {
  const calls: unknown[] = [];
  let allowed = true;
  const deps: Deps = {
    workspaceId: "ws",
    authorize: async (input) => { calls.push(input); return { allowed, reason: "pin" }; },
    localHost: overrides.localHost ?? true,
    folderPicker: {
      available: overrides.available ?? true,
      pick: async () => { calls.push("pick"); return overrides.pick ? overrides.pick() : "/Users/la/Picked"; },
    },
  };
  const app = express(); registerAdminFsFilesFolderPickerRoutes({ app, deps });
  return { calls, deny: () => { allowed = false; },
    async request(input: RequestInput = {}) {
      const { method, local, remote, host, origin, headers, credential, workspaceId, protocol } = {
        method: "post" as const, local: "127.0.0.1", remote: "127.0.0.1", host: "localhost:5173",
        origin: undefined, headers: {}, credential: "session", workspaceId: "ws", protocol: "https", ...input,
      };
      const response = createCapturingResponse();
      const writtenHeaders: Record<string, unknown> = {};
      response.res.setHeader = (name, value) => { writtenHeaders[name] = value; return response.res; };
      response.res.locals.principal = { id: "admin-1" }; response.res.locals.authCredentialKind = credential;
      const requestHeaders = { host, ...headers, ...(origin === undefined ? {} : { origin }) };
      await extractRouteHandler(app, method, path)({ params: { workspaceId }, protocol,
        socket: { localAddress: local, remoteAddress: remote }, headers: requestHeaders,
        get: (name: string) => requestHeaders[name as keyof typeof requestHeaders],
      }, response.res);
      assert.equal(writtenHeaders["Cache-Control"], "no-store");
      return response.capture;
    },
  };
}

test("a local admin session sees the picker and gets the chosen path back", async () => {
  const f = fixture();
  assert.deepEqual((await f.request({ method: "get" })).jsonBody, { available: true });
  assert.deepEqual(await f.request({ origin: "https://localhost:5173" }), { statusCode: 200, jsonBody: { path: "/Users/la/Picked" } });
  assert.deepEqual(f.calls.filter(call => call !== "pick").at(-1),
    { principalId: "admin-1", permission: FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION, workspaceId: "ws" });
  // A cancelled dialog is an ordinary answer, not an error.
  assert.deepEqual(await fixture({ pick: async () => null }).request(), { statusCode: 200, jsonBody: { path: null } });
});

test("a deployed/hosted runtime, an unsupported OS or another workspace 404s before anything else runs", async () => {
  for (const options of [{ localHost: false }, { available: false }]) {
    for (const method of ["get", "post"] as const) {
      const f = fixture(options);
      assert.equal((await f.request({ method })).statusCode, 404, JSON.stringify(options));
      assert.deepEqual(f.calls, []);
    }
  }
  const other = fixture();
  assert.equal((await other.request({ workspaceId: "other" })).statusCode, 404);
  assert.deepEqual(other.calls, []);
});

test("a request that is not from this machine is refused even with a valid session", async () => {
  const remote: RequestInput[] = [
    { remote: "192.0.2.7" }, { local: "192.0.2.1" }, { remote: "" },
    { headers: { "x-forwarded-for": "127.0.0.1" } }, { headers: { forwarded: "for=127.0.0.1" } },
    { host: "tovu.example.com" }, { host: "[" }, { origin: "https://evil.example" },
  ];
  for (const input of remote) {
    for (const method of ["get", "post"] as const) {
      const f = fixture();
      assert.deepEqual(await f.request({ method, ...input }), { statusCode: 403, jsonBody: { reasonCode: "local-host-only" } }, JSON.stringify(input));
      assert.deepEqual(f.calls, []);
    }
  }
});

test("an API key, or a session without the folder permission, never opens the dialog", async () => {
  const apiKey = fixture();
  assert.equal((await apiKey.request({ credential: "api_key" })).statusCode, 403);
  assert.deepEqual(apiKey.calls, []);
  const denied = fixture(); denied.deny();
  assert.equal((await denied.request()).statusCode, 403);
  assert.equal((await denied.request({ method: "get" })).statusCode, 403);
  assert.ok(!denied.calls.includes("pick"));
});

test("one dialog at a time: a second pick while one is open is a 409", async () => {
  let release: ((value: string | null) => void) | undefined;
  // Only the first dialog is held open; any later one answers at once.
  const f = fixture({ pick: () => release ? Promise.resolve("/b") : new Promise(resolve => { release = resolve; }) });
  const first = f.request();
  for (let turn = 0; turn < 100 && !f.calls.includes("pick"); turn++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.calls.includes("pick"), "the first dialog never opened");
  assert.deepEqual(await f.request(), { statusCode: 409, jsonBody: { reasonCode: "busy" } });
  release!("/a");
  assert.deepEqual((await first).jsonBody, { path: "/a" });
  // Released after it settles, so the next click works again.
  assert.equal((await f.request()).statusCode, 200);
});

test("a chooser failure is a fixed 500 that never echoes the cause, and frees the slot", async () => {
  const f = fixture({ pick: async () => { throw new Error("osascript: secret detail /Users/la"); } });
  assert.deepEqual(await f.request(), { statusCode: 500, jsonBody: { reasonCode: "picker-failed" } });
  assert.equal((await f.request()).statusCode, 500);
});
