import { afterEach, expect, it, vi } from "vitest";
import { API_UNREACHABLE_CODE, ApiError, requestRidingOutRestart } from "../admin-http/request";
import { browserServerReconnectDeps, serverReconnectForMode } from "../server-reconnect";

afterEach(() => vi.unstubAllGlobals());

it("binds /readyz and never repeats an ambiguous write", async () => {
  const fetch = vi.fn(async () => new Response('{"ready":false}', { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  expect(await browserServerReconnectDeps().probe()).toBe(true);
  expect(fetch).toHaveBeenCalledWith("/readyz", expect.objectContaining({ credentials: "same-origin", cache: "no-store", signal: expect.any(AbortSignal) }));
  const send = vi.fn(async () => { throw new ApiError({ message: "unreachable", status: 0 }, { code: API_UNREACHABLE_CODE, body: {} }); });
  await expect(requestRidingOutRestart({ send, method: "POST" }, { reconnect: serverReconnectForMode({ mode: "development" }) })).rejects.toThrow("unreachable");
  expect(send).toHaveBeenCalledTimes(1);
});
