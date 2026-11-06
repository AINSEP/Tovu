import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { formatUserFacingError } from "@jini-ai/core";
import { useAdminSession } from "../../App.hooks";
import { adminFailureChannel } from "../../lib/admin-failure-channel";
import { setAdminDraftIdentity } from "../../lib/admin-draft-identity";

const failure = formatUserFacingError({ message: "Pages could not be loaded.", action: "Try again.", step: "Loading pages", cause: "Safe report" });
afterEach(() => { adminFailureChannel.reset(); setAdminDraftIdentity({ id: null }); });

it("forgets retained incidents when a new session signs in or signs out", async () => {
  setAdminDraftIdentity({ id: null });
  let invalidateSession: () => void = () => {};
  const sessionApi = {
    me: async () => ({ user: { id: "owner", username: "Owner" } }),
    redeemBootSession: async () => ({ user: { id: "owner" } }),
    signInLocalOwner: async () => ({ user: { id: "owner" } }),
    logout: async () => ({ ok: true }),
  };
  const { result } = renderHook(() => useAdminSession({}, {
    sessionApi, location: { hostname: "host.example", pathname: "/admin/", search: "", hash: "" },
    subscribeSettingsChanges: () => () => {}, subscribeUnauthenticated: listener => { invalidateSession = listener; return () => {}; },
  }));
  await waitFor(() => expect(result.current.checking).toBe(false));
  act(() => adminFailureChannel.publish({ failure }));
  act(() => invalidateSession());
  expect(adminFailureChannel.getSnapshot()).toBeNull();
  act(() => adminFailureChannel.publish({ failure }));
  act(() => result.current.handleLogin({ id: "next-owner", username: "Next owner" }));
  expect(adminFailureChannel.getSnapshot()).toBeNull();
  act(() => adminFailureChannel.publish({ failure }));
  await act(async () => { await result.current.logout(); });
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});
