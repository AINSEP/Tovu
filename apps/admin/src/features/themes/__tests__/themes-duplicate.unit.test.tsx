import { act, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { api, type PresentationSettings } from "@/lib/api";
import { Themes } from "../Themes";
import { createFakeThemesPort } from "../hooks/themes-dependencies.hooks";
import { useThemes, type ThemesController } from "../hooks/use-themes.hooks";
import { THEMES_DICT } from "../themes-i18n";

/**
 * @file The Themes screen's Duplicate action (2026-10-08): the hook against the injected port, the
 * card button through the `useThemesHook` seam, and the i18n keys it introduced.
 */

const SETTINGS: PresentationSettings = { workspaceId: "w1", activeThemeId: "basic", updatedAt: "2026-08-01T00:00:00.000Z" };
const identity = (key: string): string => key;

describe("useThemes — duplicate", () => {
  it("duplicates through the port as '<name> copy', reloads the list, and announces the copy", async () => {
    const duplicateSpy = vi.spyOn(api, "duplicateTheme");
    const port = createFakeThemesPort({ availableThemeIds: ["basic"], availableThemes: [{ id: "basic", name: "Basic", tier: "declarative" }] });
    const portSpy = vi.spyOn(port, "duplicateTheme");
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.duplicate?.("basic");
    });

    expect(portSpy).toHaveBeenCalledWith("basic", "Basic copy");
    expect(result.current.themes).toEqual(["basic", "basic-copy"]);
    expect(result.current.themeNames).toMatchObject({ "basic-copy": "Basic copy" });
    expect(result.current.duplicateNotice).toBe('Duplicated as "Basic copy"');
    expect(result.current.duplicatingTheme).toBeNull();
    expect(duplicateSpy).not.toHaveBeenCalled();

    act(() => result.current.dismissDuplicateNotice?.());
    expect(result.current.duplicateNotice).toBeNull();
  });

  it("falls back to the theme id when the theme has no display name", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["quartz"], availableThemes: [{ id: "quartz", tier: "static" }] });
    const portSpy = vi.spyOn(port, "duplicateTheme");
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.themes).toEqual(["quartz"]));
    await act(async () => {
      await result.current.duplicate?.("quartz");
    });
    expect(portSpy).toHaveBeenCalledWith("quartz", "quartz copy");
  });

  it("surfaces a refusal as the screen error and clears the busy state", async () => {
    const port = createFakeThemesPort();
    port.duplicateTheme = async () => {
      throw new Error("theme id 'basic-copy' is already taken");
    };
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    await act(async () => {
      await result.current.duplicate?.("basic");
    });
    expect(result.current.error).toBe("theme id 'basic-copy' is already taken");
    expect(result.current.duplicatingTheme).toBeNull();
    expect(result.current.duplicateNotice).toBeNull();
  });

  it("uses the translated generic message when the rejection is not an Error", async () => {
    const port = createFakeThemesPort();
    port.duplicateTheme = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    await act(async () => {
      await result.current.duplicate?.("basic");
    });
    expect(result.current.error).toBe("failed to duplicate theme");
  });
});

function controller(overrides: Partial<ThemesController> = {}): ThemesController {
  return { settings: SETTINGS, themes: ["basic", "column"], error: null, busyTheme: null, activate: vi.fn(async () => {}), t: identity, ...overrides };
}

// Duplicate lives in each card's ⋮ menu as "Copy theme" since 2026-10-10 (its icon button is gone).
describe("Themes — Copy theme (card menu)", () => {
  it("each card's Copy theme calls duplicate with that card's theme id", async () => {
    const duplicate = vi.fn(async () => {});
    render(<Themes useThemesHook={() => controller({ duplicate, duplicatingTheme: null })} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions for column" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Copy theme" }));
    expect(duplicate).toHaveBeenCalledWith("column");
  });

  it("shows the busy label and does nothing while a copy is in flight", async () => {
    const duplicate = vi.fn(async () => {});
    render(<Themes useThemesHook={() => controller({ duplicate, duplicatingTheme: "basic" })} />);
    await userEvent.click(screen.getByRole("button", { name: "More actions for column" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Duplicating…" }));
    expect(duplicate).not.toHaveBeenCalled();
  });

  it("is absent for a controller without duplicate (older test doubles)", () => {
    render(<Themes useThemesHook={() => controller()} />);
    expect(screen.queryByRole("button", { name: /^More actions for/ })).not.toBeInTheDocument();
  });

  it("shows the success toast from duplicateNotice", () => {
    render(<Themes useThemesHook={() => controller({ duplicate: vi.fn(async () => {}), duplicateNotice: 'Duplicated as "Basic copy"' })} />);
    expect(screen.getByRole("status")).toHaveTextContent('Duplicated as "Basic copy"');
  });
});

describe("themes-i18n — duplicate keys", () => {
  it("every locale translates every key the Duplicate action introduced", () => {
    const keys = ["Duplicate", "Duplicating…", "{name} copy", 'Duplicated as "{name}"', "failed to duplicate theme"];
    for (const [locale, dict] of Object.entries(THEMES_DICT)) {
      for (const key of keys) expect(dict[key], `${locale}: ${key}`).toBeTruthy();
      expect(dict["{name} copy"], locale).toContain("{name}");
      expect(dict['Duplicated as "{name}"'], locale).toContain("{name}");
    }
  });
});
