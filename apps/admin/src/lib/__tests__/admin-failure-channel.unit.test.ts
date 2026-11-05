import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { formatUserFacingError } from "@jini-ai/core";
import { api, ApiError, authenticatedAdminRequest, API_UNREACHABLE_CODE } from "../api";
import { adminFailureChannel } from "../admin-failure-channel";
import { setAdminDraftIdentity } from "../admin-draft-identity";
import { serverReconnect } from "../server-reconnect";

beforeEach(() => { adminFailureChannel.reset(); setAdminDraftIdentity({ id: "owner" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); adminFailureChannel.reset(); setAdminDraftIdentity({ id: null }); });

it("publishes one final safe legacy failure while preserving the original rejection body", async () => {
  const body = { error: "Private backend HOST_SECRET_CANARY", code: "INTERNAL_ERROR", errorId: "incident-1" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 500 })));
  const publish = vi.spyOn(adminFailureChannel, "publish");
  const error = await authenticatedAdminRequest({ path: "/pages/PRIVATE_ID?token=HOST_SECRET_CANARY", method: "PUT" }).catch(error => error) as ApiError;
  expect(error).toBeInstanceOf(ApiError);
  expect(error.body).toEqual(body);
  expect(error.message).toBe(body.error);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(adminFailureChannel.getSnapshot()).toMatchObject({ errorId: "incident-1", cause: "The error ID identifies the server report." });
  expect(adminFailureChannel.getSnapshot()?.message).toMatch(/page/i);
  expect(adminFailureChannel.getSnapshot()?.copyText).not.toMatch(/PRIVATE_ID|HOST_SECRET_CANARY|Private backend/);
});

it("reads canonical safe details after sign-in and retains the canonical response", async () => {
  const failure = formatUserFacingError({ message: "The export could not finish.", action: "Check export history.", step: "Creating archive", cause: "An approved export explanation." }, { errorId: "incident-2" });
  const body = { error: { code: "INTERNAL_ERROR", message: "Export failed", requestId: "request-2", details: { errorId: "incident-2", failure } } };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 500 })));
  const error = await authenticatedAdminRequest({ path: "/system/exports", method: "POST" }).catch(error => error) as ApiError;
  expect(error.body).toEqual(body);
  expect(adminFailureChannel.getSnapshot()).toMatchObject({ message: failure.message, action: failure.action, cause: failure.cause, errorId: "incident-2" });
});

it("anonymous failures disclose only synthesized safe wording and the incident reference", async () => {
  setAdminDraftIdentity({ id: null });
  const failure = formatUserFacingError({ message: "HOST_SECRET_CANARY", action: "HOST_SECRET_CANARY", step: "HOST_SECRET_CANARY", cause: "HOST_SECRET_CANARY" }, { errorId: "incident-3" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "HOST_SECRET_CANARY", errorId: "incident-3", details: { failure } }), { status: 500 })));
  await api.login({ username: "a", password: "b" }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()?.errorId).toBe("incident-3");
  expect(adminFailureChannel.getSnapshot()?.copyText).not.toContain("HOST_SECRET_CANARY");
});

it("keeps expected 4xx and caller cancellation on their existing screens", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"code":"VALIDATION_FAILED","error":"Check name"}', { status: 400 })));
  await authenticatedAdminRequest({ path: "/pages", method: "POST" }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()).toBeNull();
  const aborted = new DOMException("Cancelled", "AbortError");
  vi.stubGlobal("fetch", vi.fn(async () => { throw aborted; }));
  const error = await authenticatedAdminRequest({ path: "/pages", method: "GET" }).catch(error => error) as ApiError;
  expect(error).toBe(aborted);
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});

it("waits for the existing restart retry and publishes nothing when it succeeds", async () => {
  vi.spyOn(serverReconnect, "waitUntilReachable").mockResolvedValue(true);
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(new Response('{"ok":true}'));
  vi.stubGlobal("fetch", fetch);
  await expect(authenticatedAdminRequest({ path: "/pages", method: "GET" })).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});

it("publishes only the final failed retry", async () => {
  vi.spyOn(serverReconnect, "waitUntilReachable").mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const publish = vi.spyOn(adminFailureChannel, "publish");
  const error = await authenticatedAdminRequest({ path: "/pages", method: "GET" }).catch(error => error) as ApiError;
  expect(error.code).toBe(API_UNREACHABLE_CODE);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(adminFailureChannel.getSnapshot()?.message).toMatch(/pages/i);
});

it("does not restore an old session failure after the retained details have been reset", async () => {
  let answer!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { answer = resolve; })));
  const request = authenticatedAdminRequest({ path: "/pages", method: "GET" }).catch(error => error);
  adminFailureChannel.reset();
  answer(new Response('{"error":"old failure"}', { status: 500 }));
  expect(await request).toBeInstanceOf(ApiError);
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});

it("clears retained details on genuine session invalidation and accepted site switching", async () => {
  const failure = formatUserFacingError({ message: "Pages could not be loaded.", action: "Try again.", step: "Loading pages", cause: "Safe report" });
  adminFailureChannel.publish({ failure });
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"Sign in","code":"UNAUTHENTICATED"}', { status: 401 })));
  await api.me().catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()).toBeNull();
  adminFailureChannel.publish({ failure });
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"restart":{"accepted":true}}')));
  await api.manageLocalSite({ name: "other-site", action: "switch" });
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});

it("uses safe fallback wording for malformed canonical details and retains a request reference", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "HOST_SECRET_CANARY", requestId: "request-4", details: { failure: { message: "HOST_SECRET_CANARY" } } } }), { status: 503 })));
  await authenticatedAdminRequest({ path: "/pages", method: "GET" }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()).toMatchObject({ errorId: "request-4", cause: "The error ID identifies the server report." });
  expect(adminFailureChannel.getSnapshot()?.copyText).not.toContain("HOST_SECRET_CANARY");
});

it("preserves the original rejection when a notice subscriber throws", async () => {
  const body = { error: "The save failed", code: "INTERNAL_ERROR", errorId: "incident-effect" };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 500 })));
  const unsubscribe = adminFailureChannel.subscribe(() => { throw new RangeError("Notice effect failed"); });
  let error: unknown;
  try {
    error = await authenticatedAdminRequest({ path: "/pages", method: "PUT" }).catch(error => error);
  } finally { unsubscribe(); }
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).body).toEqual(body);
  expect((error as ApiError).message).toBe(body.error);
});
