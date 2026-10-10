// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { expect, it } from "vitest";
import { useAdminSession } from "../../App.hooks";
import { ApiError } from "../../lib/api";

/** devsignin: exercise the real hook with DI fakes, including a same-tab site restart. */
function fixture(hostname = "localhost") {
  const calls: string[] = [];
  let currentId = "site-a-owner";
  let notify: () => void = () => {};
  let allowed = true;
  let authenticated = hostname === "example.com";
  let onMe: (() => void) | undefined;
  const sessionApi = {
    async signInLocalOwner() { calls.push("bootstrap"); if (!allowed) throw new Error("local owner sign-in is disabled"); authenticated = true; return { user: { id: currentId } }; },
    async me() { calls.push("me"); onMe?.(); if (!authenticated) throw new ApiError("unauthenticated", 401, "UNAUTHENTICATED"); return { user: { id: currentId, username: "admin" }, effectivePermissions: [currentId] }; },
    async redeemBootSession() { calls.push("fragment"); return { user: { id: currentId } }; },
    async logout() { calls.push("logout"); authenticated = false; return { ok: true }; },
  };
  const options = { sessionApi, location: { hostname, hash: "", pathname: "/admin/", search: "" },
    subscribeSettingsChanges: () => () => {},
    history: { replaceState() {} }, subscribeUnauthenticated(listener: () => void) { notify = listener; return () => { notify = () => {}; }; } };
  return { calls, options, notify: () => notify(), switchTo: (id: string) => { currentId = id; },
    deny: () => { allowed = false; }, onMe: (run: () => void) => { onMe = run; } };
}

it("mount and a site-switch 401 both recover the local owner with that site's permissions", async () => {
  const f = fixture();
  const { result } = renderHook(() => useAdminSession({}, f.options));
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(f.calls).toEqual(["me", "bootstrap", "me"]);
  expect(result.current.user?.id).toBe("site-a-owner");
  f.switchTo("site-b-owner");
  act(() => { f.notify(); f.notify(); });
  await waitFor(() => expect(result.current.user?.id).toBe("site-b-owner"));
  expect(f.calls).toEqual(["me", "bootstrap", "me", "bootstrap", "me"]);
  expect(result.current.effectivePermissions).toEqual(["site-b-owner"]);
});

it("deployed browser origins keep the ordinary login/logout behavior", async () => {
  const f = fixture("example.com");
  const { result } = renderHook(() => useAdminSession({}, f.options));
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(f.calls).toEqual(["me"]);
  act(() => f.notify());
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(result.current.user).toBeNull();
  expect(f.calls).toEqual(["me"]);
});

it("a refused local recovery settles on login and suppresses recursive me notifications", async () => {
  const f = fixture();
  const { result } = renderHook(() => useAdminSession({}, f.options));
  await waitFor(() => expect(result.current.checking).toBe(false));
  f.deny();
  act(() => f.notify());
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(result.current.user).toBeNull();
  expect(f.calls).toEqual(["me", "bootstrap", "me", "bootstrap"]);
});

it("a me notification during recovery cannot launch recursive bootstraps", async () => {
  const f = fixture();
  const { result } = renderHook(() => useAdminSession({}, f.options));
  await waitFor(() => expect(result.current.checking).toBe(false));
  f.onMe(f.notify);
  act(() => f.notify());
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(f.calls).toEqual(["me", "bootstrap", "me", "bootstrap", "me"]);
});

it("explicit sign-out suppresses late 401 auto sign-in in this tab", async () => {
  const f = fixture();
  const { result } = renderHook(() => useAdminSession({}, f.options));
  await waitFor(() => expect(result.current.checking).toBe(false));
  await act(async () => result.current.logout());
  act(() => f.notify());
  expect(result.current.user).toBeNull();
  expect(f.calls).toEqual(["me", "bootstrap", "me", "logout"]);
});
