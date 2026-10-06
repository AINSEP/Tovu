// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useThemeExploreTheme } from "../hooks/use-theme-explore-theme.hooks";
import { createFakeThemesPort } from "../hooks/themes-dependencies.hooks";
import type { ThemesPort } from "../hooks/themes-port.hooks";

describe("Explore theme resolution", () => {
  it("keeps an explicit theme and does not query the registry settings", () => {
    const getPresentation = vi.fn();
    const { result } = renderHook(() => useThemeExploreTheme({ themeId: "novice" }, { port: { getPresentation } }));
    expect(result.current).toEqual({ themeId: "novice", loading: false, error: null });
    expect(getPresentation.mock.calls).toEqual([]);
  });

  it("ignores an earlier fallback response after an explicit theme is selected", async () => {
    const presentation = await createFakeThemesPort().getPresentation();
    let settle!: (value: Awaited<ReturnType<ThemesPort["getPresentation"]>>) => void;
    const getPresentation = vi.fn().mockResolvedValue(presentation).mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; }));
    const port = { getPresentation };
    const { result, rerender } = renderHook(
      ({ themeId }) => useThemeExploreTheme({ themeId }, { port }),
      { initialProps: { themeId: "" } },
    );
    expect(result.current).toEqual({ themeId: null, loading: true, error: null });
    rerender({ themeId: "novice" });
    await act(async () => { settle(presentation); });
    expect(result.current).toEqual({ themeId: "novice", loading: false, error: null });
    rerender({ themeId: "" });
    expect(result.current).toEqual({ themeId: null, loading: true, error: null });
    await waitFor(() => expect(result.current).toEqual({ themeId: "basic", loading: false, error: null }));
    expect(getPresentation.mock.calls).toEqual([[], []]);
  });

  it("surfaces a settings lookup failure without resolving an empty-ID editor", async () => {
    const port = { getPresentation: vi.fn().mockRejectedValue(new Error("Presentation unavailable")) };
    const { result } = renderHook(() => useThemeExploreTheme({ themeId: "" }, { port }));
    await waitFor(() => expect(result.current).toEqual({ themeId: null, loading: false, error: "Presentation unavailable" }));
  });
});
