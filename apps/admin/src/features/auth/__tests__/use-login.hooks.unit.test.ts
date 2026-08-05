import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLogin } from "../hooks/use-login.hooks";

/**
 * @file `useLogin` — the Login screen's submit lifecycle, extracted verbatim from `Login.tsx`.
 * `api.login` goes through `lib/api.ts`'s `request()`, which calls the global `fetch` — stubbed
 * here rather than the `api` module, matching `Comments.unit.test.tsx`/`Media.unit.test.tsx`.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeSubmitEvent(): React.FormEvent {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLogin — initial state", () => {
  it("defaults username to 'admin' and password to empty, matching the login screen's own dev hint", () => {
    const { result } = renderHook(() => useLogin(vi.fn()));
    expect(result.current.username).toBe("admin");
    expect(result.current.password).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("setUsername/setPassword update their own field independently", () => {
    const { result } = renderHook(() => useLogin(vi.fn()));
    act(() => result.current.setUsername("alice"));
    act(() => result.current.setPassword("hunter2"));
    expect(result.current.username).toBe("alice");
    expect(result.current.password).toBe("hunter2");
  });
});

describe("useLogin — submit", () => {
  it("prevents the form's default submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ user: { id: "u1", username: "admin" } })));
    const { result } = renderHook(() => useLogin(vi.fn()));
    const event = fakeSubmitEvent();
    await act(async () => result.current.submit(event));
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("on success, calls onLogin with the returned user and clears busy", async () => {
    const user = { id: "u1", username: "admin" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ user })));
    const onLogin = vi.fn();
    const { result } = renderHook(() => useLogin(onLogin));

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(onLogin).toHaveBeenCalledWith(user);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("is busy for the duration of an in-flight submit", async () => {
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve))),
    );
    const { result } = renderHook(() => useLogin(vi.fn()));

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit(fakeSubmitEvent());
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolveFetch(jsonResponse({ user: { id: "u1", username: "admin" } }));
      await submitPromise;
    });
    expect(result.current.busy).toBe(false);
  });

  it("surfaces the server's own error message verbatim and does not call onLogin", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "invalid credentials" }, 401)));
    const onLogin = vi.fn();
    const { result } = renderHook(() => useLogin(onLogin));

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("invalid credentials");
    expect(result.current.busy).toBe(false);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("falls back to the exact string 'login failed' when the rejection is not an Error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject("network exploded")));
    const { result } = renderHook(() => useLogin(vi.fn()));

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("login failed");
  });

  it("clears a previous error at the start of a new submit attempt", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLogin(vi.fn()));

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "first failure" }, 401));
    await act(async () => result.current.submit(fakeSubmitEvent()));
    expect(result.current.error).toBe("first failure");

    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: "u1", username: "admin" } }));
    await act(async () => result.current.submit(fakeSubmitEvent()));
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
