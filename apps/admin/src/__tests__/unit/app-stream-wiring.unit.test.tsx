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

/** Re-targeting the page root (a remount of the content area) must close the old bridge and expose
 *  the new one; detaching the root entirely must close it and clear `agentBridge` so nothing keeps
 *  routing `page.*` calls through a closed relay. */
it("closes the previous bridge when the content root changes, and clears it when the root detaches", () => {
  const made: Array<FrontendSessionBridge & { closed: boolean }> = [];
  const createBridge: typeof createFrontendSessionBridge = () => {
    const bridge = {
      closed: false,
      ready: Promise.resolve({ sessionId: `s${made.length}`, bindToken: "b" }), bindToken: () => "b",
      close: () => { bridge.closed = true; },
      bridgeAccess: { subscribe: () => () => {}, respondSuccess: async () => {}, respondError: async () => {} },
    };
    made.push(bridge);
    return bridge;
  };
  const { result, unmount } = renderHook(() => useAgentPageBridge({ createBridge }));
  expect(result.current.agentBridge).toBeNull();

  act(() => result.current.setContentEl(document.createElement("main")));
  expect(made).toHaveLength(1);
  expect(result.current.agentBridge).toBe(made[0]);

  act(() => result.current.setContentEl(document.createElement("main")));
  expect(made).toHaveLength(2);
  expect(made[0].closed).toBe(true);
  expect(made[1].closed).toBe(false);
  expect(result.current.agentBridge).toBe(made[1]);

  act(() => result.current.setContentEl(null));
  expect(made[1].closed).toBe(true);
  expect(result.current.agentBridge).toBeNull();
  unmount();
});
