import { afterEach, describe, expect, it, vi } from "vitest";

import { API_UNREACHABLE_CODE, ApiError, requestOnce, requestRidingOutRestart } from "../api";
import { createServerReconnect, shouldRetryAfterReconnect, type ServerReconnect } from "../server-reconnect";

/**
 * @file Riding out a server restart (2026-10-05, S3): the `/readyz` poll, which failures are retried,
 * and the retry wrapper `request()` uses. Fakes only — no real server, no module mocks.
 */

function fakeClock() {
  let now = 0;
  return { now: () => now, sleep: async (ms: number) => void (now += ms) };
}

function fakeReconnect(back: boolean): ServerReconnect & { waits: number } {
  const fake = {
    waits: 0,
    getStatus: () => "online" as const,
    subscribe: () => () => {},
    waitUntilReachable: async () => (fake.waits++, back),
  };
  return fake;
}

const unreachable = () => new ApiError("unreachable", 0, API_UNREACHABLE_CODE, {});

afterEach(() => vi.unstubAllGlobals());

describe("createServerReconnect", () => {
  it("polls until /readyz answers, reporting reconnecting then online", async () => {
    const clock = fakeClock();
    const answers = [false, false, true];
    const reconnect = createServerReconnect({ probe: async () => answers.shift()!, ...clock });
    const seen: string[] = [];
    reconnect.subscribe(() => seen.push(reconnect.getStatus()));
    expect(await reconnect.waitUntilReachable()).toBe(true);
    expect(seen).toEqual(["reconnecting", "online"]);
  });

  it("gives up after the timeout and reports unreachable", async () => {
    const clock = fakeClock();
    const reconnect = createServerReconnect({ probe: async () => false, ...clock }, { pollMs: 500, timeoutMs: 2_000 });
    expect(await reconnect.waitUntilReachable()).toBe(false);
    expect(reconnect.getStatus()).toBe("unreachable");
  });

  it("shares one poll between concurrent waiters", async () => {
    let probes = 0;
    const reconnect = createServerReconnect({ probe: async () => (probes++, true), ...fakeClock() });
    await Promise.all([reconnect.waitUntilReachable(), reconnect.waitUntilReachable()]);
    expect(probes).toBe(1);
  });
});

describe("shouldRetryAfterReconnect", () => {
  const base = { code: API_UNREACHABLE_CODE, unreachableCode: API_UNREACHABLE_CODE, upstreamRefused: false, retryWrites: false };
  it("retries reads, never other error codes", () => {
    expect(shouldRetryAfterReconnect({ ...base, method: undefined })).toBe(true);
    expect(shouldRetryAfterReconnect({ ...base, method: "HEAD" })).toBe(true);
    expect(shouldRetryAfterReconnect({ ...base, code: "VALIDATION_ERROR", method: "GET" })).toBe(false);
  });
  it("retries a write only when it never reached the server or the caller allows it", () => {
    expect(shouldRetryAfterReconnect({ ...base, method: "POST" })).toBe(false);
    expect(shouldRetryAfterReconnect({ ...base, method: "POST", upstreamRefused: true })).toBe(true);
    expect(shouldRetryAfterReconnect({ ...base, method: "post", retryWrites: true })).toBe(true);
  });
});

describe("requestRidingOutRestart", () => {
  it("waits for the server and sends a read once more", async () => {
    const reconnect = fakeReconnect(true);
    let sends = 0;
    const result = await requestRidingOutRestart(
      { send: async () => (++sends === 1 ? Promise.reject(unreachable()) : "ok"), method: "GET" },
      { reconnect },
    );
    expect([result, sends, reconnect.waits]).toEqual(["ok", 2, 1]);
  });

  it("does not repeat a write that may have run", async () => {
    const reconnect = fakeReconnect(true);
    await expect(requestRidingOutRestart({ send: async () => Promise.reject(unreachable()), method: "POST" }, { reconnect })).rejects.toThrow("unreachable");
    expect(reconnect.waits).toBe(0);
  });

  it("repeats a login (retryWrites) once the server is back", async () => {
    const reconnect = fakeReconnect(true);
    let sends = 0;
    const result = await requestRidingOutRestart(
      { send: async () => (++sends === 1 ? Promise.reject(unreachable()) : "signed in"), method: "POST" },
      { retryWrites: true, reconnect },
    );
    expect(result).toBe("signed in");
  });

  it("rethrows the original error when the server never comes back", async () => {
    const error = unreachable();
    await expect(requestRidingOutRestart({ send: async () => Promise.reject(error), method: "GET" }, { reconnect: fakeReconnect(false) })).rejects.toBe(error);
  });

  it("repeats a write the dev proxy marked upstream-refused", async () => {
    const responses = [
      new Response("The Tovu server is restarting.", { status: 503, headers: { "x-tovu-upstream-status": "upstream-refused" } }),
      new Response(JSON.stringify({ id: "p1" }), { status: 201, headers: { "content-type": "application/json" } }),
    ];
    vi.stubGlobal("fetch", vi.fn(async () => responses.shift()!));
    const reconnect = fakeReconnect(true);
    const result = await requestRidingOutRestart({ send: () => requestOnce<{ id: string }>({ path: "/posts", init: { method: "POST", body: "{}" } }), method: "POST" }, { reconnect });
    expect(result).toEqual({ id: "p1" });
    expect(reconnect.waits).toBe(1);
  });
});
