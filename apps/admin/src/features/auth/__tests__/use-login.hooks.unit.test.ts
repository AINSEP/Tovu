import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLogin } from "../hooks/use-login.hooks";
import { createFakeLoginPort } from "../hooks/login-dependencies.hooks";
import type { LoginPort } from "../hooks/login-port.hooks";
import { ApiError } from "@/lib/api";

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
    const login = vi.fn().mockResolvedValue({ user });
    const { result } = renderHook(() => useLogin({ onLogin }, { port: { login } }));
    act(() => {
      result.current.setUsername("alice.operator");
      result.current.setPassword("distinct-password-123");
    });

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(onLogin).toHaveBeenCalledWith(user);
    expect(login).toHaveBeenCalledExactlyOnceWith({ username: "alice.operator", password: "distinct-password-123" });
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

  it("explains how to retry when the rejection is not an Error", async () => {
    const port: LoginPort = { login: () => Promise.reject("network exploded") };
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port }));

    await act(async () => result.current.submit(fakeSubmitEvent()));

    expect(result.current.error).toBe("Sign-in could not finish. Try signing in again.");
  });

  it("clears a previous error at the start of a new submit attempt", async () => {
    let resolveLogin!: (value: { user: { id: string; username: string } }) => void;
    const login = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLogin = resolve; }));
    const port: LoginPort = { login };
    const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port }));

    await act(async () => result.current.submit(fakeSubmitEvent()));
    expect(result.current.error).toBe("first failure");

    let retryPromise!: Promise<void>;
    act(() => { retryPromise = result.current.submit(fakeSubmitEvent()); });
    expect(result.current.busy).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      resolveLogin({ user: { id: "u1", username: "admin" } });
      await retryPromise;
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.busy).toBe(false);
  });
});

it("copies the server incident ID without copying a password or private backend facts", async () => {
  const port: LoginPort = { login: async () => { throw new ApiError("private identity table; LOGIN_PASSWORD_CANARY", 500, "INTERNAL_ERROR", { errorId: "auth-incident-123" }); } };
  const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port }));
  act(() => result.current.setPassword("LOGIN_PASSWORD_CANARY"));
  await act(async () => result.current.submit(fakeSubmitEvent()));
  expect(result.current.failure?.errorId).toBe("auth-incident-123");
  expect(result.current.failure?.copyText).toContain("auth-incident-123");
  expect(result.current.failure?.copyText).not.toMatch(/LOGIN_PASSWORD_CANARY|private identity/);
  expect(result.current.failure?.action).toMatch(/Try signing in again/);
});

it.each([401, 429])("keeps the existing %s refusal message without replacing it with a server incident", async status => {
  const port: LoginPort = { login: async () => { throw new ApiError("existing safe refusal", status); } };
  const { result } = renderHook(() => useLogin({ onLogin: vi.fn() }, { port }));
  await act(async () => result.current.submit(fakeSubmitEvent()));
  expect(result.current.error).toBe("existing safe refusal");
  expect(result.current.failure).toBeNull();
});
