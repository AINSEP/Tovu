import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useAdminPageApproval } from "../admin-page-approval.hooks";

// The dialog has no buttons while idle; exercise the hook's public actions directly.
it("ignores confirm and cancel when the default approval store has no pending proposal", () => {
  const { result, unmount } = renderHook(() => useAdminPageApproval({}));
  expect(result.current.pending).toBeNull();
  expect(result.current.details).toBe("");
  act(() => {
    result.current.confirm();
    result.current.cancel();
  });
  expect(result.current.pending).toBeNull();
  expect(result.current.error).toBeNull();
  unmount();
});
