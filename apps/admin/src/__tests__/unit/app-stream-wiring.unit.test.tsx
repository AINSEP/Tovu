import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { expect, it } from "vitest";
import { useAdminSession, useAgentPageBridge } from "../../App.hooks";
import { openTabEventSource } from "../../lib/tab-event-source";
import type { FrontendSessionBridge, createFrontendSessionBridge } from "@jini-ai/chat/react";

/** sseshare: the app passes identity and the visibility-managed page-stream adapter via DI. */
it("scopes shared settings to the current principal and disposes on logout", async () => {
  const subscriptions: { workspace: string; principal?: string; closed: boolean }[] = [];
  const { result, unmount } = renderHook(() => useAdminSession({}, {
    sessionApi: {
      me: async () => ({ user: { id: "owner-a", username: "admin" }, effectivePermissions: [] }),
      signInLocalOwner: async () => ({ user: { id: "owner-a" } }),
      redeemBootSession: async () => ({ user: { id: "owner-a" } }),
      logout: async () => ({ ok: true }),
    },
    location: { hostname: "example.com", hash: "", pathname: "/admin/", search: "" },
    history: { replaceState() {} }, subscribeUnauthenticated: () => () => {},
    subscribeSettingsChanges: (workspace, options) => {
      const entry = { workspace, principal: options?.principalId, closed: false };
      subscriptions.push(entry);
      return () => { entry.closed = true; };
    },
  }));
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(subscriptions).toHaveLength(1);
  expect(subscriptions[0]!.principal).toBe("owner-a");
  await act(async () => result.current.logout());
  expect(subscriptions[0]!.closed).toBe(true);
  unmount();
});

it("uses the tab-stream adapter in the bridge's openStream port", () => {
  let openStream: Parameters<typeof createFrontendSessionBridge>[0]["openStream"] | undefined;
  let closed = false;
  const bridge: FrontendSessionBridge = {
    ready: Promise.resolve({ sessionId: "a", bindToken: "b" }), bindToken: () => "b",
    close: () => { closed = true; },
    bridgeAccess: { subscribe: () => () => {}, respondSuccess: async () => {}, respondError: async () => {} },
  };
  const createBridge: typeof createFrontendSessionBridge = (required) => {
    openStream = required.openStream;
    return bridge;
  };
  const { result, unmount } = renderHook(() => useAgentPageBridge({ createBridge }));
  act(() => result.current.setContentEl(document.createElement("main")));
  expect(openStream).toBe(openTabEventSource);
  unmount();
  expect(closed).toBe(true);
});
