import { afterEach, expect, it, vi } from "vitest";
import { ApiError, requestOnce } from "../api";

afterEach(() => vi.unstubAllGlobals());

it("names a failed request and gives a safe next action when the application supplied no explanation", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { status: 500 })));
  const error = await requestOnce({ path: "/pages", init: { method: "PUT" } }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ message: "The API could not finish PUT /pages (HTTP 500). Check whether your change was saved before trying again. Copy details and report this problem.", status: 500, body: null });
  expect(error).not.toHaveProperty("failure");
});

it("redacts request metadata before putting it into fallback text or copy details", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
  const error = await requestOnce({ path: "/pages?access_token=CANARY_QUERY" }).catch((error: unknown) => error) as ApiError;
  expect(error.message).not.toContain("CANARY_QUERY");
  expect(error).not.toHaveProperty("failure");
});

it("masks a Tovu key in the fallback path without constructing a failure envelope", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 400 })));
  const error = await requestOnce({ path: "/tovu_ak_012345abcdef.HOST_SECRET_CANARY_abcdefghijklmnop" }).catch(error => error);
  if (!(error instanceof ApiError)) throw new Error("Expected an API error");
  expect(error.message).toContain("[REDACTED:tovu_api_key]");
  expect(error.message).not.toContain("HOST_SECRET_CANARY");
  expect(error).not.toHaveProperty("failure");
});
