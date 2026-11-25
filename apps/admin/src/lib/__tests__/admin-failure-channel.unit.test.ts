import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { formatUserFacingError } from "@jini-ai/core";
import { sitesApi } from "../../features/sites/api/sites-api";
import { postsApi } from "../../features/posts/posts-host-ports";
import { authApi } from "../../features/auth/api/auth-api";
import { pagesApi } from "../../features/pages/api/pages-api";
import { ApiError, authenticatedAdminRequest, API_UNREACHABLE_CODE } from "../admin-http/request";
import { adminFailureChannel, publishAdminFailure } from "../admin-failure-channel";
import { setAdminDraftIdentity } from "@jini-ai/admin/shell/lib/admin-draft-identity";
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
  // Copy details names the app and Jini versions even when the server sent no approved failure.
  expect(adminFailureChannel.getSnapshot()?.appVersion).toMatch(/^Tovu Admin \S+/);
  expect(adminFailureChannel.getSnapshot()?.jiniVersion).toMatch(/\d+\.\d+\.\d+/);
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
  await authApi.login({ username: "a", password: "b" }).catch(() => undefined);
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
  await authApi.me().catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()).toBeNull();
  adminFailureChannel.publish({ failure });
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"restart":{"accepted":true}}')));
  await sitesApi.manageLocalSite({ name: "other-site", action: "switch" });
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

it.each([
  { status: 0, cause: "No server response was received, so no server incident ID is available." },
  { status: 500, cause: "The server did not provide an incident ID for this response." },
])("does not claim a server incident reference exists when status $status has no ID", async ({ status, cause }) => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    if (status === 0) throw new TypeError("Failed to fetch");
    return new Response('{"error":"Private backend HOST_SECRET_CANARY"}', { status });
  }));
  await authenticatedAdminRequest({ path: "/pages", method: "GET" }).catch(() => undefined);
  const failure = adminFailureChannel.getSnapshot();
  expect(failure?.errorId).toBeUndefined();
  expect(failure?.cause).toBe(cause);
  expect(failure?.copyText).not.toContain("The error ID identifies the server report.");
  expect(failure?.copyText).not.toContain("HOST_SECRET_CANARY");
});

it("describes an implicit GET failure as a read without exposing legacy error text", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    error: "PRIVATE_BACKEND SECRET_CANARY", code: "INTERNAL_ERROR", errorId: "incident-default-get",
  }), { status: 500 })));
  const error = await pagesApi.listPages().catch(error => error) as ApiError;
  expect(error).toBeInstanceOf(ApiError);
  expect(adminFailureChannel.getSnapshot()).toMatchObject({
    message: "The pages could not be loaded.",
    action: "Try loading them again. If it still fails, copy details and report this problem.",
    step: "Load pages (HTTP 500)",
    errorId: "incident-default-get",
  });
  expect(adminFailureChannel.getSnapshot()?.copyText).not.toMatch(/PRIVATE_BACKEND|SECRET_CANARY/);
});

it("a page saved through the shared posts route is called a page in the notice, with or without approved server wording", async () => {
  const failure = formatUserFacingError({ message: "The post save could not be completed.", action: "Check whether your changes were saved before repeating the save.", step: "Save post", cause: "The error ID identifies the server report." }, { errorId: "incident-9" });
  const body = { error: { code: "INTERNAL_ERROR", message: "boom", requestId: "request-9", details: { errorId: "incident-9", failure } } };
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 500 })));
  await postsApi.updatePost({ id: "p1" }, { options: { title: "x" }, entry: "page" }).catch(() => undefined);
  const approved = adminFailureChannel.getSnapshot();
  expect(approved?.message).toBe("The page save could not be completed.");
  expect(approved?.copyText).toMatch(/Save page/);
  expect(approved?.copyText).not.toMatch(/\bpost\b/i);
  adminFailureChannel.reset();
  setAdminDraftIdentity({ id: null });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 500 })));
  await postsApi.updatePost({ id: "p1" }, { options: { title: "x" }, entry: "page" }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()?.message).toMatch(/page save/);
  adminFailureChannel.reset();
  await postsApi.updatePost({ id: "p1" }, { options: { title: "x" } }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()?.message).toMatch(/post save/);
});

// E4-T-READERS: the reader side of the failure reference, run through Tovu's real binding
// (`publishAdminFailure` from `../admin-failure-channel`) with no stubbed decoder or reporter.
const LEGACY_UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ERR_ID = "ERR-1A2B-3C4D-5E6F-7A8B";

/** Publishes one failed reply for a signed-in request and returns what the notice retained. */
function noticeFor({ body, path = "/pages", method = "PUT", status = 500 }: { body: unknown; path?: string; method?: string; status?: number }) {
  adminFailureChannel.reset();
  publishAdminFailure({ body, path, method, status, generation: adminFailureChannel.getGeneration() });
  return adminFailureChannel.getSnapshot();
}

const approvedFailure = (errorId: string) => formatUserFacingError(
  { message: "The export could not finish.", action: "Check export history.", step: "Creating archive", cause: "An approved export explanation." },
  { errorId },
);

it("a flat reply with approved details shows the approved wording and the approved incident id", () => {
  const failure = approvedFailure("incident-flat-approved");
  const notice = noticeFor({ body: { error: "Private backend HOST_SECRET_CANARY", code: "INTERNAL_ERROR", details: { errorId: "incident-flat-approved", failure } } });
  expect(notice).toMatchObject({ message: failure.message, action: failure.action, step: failure.step, cause: failure.cause, errorId: "incident-flat-approved" });
  expect(notice?.copyText).not.toContain("HOST_SECRET_CANARY");
});

it("a flat reply without details shows the shared wording and the flat incident id", () => {
  const notice = noticeFor({ body: { error: "Private backend HOST_SECRET_CANARY", errorId: "incident-flat-bare" } });
  expect(notice?.errorId).toBe("incident-flat-bare");
  expect(notice?.cause).toBe("The error ID identifies the server report.");
  expect(notice?.copyText).not.toContain("HOST_SECRET_CANARY");
});

it("a nested reply that carries only a request id shows that request id as the incident reference", () => {
  const notice = noticeFor({ body: { error: { code: "INTERNAL_ERROR", message: "boom", requestId: "request-nested" } } });
  expect(notice?.errorId).toBe("request-nested");
  expect(notice?.cause).toBe("The error ID identifies the server report.");
});

it("a legacy UUID request id is kept whole as the incident reference", () => {
  const notice = noticeFor({ body: { error: { code: "INTERNAL_ERROR", message: "boom", requestId: LEGACY_UUID } } });
  expect(notice?.errorId).toBe(LEGACY_UUID);
  expect(notice?.copyText).toContain(`Error ID: ${LEGACY_UUID}`);
});

it("an ERR- id in a flat reply is kept whole as the incident reference", () => {
  const notice = noticeFor({ body: { error: "boom", code: "INTERNAL_ERROR", errorId: ERR_ID } });
  expect(notice?.errorId).toBe(ERR_ID);
  expect(notice?.copyText).toContain(`Error ID: ${ERR_ID}`);
});

it("an ERR- id in nested details is kept whole as the incident reference", () => {
  const notice = noticeFor({ body: { error: { code: "INTERNAL_ERROR", message: "boom", requestId: "request-ignored", details: { errorId: ERR_ID } } } });
  expect(notice?.errorId).toBe(ERR_ID);
});

it("a reply with no id at all claims no incident reference exists", () => {
  for (const body of [{ error: "boom", code: "INTERNAL_ERROR" }, { error: { code: "INTERNAL_ERROR", message: "boom" } }, { error: { requestId: 42, details: { errorId: 7 } }, errorId: false }, "not json", null]) {
    const notice = noticeFor({ body });
    expect(notice?.errorId).toBeUndefined();
    expect(notice?.cause).toBe("The server did not provide an incident ID for this response.");
    expect(notice?.copyText).not.toContain("Error ID:");
  }
});

it("the incident reference is the details id first, then the flat id, then the request id", () => {
  const nested = (details?: unknown) => ({ errorId: "id-flat", error: { code: "INTERNAL_ERROR", message: "boom", requestId: "id-request", ...(details ? { details } : {}) } });
  expect(noticeFor({ body: nested({ errorId: "id-details" }) })?.errorId).toBe("id-details");
  expect(noticeFor({ body: nested() })?.errorId).toBe("id-flat");
  expect(noticeFor({ body: { error: nested().error } })?.errorId).toBe("id-request");
  // A details object that has no errorId key does not shadow the later sources.
  expect(noticeFor({ body: nested({ other: true }) })?.errorId).toBe("id-flat");
});

// KNOWN DISCREPANCY (reported, production untouched): `failureReference` uses `??`, so a NON-STRING
// `details.errorId` (here 123) is not nullish, wins the chain, then `optionalString` drops it and the
// flat id / request id are lost. The sheet's precedence implies a lower source should still be used.
// `it.fails` keeps the contract assertion live: it passes today and turns red once the reader is fixed.
it.fails("a non-string details id falls through to the flat id instead of hiding it", () => {
  const body = { errorId: "id-flat", error: { code: "INTERNAL_ERROR", message: "boom", requestId: "id-request", details: { errorId: 123 } } };
  expect(noticeFor({ body })?.errorId).toBe("id-flat");
});

it("signed-out requests and auth routes keep the incident id but do not adopt approved details wording", () => {
  const failure = approvedFailure("incident-approved");
  const body = { error: "boom", code: "INTERNAL_ERROR", details: { errorId: "incident-approved", failure } };
  // Control: a signed-in, non-auth request adopts the approved wording.
  expect(noticeFor({ body })?.message).toBe(failure.message);

  setAdminDraftIdentity({ id: null });
  const signedOut = noticeFor({ body });
  expect(signedOut?.message).not.toBe(failure.message);
  expect(signedOut?.cause).not.toContain("An approved export explanation.");
  expect(signedOut?.errorId).toBe("incident-approved");

  setAdminDraftIdentity({ id: "owner" });
  const auth = noticeFor({ body, path: "/auth/login", method: "POST" });
  expect(auth?.message).not.toBe(failure.message);
  expect(auth?.cause).not.toContain("An approved export explanation.");
  expect(auth?.errorId).toBe("incident-approved");
});
