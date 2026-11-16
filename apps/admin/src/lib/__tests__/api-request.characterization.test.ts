import { afterEach, describe, expect, test, vi } from "vitest";

import { adminFailureChannel, publishAdminFailure } from "../admin-failure-channel";
import { api } from "../api";
import { API_UNREACHABLE_CODE, ApiError, KEEPALIVE_MAX_BODY_BYTES, REQUEST_TIMEOUT_CODE, authenticatedAdminRequest, bodyFitsKeepalive, onUnauthenticated, requestOnce, requestRidingOutRestart } from "../admin-http/request";
import type { ServerReconnect } from "../server-reconnect";

/**
 * @file Transport characterization for size 06 step 1 (the move of the fetch seam out of
 * `lib/api.ts`). One case per branch of the seam, driven through the exported entry points against
 * a fake `fetch`, plus the failure-notice rules of `request`: a final 5xx or no-response failure is
 * published once, a 4xx is not, and a notice that throws never replaces the caller's rejection.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  adminFailureChannel.reset();
});

type FetchCall = { url: string; init: RequestInit };

function stubFetch(respond: () => Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal("fetch", (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return respond();
  });
  return calls;
}

function json({ status, body }: { status: number; body: unknown }): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fake of the `ServerReconnect` interface: the server comes back, or does not, when asked. */
function fakeReconnect({ comesBack }: { comesBack: boolean }): ServerReconnect & { waits: number; reached: number } {
  const fake = {
    waits: 0,
    reached: 0,
    getStatus: () => "online" as const,
    subscribe: () => () => undefined,
    waitUntilReachable: async () => { fake.waits += 1; return comesBack; },
    markReachable: () => { fake.reached += 1; },
  };
  return fake;
}

async function rejection({ run }: { run: () => Promise<unknown> }): Promise<unknown> {
  return run().then(() => { throw new Error("expected a rejection"); }, (error: unknown) => error);
}

describe("one send through the fetch seam", () => {
  test("a 200 with JSON resolves the parsed body and sends same-origin JSON to the admin base path", async () => {
    const calls = stubFetch(async () => json({ status: 200, body: { user: { id: "u1", username: "ada" } } }));

    await expect(requestOnce({ path: "/auth/me" })).resolves.toEqual({ user: { id: "u1", username: "ada" } });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/admin/v1/auth/me");
    expect(calls[0].init.credentials).toBe("same-origin");
    expect(calls[0].init.headers).toEqual({ "Content-Type": "application/json" });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  test("a 204 with no body resolves an empty object", async () => {
    stubFetch(async () => new Response(null, { status: 204 }));

    await expect(requestOnce({ path: "/auth/logout", init: { method: "POST" } })).resolves.toEqual({});
  });

  test("an unparseable 200 body resolves an empty object, unless the caller requires JSON", async () => {
    stubFetch(async () => new Response("<html>not json</html>", { status: 200 }));

    await expect(requestOnce({ path: "/auth/me" })).resolves.toEqual({});
    const error = await rejection({ run: () => requestOnce({ path: "/auth/me" }, { requireJson: true }) });
    expect(error).toBeInstanceOf(SyntaxError);
  });

  test("a 401 UNAUTHENTICATED tells each listener once; a 401 without that code tells nobody", async () => {
    const listener = vi.fn();
    const unsubscribe = onUnauthenticated(listener);
    stubFetch(async () => json({ status: 401, body: { error: "Sign in again", code: "UNAUTHENTICATED" } }));

    const error = await rejection({ run: () => requestOnce({ path: "/auth/me" }) });

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "UNAUTHENTICATED", message: "Sign in again" });
    expect(listener).toHaveBeenCalledTimes(1);

    stubFetch(async () => json({ status: 401, body: { error: "Vendor key refused" } }));
    await rejection({ run: () => requestOnce({ path: "/media/providers" }) });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    stubFetch(async () => json({ status: 401, body: { error: "Sign in again", code: "UNAUTHENTICATED" } }));
    await rejection({ run: () => requestOnce({ path: "/auth/me" }) });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a fetch that times out rejects with the timeout code and status 0", async () => {
    stubFetch(async () => { throw new DOMException("The operation timed out.", "TimeoutError"); });

    const error = await rejection({ run: () => requestOnce({ path: "/auth/me" }) });

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: REQUEST_TIMEOUT_CODE, body: { cause: "TimeoutError: The operation timed out." } });
  });

  test("a fetch that cannot connect rejects with the unreachable code and status 0", async () => {
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });

    const error = await rejection({ run: () => requestOnce({ path: "/auth/me" }) });

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 0, code: API_UNREACHABLE_CODE, message: "cannot reach the Tovu API — is the server running?", body: { cause: "Failed to fetch" },
    });
  });

  test("a caller's abort is passed through untouched", async () => {
    const abort = new DOMException("aborted by the caller", "AbortError");
    stubFetch(async () => { throw abort; });

    await expect(rejection({ run: () => requestOnce({ path: "/auth/me" }) })).resolves.toBe(abort);
  });
});

describe("riding out a restart", () => {
  const unreachable = () => new ApiError({ message: "down", status: 0 }, { code: API_UNREACHABLE_CODE });

  test("a write marked retryWrites is sent again once the server is back", async () => {
    const reconnect = fakeReconnect({ comesBack: true });
    const send = vi.fn<() => Promise<string>>().mockRejectedValueOnce(unreachable()).mockResolvedValueOnce("saved");

    await expect(requestRidingOutRestart({ send, method: "POST" }, { retryWrites: true, reconnect })).resolves.toBe("saved");

    expect(send).toHaveBeenCalledTimes(2);
    expect(reconnect.waits).toBe(1);
  });

  test("a write without retryWrites is not sent again and keeps its original error", async () => {
    const reconnect = fakeReconnect({ comesBack: true });
    const failure = unreachable();
    const send = vi.fn<() => Promise<string>>().mockRejectedValue(failure);

    await expect(rejection({ run: () => requestRidingOutRestart({ send, method: "POST" }, { reconnect }) })).resolves.toBe(failure);

    expect(send).toHaveBeenCalledTimes(1);
    expect(reconnect.waits).toBe(0);
  });

  test("a read is sent again; when the server stays down the original error is kept", async () => {
    const back = fakeReconnect({ comesBack: true });
    const read = vi.fn<() => Promise<string>>().mockRejectedValueOnce(unreachable()).mockResolvedValueOnce("rows");
    await expect(requestRidingOutRestart({ send: read, method: undefined }, { reconnect: back })).resolves.toBe("rows");
    expect(read).toHaveBeenCalledTimes(2);

    const down = fakeReconnect({ comesBack: false });
    const failure = unreachable();
    const stuck = vi.fn<() => Promise<string>>().mockRejectedValue(failure);
    await expect(rejection({ run: () => requestRidingOutRestart({ send: stuck, method: "GET" }, { reconnect: down }) })).resolves.toBe(failure);
    expect(stuck).toHaveBeenCalledTimes(1);
  });

  test("a send that works marks the server reachable", async () => {
    const reconnect = fakeReconnect({ comesBack: true });

    await requestRidingOutRestart({ send: async () => "ok", method: "GET" }, { reconnect });

    expect(reconnect.reached).toBe(1);
  });
});

describe("keepalive body limit", () => {
  test("the limit is 64 KiB measured in encoded bytes, not characters", () => {
    expect(KEEPALIVE_MAX_BODY_BYTES).toBe(65_536);
    expect(bodyFitsKeepalive({ body: "a".repeat(KEEPALIVE_MAX_BODY_BYTES) })).toBe(true);
    expect(bodyFitsKeepalive({ body: "a".repeat(KEEPALIVE_MAX_BODY_BYTES + 1) })).toBe(false);
    expect(bodyFitsKeepalive({ body: "😀".repeat(KEEPALIVE_MAX_BODY_BYTES / 4 + 1) })).toBe(false);
  });
});

describe("the failure notice of a finished request", () => {
  /** What `publishAdminFailure` puts on the channel for these exact inputs, at the frozen clock. */
  function expectedNotice(input: { body: unknown; path: string; method: string; status: number; generation: number }): unknown {
    const publish = vi.spyOn(adminFailureChannel, "publish").mockImplementation(() => undefined);
    publishAdminFailure(input);
    const [notice] = publish.mock.calls[0];
    publish.mockRestore();
    return notice;
  }

  function freezeClock(): void {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T10:00:00.000Z"));
  }

  test("a 500 is published once, for the request's own body, path, method and session generation", async () => {
    freezeClock();
    const body = { error: "Could not save", code: "INTERNAL_ERROR", details: { errorId: "err_123" } };
    stubFetch(async () => json({ status: 500, body }));
    const generation = adminFailureChannel.getGeneration();
    const expected = expectedNotice({ body, path: "/workspaces/workspace-local/menus", method: "POST", status: 500, generation });
    const publish = vi.spyOn(adminFailureChannel, "publish");

    const error = await rejection({ run: () => authenticatedAdminRequest({ path: "/workspaces/workspace-local/menus", method: "POST", body: { title: "Main" } }) });

    expect(error).toMatchObject({ status: 500, code: "INTERNAL_ERROR", body });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toEqual(expected);
    expect(publish.mock.calls[0][0]).toMatchObject({ generation });
  });

  test("a request that got no response is published once with status 0", async () => {
    freezeClock();
    stubFetch(async () => { throw new TypeError("Failed to fetch"); });
    const generation = adminFailureChannel.getGeneration();
    const expected = expectedNotice({ body: { cause: "Failed to fetch" }, path: "/auth/logout", method: "POST", status: 0, generation });
    const publish = vi.spyOn(adminFailureChannel, "publish");

    const error = await rejection({ run: () => api.logout() });

    expect(error).toMatchObject({ status: 0, code: API_UNREACHABLE_CODE });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toEqual(expected);
  });

  test("a read with no method is published as a GET", async () => {
    freezeClock();
    const body = { error: "Broken" };
    stubFetch(async () => json({ status: 503, body }));
    const generation = adminFailureChannel.getGeneration();
    const expected = expectedNotice({ body, path: "/auth/me", method: "GET", status: 503, generation });
    const publish = vi.spyOn(adminFailureChannel, "publish");

    await rejection({ run: () => api.me() });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toEqual(expected);
  });

  test.each([400, 401, 403, 404, 409, 422])("a %i is not published", async (status) => {
    stubFetch(async () => json({ status, body: { error: "Refused", code: "REFUSED" } }));
    const publish = vi.spyOn(adminFailureChannel, "publish");

    const error = await rejection({ run: () => api.logout() });

    expect(error).toMatchObject({ status, message: "Refused" });
    expect(publish).not.toHaveBeenCalled();
  });

  test("a notice that throws does not replace the request's own rejection", async () => {
    const body = { error: "Could not save", code: "INTERNAL_ERROR" };
    stubFetch(async () => json({ status: 500, body }));
    const publish = vi.spyOn(adminFailureChannel, "publish").mockImplementation(() => { throw new Error("the notice broke"); });

    const error = await rejection({ run: () => api.logout() });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 500, code: "INTERNAL_ERROR", message: "Could not save", body });
  });

  test("a request sent once directly, without the retry wrapper, publishes nothing", async () => {
    stubFetch(async () => json({ status: 500, body: { error: "Broken" } }));
    const publish = vi.spyOn(adminFailureChannel, "publish");

    await rejection({ run: () => requestOnce({ path: "/auth/me" }) });

    expect(publish).not.toHaveBeenCalled();
  });
});
