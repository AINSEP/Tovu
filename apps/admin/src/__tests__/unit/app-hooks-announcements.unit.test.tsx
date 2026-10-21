// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { StrictMode, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { encodePublishCriteriaToQuery } from "@tovu/publish-content-ui";

import { useAdminAssistantAvailability, useAdminSession, usePublishCriteriaDeepLink, useScreenshotAnnouncement } from "../../App.hooks";
import { closePublishRequest, usePublishRequest } from "../../features/publish-content/hooks/publish-request.store";
import { publishScreenshotCaptured, resetScreenshotCapturedBus } from "../../lib/agent-screenshot-bus";

/**
 * @file `App.hooks.ts`'s small single-purpose hooks, each against its own public contract: the
 * screenshot announcement flag, the once-per-mount `?publish=` deep link (Strict Mode included),
 * the assistant-availability read's fail-open default, and `logout` surviving a failed request.
 */

afterEach(() => {
  act(() => closePublishRequest());
  resetScreenshotCapturedBus();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

it("useScreenshotAnnouncement raises on a capture and clears on dismiss", () => {
  const { result } = renderHook(() => useScreenshotAnnouncement());
  expect(result.current.announced).toBe(false);
  act(() => publishScreenshotCaptured());
  expect(result.current.announced).toBe(true);
  act(() => result.current.dismiss());
  expect(result.current.announced).toBe(false);
});

it("useScreenshotAnnouncement stops listening once unmounted", () => {
  const { result, unmount } = renderHook(() => useScreenshotAnnouncement());
  unmount();
  expect(() => act(() => publishScreenshotCaptured())).not.toThrow();
  expect(result.current.announced).toBe(false);
});

it("usePublishCriteriaDeepLink opens exactly one publish request, even under Strict Mode's double effects", () => {
  window.history.replaceState(null, "", `/admin/?publish=${encodePublishCriteriaToQuery({ types: ["page", "menu"] })}`);
  const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
  const { result } = renderHook(() => {
    usePublishCriteriaDeepLink();
    return usePublishRequest();
  }, { wrapper });
  expect(result.current?.criteria).toEqual({ types: ["page", "menu"] });
  const first = result.current?.requestId;
  // A second request would have superseded the first under a new id.
  expect(result.current?.requestId).toBe(first);
  expect(window.location.search).toBe("");
});

it("usePublishCriteriaDeepLink opens nothing without a ?publish= param", () => {
  window.history.replaceState(null, "", "/admin/?tab=x");
  const { result } = renderHook(() => {
    usePublishCriteriaDeepLink();
    return usePublishRequest();
  });
  expect(result.current).toBeNull();
  expect(window.location.search).toBe("?tab=x");
});

it("useAdminAssistantAvailability turns off only when the server says so", async () => {
  vi.stubGlobal("fetch", async () => json({ adminAssistantEnabled: false }));
  const { result } = renderHook(() => useAdminAssistantAvailability({ id: "u1", username: "admin" }));
  expect(result.current).toBe(true);
  await waitFor(() => expect(result.current).toBe(false));
});

it("useAdminAssistantAvailability stays on when the field is absent", async () => {
  const seen: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    seen.push(String(url));
    return json({});
  });
  const { result } = renderHook(() => useAdminAssistantAvailability({ id: "u1", username: "admin" }));
  await waitFor(() => expect(seen).toHaveLength(1));
  await act(async () => {});
  expect(result.current).toBe(true);
});

it("useAdminAssistantAvailability fails open when the settings read fails", async () => {
  let rejected = false;
  vi.stubGlobal("fetch", async () => {
    rejected = true;
    throw new TypeError("network down");
  });
  const { result } = renderHook(() => useAdminAssistantAvailability({ id: "u1", username: "admin" }));
  await waitFor(() => expect(rejected).toBe(true));
  await act(async () => {});
  expect(result.current).toBe(true);
});

it("logout still signs this tab out when the logout request itself fails", async () => {
  let logoutCalls = 0;
  const sessionApi = {
    async me() { return { user: { id: "u1", username: "admin" }, effectivePermissions: ["posts.read"] }; },
    async redeemBootSession() { return { user: { id: "u1" } }; },
    async signInLocalOwner() { return { user: { id: "u1" } }; },
    async logout(): Promise<{ ok: boolean }> {
      logoutCalls += 1;
      throw new Error("server unreachable");
    },
  };
  const { result } = renderHook(() =>
    useAdminSession({}, {
      sessionApi,
      location: { hostname: "example.com", hash: "", pathname: "/admin/", search: "" },
      history: { replaceState() {} },
      subscribeUnauthenticated: () => () => {},
      subscribeSettingsChanges: () => () => {},
    }),
  );
  await waitFor(() => expect(result.current.user?.id).toBe("u1"));
  await act(() => result.current.logout());
  expect(logoutCalls).toBe(1);
  expect(result.current.user).toBeNull();
  expect(result.current.effectivePermissions).toEqual([]);
});
