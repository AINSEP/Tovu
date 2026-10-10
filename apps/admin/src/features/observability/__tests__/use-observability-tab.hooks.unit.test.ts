import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useObservabilityTab } from "../hooks/use-observability-tab.hooks";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/router", () => ({ navigate }));
const tabs = [
  { id: "overview", label: "Overview", subtitle: "Overview copy", panel: null },
  { id: "queries", label: "Queries", subtitle: "Queries copy", panel: null },
];

describe("Observability page tab adapter", () => {
  it("selects a deep link and follows later route changes without navigating on load", () => {
    navigate.mockClear();
    const { result, rerender } = renderHook(({ tabId }) => useObservabilityTab({ tabs, tabId }), { initialProps: { tabId: "queries" } });
    expect(result.current.activeTabId).toBe("queries");
    expect(result.current.subtitle).toBe("Queries copy");
    rerender({ tabId: "overview" });
    expect(result.current.activeTabId).toBe("overview");
    expect(result.current.subtitle).toBe("Overview copy");
    expect(navigate).not.toHaveBeenCalled();
    act(() => result.current.onTabChange("queries"));
    expect(result.current.subtitle).toBe("Queries copy");
    expect(navigate).toHaveBeenCalledWith("/observability?tab=queries", { replace: true });
  });

  it.each([null, "missing", "queries"])("uses Overview for an unavailable request %s", tabId => {
    const { result } = renderHook(() => useObservabilityTab({ tabs: tabs.slice(0, 1), tabId }));
    expect(result.current.activeTabId).toBe("overview");
    expect(result.current.subtitle).toBe("Overview copy");
  });

  it("falls back when permissions remove the selected tab", () => {
    const { result, rerender } = renderHook(({ available }) => useObservabilityTab({ tabs: available, tabId: "queries" }), { initialProps: { available: tabs } });
    expect(result.current.activeTabId).toBe("queries");
    rerender({ available: tabs.slice(0, 1) });
    expect(result.current.activeTabId).toBe("overview");
  });
  it("also falls back after local selection when an uncontrolled mount loses Queries", () => {
    const { result, rerender } = renderHook(({ available }) => useObservabilityTab({ tabs: available }), { initialProps: { available: tabs } });
    act(() => result.current.onTabChange("queries"));
    expect(result.current.activeTabId).toBe("queries");
    rerender({ available: tabs.slice(0, 1) });
    expect(result.current.activeTabId).toBe("overview");
    expect(result.current.subtitle).toBe("Overview copy");
  });
});
