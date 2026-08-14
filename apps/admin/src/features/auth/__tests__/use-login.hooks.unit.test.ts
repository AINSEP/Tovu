import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLogin } from "../hooks/use-login.hooks";
import { createFakeLoginPort } from "../hooks/login-dependencies.hooks";
import type { LoginPort } from "../hooks/login-port.hooks";

/**
 * @file `useLogin` — the Login screen's submit lifecycle, extracted verbatim from `Login.tsx`.
 *
 * Converted (this sweep) from a stubbed-`fetch` harness to the injected-`LoginPort` seam — see
 * `login-port.hooks.ts` for why. `request()`'s own extraction of a server error message from a
 * response body, and its "rejection wasn't an `Error`" fallback text, are `lib/api.ts` concerns
 * with their own coverage (`lib/__tests__/api-describe-error.unit.test.ts`,
 * `api-request-unreachable.unit.test.ts`); this file only needs to prove `useLogin` reacts
 * correctly to whatever the port resolves or rejects with, not re-derive how `request()` produces
 * that value.
 */

function fakeSubmitEvent(): React.FormEvent {
  return { preventDefault: vi.fn() } as unknown as React.FormEvent;
}

describe("useLogin — initial state", () => {
  it("defaults username to 'admin' and password to empty, matching the login screen's own dev hint", () => {
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port: createFakeLoginPort() }));
    expect(result.current.username).toBe("admin");
    expect(result.current.password).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it("setUsername/setPassword update their own field independently", () => {
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port: createFakeLoginPort() }));
    act(() => result.current.setUsername("alice"));
    act(() => result.current.setPassword("hunter2"));
    expect(result.current.username).toBe("alice");
    expect(result.current.password).toBe("hunter2");
  });
});

describe("useLogin — submit", () => {
  it("prevents the form's default submission", async () => {
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port: createFakeLoginPort() }));
    const event = fakeSubmitEvent();
    await act(async () => result.current.submit(event));
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("on success, calls onLogin with the returned user and clears busy", async () => {
    const user = { id: "u1", username: "admin" };
    const onLogin = vi.fn();
    const { result } = renderHook(() => useLogin({ onLogin }, { port: createFakeLoginPort({ user }) }));

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(onLogin).toHaveBeenCalledWith(user);
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("is busy for the duration of an in-flight submit", async () => {
    let resolveLogin!: (value: { user: { id: string; username: string } }) => void;
    const port: LoginPort = { login: () => new Promise((resolve) => (resolveLogin = resolve)) };
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port }));

    let submitPromise!: Promise<void>;
    act(() => {
      submitPromise = result.current.submit(fakeSubmitEvent());
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      resolveLogin({ user: { id: "u1", username: "admin" } });
      await submitPromise;
    });
    expect(result.current.busy).toBe(false);
  });

  it("surfaces the port's rejection message verbatim and does not call onLogin", async () => {
    const port = createFakeLoginPort({ loginError: new Error("invalid credentials") });
    const onLogin = vi.fn();
    const { result } = renderHook(() => useLogin({ onLogin }, { port }));

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("invalid credentials");
    expect(result.current.busy).toBe(false);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("falls back to the exact string 'login failed' when the rejection is not an Error", async () => {
    const port: LoginPort = { login: () => Promise.reject("network exploded") };
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port }));

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("login failed");
  });

  it("clears a previous error at the start of a new submit attempt", async () => {
    const login = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockResolvedValueOnce({ user: { id: "u1", username: "admin" } });
    const port: LoginPort = { login };
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port }));

    await act(async () => result.current.submit(fakeSubmitEvent()));
    expect(result.current.error).toBe("first failure");

    await act(async () => result.current.submit(fakeSubmitEvent()));
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
