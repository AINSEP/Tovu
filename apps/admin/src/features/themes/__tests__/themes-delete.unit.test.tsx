import { act, render, renderHook, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type PresentationSettings } from "@/lib/api";
import { Themes } from "../Themes";
import { createFakeThemesPort, defaultThemesPort } from "../hooks/themes-dependencies.hooks";
import { useThemeDeleteRequest } from "../hooks/use-theme-delete-request.hooks";
import { useThemes, type ThemesController } from "../hooks/use-themes.hooks";
import { buildThemeCardMenuItems, themeDeleteBlock, themeDeleteBlockReasonKey } from "../theme-card-menu";
import { THEMES_DICT } from "../themes-i18n";

/**
 * @file The theme card's ⋮ menu (owner 2026-10-10): Copy theme moved in from its icon button, and
 * Delete theme… sends a theme to the Trash after a confirmation. Covers the pure menu rules, the
 * `trash` round trip in `useThemes` against the fake port, the confirmation hook, the real port's
 * binding to the generic Trash route, and the screen wiring through the `useThemesHook` seam.
 */

const SETTINGS: PresentationSettings = { workspaceId: "w1", activeThemeId: "plannie", updatedAt: "2026-10-10T00:00:00.000Z" };
const identity = (key: string): string => key;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("themeDeleteBlock", () => {
  it("refuses the active theme, then a built-in one, and allows the rest", () => {
    expect(themeDeleteBlock({ settings: SETTINGS, themeId: "plannie", builtIn: false })).toBe("active");
    expect(themeDeleteBlock({ settings: SETTINGS, themeId: "plannie", builtIn: true })).toBe("active");
    expect(themeDeleteBlock({ settings: SETTINGS, themeId: "tovu-starter", builtIn: true })).toBe("built-in");
    expect(themeDeleteBlock({ settings: SETTINGS, themeId: "plannie-copy", builtIn: false })).toBeNull();
  });

  it("gives each refusal its own reason", () => {
    expect(themeDeleteBlockReasonKey("active")).toBe("Turn this theme off or activate another one first");
    expect(themeDeleteBlockReasonKey("built-in")).toBe("Built-in themes can't be deleted");
  });
});

describe("buildThemeCardMenuItems", () => {
  const base = { themeId: "plannie-copy", name: "Plannie copy", block: null, duplicatingTheme: null, t: identity } as const;

  it("lists Copy theme then a danger-toned Delete theme…, each wired to its handler", () => {
    const duplicate = vi.fn(async () => {});
    const onRequestDelete = vi.fn();
    const items = buildThemeCardMenuItems(base, { duplicate, onRequestDelete });
    expect(items.map((item) => [item.key, item.label, item.tone])).toEqual([
      ["copy", "Copy theme", undefined],
      ["delete", "Delete theme…", "danger"],
    ]);
    items[0]!.onSelect();
    expect(duplicate).toHaveBeenCalledWith("plannie-copy");
    items[1]!.onSelect();
    expect(onRequestDelete).toHaveBeenCalledWith({ themeId: "plannie-copy", name: "Plannie copy", block: null });
  });

  it("passes a refusal through to Delete instead of hiding the item", () => {
    const onRequestDelete = vi.fn();
    const [item] = buildThemeCardMenuItems({ ...base, block: "active" }, { onRequestDelete });
    item!.onSelect();
    expect(onRequestDelete).toHaveBeenCalledWith({ themeId: "plannie-copy", name: "Plannie copy", block: "active" });
  });

  it("shows Copy as busy and does nothing while any copy is in flight", () => {
    const duplicate = vi.fn(async () => {});
    const [copy] = buildThemeCardMenuItems({ ...base, duplicatingTheme: "other" }, { duplicate });
    expect(copy!.label).toBe("Duplicating…");
    copy!.onSelect();
    expect(duplicate).not.toHaveBeenCalled();
  });

  it("leaves out each item whose handler is missing", () => {
    expect(buildThemeCardMenuItems(base)).toEqual([]);
    expect(buildThemeCardMenuItems(base, { onRequestDelete: vi.fn() }).map((item) => item.key)).toEqual(["delete"]);
  });
});

describe("useThemes — trash", () => {
  const themes = [
    { id: "plannie", name: "Plannie", tier: "static" as const },
    { id: "plannie-copy", name: "Plannie copy", tier: "static" as const },
    { id: "tovu-starter", name: "Tovu Starter", tier: "static" as const, builtIn: true },
  ];

  it("exposes which themes are built in, defaulting to false", async () => {
    const port = createFakeThemesPort({ settings: SETTINGS, availableThemeIds: themes.map((theme) => theme.id), availableThemes: themes });
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.themeBuiltIn).toEqual({ plannie: false, "plannie-copy": false, "tovu-starter": true });
  });

  it("trashes through the port, reloads the list without the theme, and announces it", async () => {
    const port = createFakeThemesPort({ settings: SETTINGS, availableThemeIds: themes.map((theme) => theme.id), availableThemes: themes });
    const portSpy = vi.spyOn(port, "trashTheme");
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.themes).toHaveLength(3));

    await act(async () => {
      await result.current.trash?.("plannie-copy");
    });

    expect(portSpy).toHaveBeenCalledWith({ themeId: "plannie-copy" });
    expect(result.current.themes).toEqual(["plannie", "tovu-starter"]);
    expect(result.current.trashNotice).toBe('Moved "Plannie copy" to Trash');
    expect(result.current.trashingTheme).toBeNull();

    act(() => result.current.dismissTrashNotice?.());
    expect(result.current.trashNotice).toBeNull();
  });

  it("surfaces the server's refusal as the screen error and keeps the theme", async () => {
    const port = createFakeThemesPort({ settings: SETTINGS, availableThemeIds: themes.map((theme) => theme.id), availableThemes: themes });
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.themes).toHaveLength(3));
    await act(async () => {
      await result.current.trash?.("plannie");
    });
    expect(result.current.error).toBe("theme 'plannie' is the active theme");
    expect(result.current.themes).toHaveLength(3);
    expect(result.current.trashNotice).toBeNull();
    expect(result.current.trashingTheme).toBeNull();
  });

  it("uses the translated generic message when the rejection is not an Error", async () => {
    const port = createFakeThemesPort();
    port.trashTheme = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemes({ port, t: identity }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    await act(async () => {
      await result.current.trash?.("basic");
    });
    expect(result.current.error).toBe("failed to delete theme");
  });
});

describe("theme ports — trashTheme", () => {
  it("the real port moves the theme through the generic Trash route", async () => {
    const spy = vi.spyOn(api, "trash").mockResolvedValue({ ok: true, version: null });
    await expect(defaultThemesPort.trashTheme({ themeId: "plannie-copy" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith({ type: "theme", id: "plannie-copy" });
  });

  it("the fake refuses an unknown id", async () => {
    await expect(createFakeThemesPort().trashTheme({ themeId: "nope" })).rejects.toThrow("theme 'nope' was not found");
  });
});

describe("useThemeDeleteRequest", () => {
  it("reports a refusal without opening the dialog or trashing", async () => {
    const trash = vi.fn(async () => {});
    const { result } = renderHook(() => useThemeDeleteRequest({ t: identity, trash }, {}));
    await act(async () => {
      await result.current.requestDelete({ themeId: "plannie", name: "Plannie", block: "active" });
    });
    expect(result.current.blockedNotice).toBe("Turn this theme off or activate another one first");
    expect(result.current.dialog.open).toBe(false);
    expect(trash).not.toHaveBeenCalled();
    act(() => result.current.dismissBlockedNotice());
    expect(result.current.blockedNotice).toBeNull();
  });

  it("asks first, names the theme, and trashes only once confirmed", async () => {
    const trash = vi.fn(async () => {});
    const { result } = renderHook(() => useThemeDeleteRequest({ t: identity, trash }, {}));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.requestDelete({ themeId: "plannie-copy", name: "Plannie copy", block: null });
    });
    expect(result.current.dialog).toMatchObject({ open: true, title: "Delete Plannie copy?", body: "It moves to Trash.", confirmLabel: "Delete", tone: "danger" });
    expect(trash).not.toHaveBeenCalled();
    await act(async () => {
      result.current.dialog.onConfirm();
      await pending;
    });
    expect(trash).toHaveBeenCalledWith("plannie-copy");
    expect(result.current.dialog.open).toBe(false);
  });

  it("does not trash when cancelled", async () => {
    const trash = vi.fn(async () => {});
    const { result } = renderHook(() => useThemeDeleteRequest({ t: identity, trash }, {}));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.requestDelete({ themeId: "plannie-copy", name: "Plannie copy", block: null });
    });
    await act(async () => {
      result.current.dialog.onCancel();
      await pending;
    });
    expect(trash).not.toHaveBeenCalled();
  });
});

function controller(overrides: Partial<ThemesController> = {}): ThemesController {
  return {
    settings: SETTINGS,
    themes: ["plannie", "plannie-copy", "tovu-starter"],
    themeNames: { plannie: "Plannie", "plannie-copy": "Plannie copy", "tovu-starter": "Tovu Starter" },
    themeBuiltIn: { "tovu-starter": true },
    error: null,
    busyTheme: null,
    activate: vi.fn(async () => {}),
    t: identity,
    ...overrides,
  };
}

async function openCardMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("button", { name: `More actions for ${name}` }));
  return screen.getByRole("menu");
}

describe("Themes — card ⋮ menu", () => {
  it("replaces the Duplicate icon button with a ⋮ beside Explore", () => {
    render(<Themes useThemesHook={() => controller({ duplicate: vi.fn(async () => {}) })} />);
    const card = screen.getByText("Plannie copy").closest(".theme-card") as HTMLElement;
    expect(within(card).getByRole("button", { name: "Explore Plannie copy" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "More actions for Plannie copy" })).toHaveAttribute("aria-haspopup", "menu");
    expect(within(card).queryByRole("button", { name: /^Duplicate/ })).not.toBeInTheDocument();
  });

  it("Copy theme duplicates that card's theme", async () => {
    const user = userEvent.setup();
    const duplicate = vi.fn(async () => {});
    render(<Themes useThemesHook={() => controller({ duplicate })} />);
    const menu = await openCardMenu(user, "Plannie copy");
    await user.click(within(menu).getByRole("menuitem", { name: "Copy theme" }));
    expect(duplicate).toHaveBeenCalledWith("plannie-copy");
  });

  it("Delete theme… confirms with the theme's name, then trashes it", async () => {
    const user = userEvent.setup();
    const trash = vi.fn(async () => {});
    render(<Themes useThemesHook={() => controller({ trash })} />);
    const menu = await openCardMenu(user, "Plannie copy");
    await user.click(within(menu).getByRole("menuitem", { name: "Delete theme…" }));
    const dialog = screen.getByText("Delete Plannie copy?").closest("dialog") as HTMLElement;
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByText("It moves to Trash.")).toBeInTheDocument();
    expect(trash).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(trash).toHaveBeenCalledWith("plannie-copy"));
  });

  it("the active theme's Delete explains instead of asking", async () => {
    const user = userEvent.setup();
    const trash = vi.fn(async () => {});
    render(<Themes useThemesHook={() => controller({ trash })} />);
    const menu = await openCardMenu(user, "Plannie");
    await user.click(within(menu).getByRole("menuitem", { name: "Delete theme…" }));
    expect(screen.getByRole("status")).toHaveTextContent("Turn this theme off or activate another one first");
    expect(screen.queryByText("Delete Plannie?")).not.toBeInTheDocument();
    expect(trash).not.toHaveBeenCalled();
  });

  it("a built-in theme's Delete explains instead of asking", async () => {
    const user = userEvent.setup();
    const trash = vi.fn(async () => {});
    render(<Themes useThemesHook={() => controller({ trash })} />);
    const menu = await openCardMenu(user, "Tovu Starter");
    await user.click(within(menu).getByRole("menuitem", { name: "Delete theme…" }));
    expect(screen.getByRole("status")).toHaveTextContent("Built-in themes can't be deleted");
    expect(trash).not.toHaveBeenCalled();
  });

  it("has no ⋮ for a controller with neither duplicate nor trash", () => {
    render(<Themes useThemesHook={() => controller()} />);
    expect(screen.queryByRole("button", { name: /^More actions for/ })).not.toBeInTheDocument();
  });

  it("shows the success toast from trashNotice", () => {
    render(<Themes useThemesHook={() => controller({ trash: vi.fn(async () => {}), trashNotice: 'Moved "Plannie copy" to Trash' })} />);
    expect(screen.getByRole("status")).toHaveTextContent('Moved "Plannie copy" to Trash');
  });
});

describe("themes-i18n — card menu keys", () => {
  it("every locale translates every key the card menu introduced, keeping {name}", () => {
    const keys = [
      "More actions for {name}", "Copy theme", "Delete theme…", "Delete {name}?", "It moves to Trash.",
      "Turn this theme off or activate another one first", "Built-in themes can't be deleted",
      'Moved "{name}" to Trash', "failed to delete theme",
    ];
    for (const [locale, dict] of Object.entries(THEMES_DICT)) {
      for (const key of keys) expect(dict[key], `${locale}: ${key}`).toBeTruthy();
      for (const key of keys.filter((k) => k.includes("{name}"))) expect(dict[key], `${locale}: ${key}`).toContain("{name}");
    }
  });
});
