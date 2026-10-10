import { expect, it } from "vitest";
import { readInitialAdminSession, tryLocalOwnerSession } from "../local-owner-signin";
import { ApiError } from "../api";

/** devsignin: parameter-injected API fakes; no module replacements or secrets in JS. */
it("signs in before reading the site's normal user and permission response", async () => {
  const calls: string[] = [];
  const session = { user: { id: "site-b-owner" }, effectivePermissions: ["content.write"] };
  const result = await tryLocalOwnerSession({ hostname: "localhost", port: {
    async signInLocalOwner(input) { expect(input).toEqual({}); calls.push("bootstrap"); },
    async me() { calls.push("me"); return session; },
  } });
  expect(calls).toEqual(["bootstrap", "me"]);
  expect(result).toBe(session);
});

it.each(["example.com", "localhost.evil.example", "0.0.0.0", "192.168.1.2"])("remote browser %s never calls local bootstrap", async (hostname) => {
  let calls = 0;
  expect(await tryLocalOwnerSession({ hostname, port: {
    async signInLocalOwner() { calls++; }, async me() { calls++; return {}; },
  } })).toBeNull();
  expect(calls).toBe(0);
});

it.each(["localhost", "127.0.0.1", "[::1]"])("local browser %s can use the server-guarded endpoint", async (hostname) => {
  expect(await tryLocalOwnerSession({ hostname, port: {
    async signInLocalOwner() {}, async me() { return { id: "owner" }; },
  } })).toEqual({ id: "owner" });
});

it("disabled/production or failed bootstrap falls through without reading me", async () => {
  let reads = 0;
  expect(await tryLocalOwnerSession({ hostname: "localhost", port: {
    async signInLocalOwner() { throw new Error("local owner sign-in is disabled"); },
    async me() { reads++; return {}; },
  } })).toBeNull();
  expect(reads).toBe(0);
});

it("a failed session read is bounded and never retries bootstrap", async () => {
  let bootstraps = 0;
  expect(await tryLocalOwnerSession({ hostname: "localhost", port: {
    async signInLocalOwner() { bootstraps++; }, async me() { throw new Error("unauthenticated"); },
  } })).toBeNull();
  expect(bootstraps).toBe(1);
});

it("initial read retains an authenticated account and does not bootstrap", async () => {
  let bootstraps = 0;
  expect(await readInitialAdminSession({ hostname: "localhost", port: {
    async signInLocalOwner() { bootstraps++; }, async me() { return { id: "editor" }; },
  } })).toEqual({ id: "editor" });
  expect(bootstraps).toBe(0);
});

it("initial unauthenticated local read uses one bootstrap and then the real session read", async () => {
  const calls: string[] = []; let authenticated = false;
  expect(await readInitialAdminSession({ hostname: "localhost", port: {
    async signInLocalOwner() { calls.push("bootstrap"); authenticated = true; },
    async me() { calls.push("me"); if (!authenticated) throw new ApiError("unauthenticated", 401, "UNAUTHENTICATED"); return { id: "owner" }; },
  } }, { onLocalSignIn: () => calls.push("settings-refresh") })).toEqual({ id: "owner" });
  expect(calls).toEqual(["me", "bootstrap", "me", "settings-refresh"]);
});

it.each([new ApiError("storage unavailable", 500), new ApiError("upstream refusal", 401, "UPSTREAM_REQUEST_FAILED"), new Error("network unavailable")])("initial non-authentication failure propagates without signing in", async (error) => {
  let bootstraps = 0;
  await expect(readInitialAdminSession({ hostname: "localhost", port: {
    async signInLocalOwner() { bootstraps++; }, async me() { throw error; },
  } })).rejects.toBe(error);
  expect(bootstraps).toBe(0);
});

it("initial remote refusal preserves the exact original unauthenticated error", async () => {
  const error = new ApiError("unauthenticated", 401, "UNAUTHENTICATED");
  await expect(readInitialAdminSession({ hostname: "example.com", port: {
    async signInLocalOwner() { throw new Error("must not call"); }, async me() { throw error; },
  } })).rejects.toBe(error);
});
