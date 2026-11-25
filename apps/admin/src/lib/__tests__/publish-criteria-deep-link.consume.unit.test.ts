import { renderHook } from "@/__tests__/fetch-query-render";
import { expect, it, vi } from "vitest";
import { usePublishCriteriaDeepLink } from "../../App.hooks";

it("the real hook consumes an invalid publish parameter once, retaining other parameters and hash", () => {
  window.history.replaceState(null, "", "/admin/?foo=bar&publish=invalid#section");
  const replace = vi.spyOn(window.history, "replaceState");
  const request = vi.fn();
  try {
    const { rerender } = renderHook(() => usePublishCriteriaDeepLink({}, { request }));
    rerender();
    expect(request).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledExactlyOnceWith(null, "", "/admin/?foo=bar#section");
  } finally {
    replace.mockRestore();
    window.history.replaceState(null, "", "/");
  }
});
