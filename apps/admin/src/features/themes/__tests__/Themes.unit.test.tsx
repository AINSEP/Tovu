import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Themes } from "../Themes";
import type { ThemesController } from "../hooks/use-themes.hooks";
import type { PresentationSettings } from "../../../lib/api";

/**
 * @file `Themes` (Themes screen) — driven through the `useThemesHook` dependency-injection
 * seam. `features/themes` was 3.6% covered with no dedicated test file before this pass.
 */

const SETTINGS: PresentationSettings = {
  workspaceId: "w1",
  activeThemeId: "signal",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function baseController(overrides: Partial<ThemesController> = {}): ThemesController {
  return {
    settings: SETTINGS,
    themes: ["tovu-official", "column", "signal"],
    error: null,
    busyTheme: null,
    activate: vi.fn(async () => {}),
    // Identity `t` — matches what this screen got from a real, unmocked `useAdminLocale()` call
    // before this hook's own i18n pass (defaults to "en", and THEMES_DICT has no "en" entries, so
    // every lookup already fell through to `?? key`), so every existing literal-English-string
    // assertion below stays valid unchanged.
    t: (key: string) => key,
    ...overrides,
  };
}

describe("loading and error states", () => {
  it("shows a loading placeholder before settings have loaded", () => {
    render(<Themes useThemesHook={() => baseController({ settings: null, themes: [] })} />);
    expect(screen.getByText("Loading themes…")).toBeInTheDocument();
  });

  it("shows the error message instead of the grid when the initial load failed (no settings yet)", () => {
    render(
      <Themes
        useThemesHook={() => baseController({ settings: null, themes: [], error: "failed to load themes" })}
      />,
    );
    expect(screen.getByText("failed to load themes")).toBeInTheDocument();
    expect(screen.queryByText("Themes")).not.toBeInTheDocument();
  });

  it("shows a non-fatal error banner alongside the grid once settings have already loaded", () => {
    render(<Themes useThemesHook={() => baseController({ error: "failed to switch theme" })} />);
    expect(screen.getByText("failed to switch theme")).toBeInTheDocument();
    expect(screen.getByText("Themes")).toBeInTheDocument();
  });
});

describe("stranded active theme", () => {
  it("shows no warning when the active theme is present in the discovered set (the normal case)", () => {
    render(<Themes useThemesHook={() => baseController()} />);
    expect(screen.queryByText(/no longer available/i)).not.toBeInTheDocument();
  });

  it("warns, naming the missing theme id, when settings.activeThemeId resolves to nothing the server discovered", () => {
    render(
      <Themes
        useThemesHook={() =>
          baseController({
            settings: { ...SETTINGS, activeThemeId: "deleted-theme" },
            themes: ["tovu-official", "column", "signal"], // "deleted-theme" is absent
          })
        }
      />,
    );
    const warning = screen.getByText(/no longer available/i);
    expect(warning).toHaveTextContent("deleted-theme");
    expect(warning.closest(".notice")).toHaveClass("warning");
    expect(warning.closest(".notice")).not.toHaveClass("error");
    // Honest, not alarmist — see rules.ts's isStrandedActiveTheme doc for why this is a real
    // (site-down) consequence that must still not be worded as data loss.
    expect(warning).toHaveTextContent(/no content was lost/i);
  });

  it("still renders every theme card and grid controls normally alongside the warning", () => {
    render(
      <Themes
        useThemesHook={() =>
          baseController({ settings: { ...SETTINGS, activeThemeId: "deleted-theme" } })
        }
      />,
    );
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.getByText("tovu-official")).toBeInTheDocument();
    expect(screen.getByText("column")).toBeInTheDocument();
    expect(screen.getByText("signal")).toBeInTheDocument();
    // None of the cards claim to be Active — the whole point is that nothing legitimately can.
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });
});

describe("theme grid", () => {
  it("names the picker so assistive tech can identify it — regression for a previously nameless <div>", () => {
    render(<Themes useThemesHook={() => baseController()} />);
    expect(screen.getByRole("group", { name: "Themes" })).toBeInTheDocument();
  });

  it("marks the active theme with the Active tag, not an Activate button", () => {
    render(<Themes useThemesHook={() => baseController()} />);
    const activeCard = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    expect(activeCard).toHaveClass("active");
    expect(activeCard.querySelector(".theme-active-tag")).toHaveTextContent("Active");
    // Scoped past the card's own preview-expand trigger button (unrelated to Activate/Active).
    expect(within(activeCard).queryByRole("button", { name: /^Activate/ })).not.toBeInTheDocument();
  });

  it("gives every inactive theme an Activate button that calls activate(themeId)", async () => {
    const user = userEvent.setup();
    const activate = vi.fn(async () => {});
    render(<Themes useThemesHook={() => baseController({ activate })} />);

    const columnCard = screen.getByText("column").closest(".theme-card") as HTMLElement;
    await user.click(within(columnCard).getByRole("button", { name: "Activate" }));
    expect(activate).toHaveBeenCalledWith("column");
  });

  it("disables every Activate button while any one theme is busy, and shows Activating… on that one", () => {
    render(<Themes useThemesHook={() => baseController({ busyTheme: "column" })} />);
    const columnButton = screen.getByRole("button", { name: "Activating…" });
    const officialCard = screen.getByText("tovu-official").closest(".theme-card") as HTMLElement;
    const officialButton = within(officialCard).getByRole("button", { name: "Activate" });
    expect(columnButton).toBeDisabled();
    expect(officialButton).toBeDisabled();
    expect(officialButton).toHaveTextContent("Activate");
  });

  it("renders a card for every theme, using known blurb copy where available and blank otherwise", () => {
    render(<Themes useThemesHook={() => baseController({ themes: ["signal", "some-unknown-theme"] })} />);
    expect(screen.getByText(/bright product-blog/i)).toBeInTheDocument();
    const unknownCard = screen.getByText("some-unknown-theme").closest(".theme-card") as HTMLElement;
    expect(unknownCard.querySelector("p")).toHaveTextContent("");
  });

  it("styles Activate with the admin's primary-action class, not the muted theme-card default (owner feedback: match PostEditor's Save button)", () => {
    render(<Themes useThemesHook={() => baseController()} />);
    const columnCard = screen.getByText("column").closest(".theme-card") as HTMLElement;
    expect(within(columnCard).getByRole("button", { name: "Activate" })).toHaveClass("btn-primary");
  });
});

describe("View site link", () => {
  it("links out to the public site root", () => {
    render(<Themes useThemesHook={() => baseController()} />);
    const link = screen.getByRole("link", { name: /view site/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});

describe("tier tabs", () => {
  it("renders four tab-group tabs (not five raw tiers) plus a disabled Marketplace placeholder, each carrying its theme count", () => {
    render(
      <Themes
        useThemesHook={() =>
          baseController({ themeTiers: { "tovu-official": "declarative", column: "static", signal: "static" } })
        }
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Declarative1",
      "Templated0",
      "Static2",
      "Code0",
      // No count suffix: this controller's `marketplace` is empty, and the tab passes `undefined`
      // rather than 0 so an unopened Marketplace does not advertise "0 available" before it has
      // been asked. The tiers above always show their count because it is already known.
      "Marketplace",
    ]);
  });

  it("folds a handlebars-tier theme into the same Templated tab a templated-tier theme uses — owner feedback: 5 raw tiers, 4 conceptual tabs", () => {
    render(
      <Themes
        useThemesHook={() => baseController({ themeTiers: { "tovu-official": "handlebars" } })}
      />,
    );
    expect(screen.getByRole("tab", { name: "Templated1" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Handlebars/ })).not.toBeInTheDocument();
  });

  it("opens on the tab matching the active theme's tier, not always the first tier", () => {
    // SETTINGS.activeThemeId is "signal" — putting it in the static tier should open Static, not
    // Declarative (the first tier in tab order).
    render(
      <Themes
        useThemesHook={() => baseController({ themeTiers: { signal: "static" } })}
      />,
    );
    expect(screen.getByRole("tab", { name: /^Static/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("signal")).toBeInTheDocument();
    expect(screen.queryByText("column")).not.toBeInTheDocument();
  });

  it("switches the visible cards when a different tab is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Themes
        useThemesHook={() => baseController({ themeTiers: { column: "static" } })}
      />,
    );
    // Starts on Declarative (signal's tier, the fallback for an unlisted id): "column" (static) is
    // grouped elsewhere and not on screen yet.
    expect(screen.queryByText("column")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /^Static/ }));
    expect(screen.getByText("column")).toBeInTheDocument();
    expect(screen.queryByText("signal")).not.toBeInTheDocument();
  });

  it("shows a sensible empty state, not an error, for a tier with zero themes", async () => {
    const user = userEvent.setup();
    render(<Themes useThemesHook={() => baseController()} />);
    await user.click(screen.getByRole("tab", { name: /^Code/ }));
    expect(screen.getByText("No themes in this tier yet.")).toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });
});

// The Marketplace tab was a `disabled` placeholder until the local `__marketplace__` fixture and
// its list/download routes landed. These assertions changed because the BEHAVIOR changed — the tab
// is now selectable and lists real installable themes — not because the old ones were inconvenient.
describe("Marketplace tab", () => {
  it("loads the listing on first open, and only once", async () => {
    const user = userEvent.setup();
    const loadMarketplace = vi.fn(async () => {});
    render(<Themes useThemesHook={() => baseController({ loadMarketplace })} />);

    const marketplaceTab = screen.getByRole("tab", { name: /^Marketplace/ });
    expect(marketplaceTab).not.toBeDisabled();

    await user.click(marketplaceTab);
    expect(marketplaceTab).toHaveAttribute("aria-selected", "true");
    expect(loadMarketplace).toHaveBeenCalledTimes(1);
    // Installed-theme cards are gone; this tab lists what is installable, not what is installed.
    expect(screen.queryByText("signal")).not.toBeInTheDocument();
  });

  it("warns BEFORE download that a colliding id will be renamed, and downloads under the requested id", async () => {
    const user = userEvent.setup();
    const download = vi.fn(async () => {});
    render(
      <Themes
        useThemesHook={() =>
          baseController({
            download,
            marketplace: [
              { id: "basic", name: "Basic", tier: "static", description: "A fixture", idTaken: true },
            ],
          })
        }
      />
    );
    await user.click(screen.getByRole("tab", { name: /^Marketplace/ }));

    // The rename is announced up front. A download that silently lands as `basic-1` after the
    // operator asked for `basic` reads as something having gone wrong.
    expect(screen.getByText(/already have a theme called/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download" }));
    // Called with the MARKETPLACE id — the server assigns the suffixed local id, not this caller.
    expect(download).toHaveBeenCalledWith("basic");
  });

  it("shows no rename warning when the id is free", async () => {
    const user = userEvent.setup();
    render(
      <Themes
        useThemesHook={() =>
          baseController({
            marketplace: [
              { id: "nordic", name: "Nordic", tier: "static", description: "A fixture", idTaken: false },
            ],
          })
        }
      />
    );
    await user.click(screen.getByRole("tab", { name: /^Marketplace/ }));
    expect(screen.queryByText(/already have a theme called/i)).not.toBeInTheDocument();
  });
});

describe("theme card preview", () => {
  it("shows a screenshot image before it errors, falling back to a placeholder on load failure", () => {
    render(<Themes useThemesHook={() => baseController()} />);
    const img = screen.getByText("signal").closest(".theme-card")!.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "/theme-assets/signal/screenshots/index.png");
    fireEvent.error(img);
    const card = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    expect(card.querySelector("img")).not.toBeInTheDocument();
    expect(card.querySelector(".theme-card-preview-placeholder")).toBeInTheDocument();
  });

  it("opens the ImagePreviewModal at the same image when the thumbnail is clicked", async () => {
    const user = userEvent.setup();
    render(<Themes useThemesHook={() => baseController()} />);
    // Every visible card renders its own `ImagePreviewModal` instance — scoped to `card`, not
    // `document`, since a bare `document.querySelector` would grab whichever card happens to be
    // first in the grid instead of the one actually clicked.
    const card = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Expand preview for signal" }));
    const dialog = card.querySelector("dialog.image-preview-modal")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.querySelector("img")).toHaveAttribute("src", "/theme-assets/signal/screenshots/index.png");
  });

  it("closes the modal on the close button, dropping the dialog's open attribute", async () => {
    const user = userEvent.setup();
    render(<Themes useThemesHook={() => baseController()} />);
    const card = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Expand preview for signal" }));
    await user.click(within(card).getByRole("button", { name: "Close preview" }));
    const dialog = card.querySelector("dialog.image-preview-modal")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("gives a failed (placeholder) card no click-to-expand trigger", () => {
    render(<Themes useThemesHook={() => baseController()} />);
    const card = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    fireEvent.error(card.querySelector("img") as HTMLImageElement);
    expect(card.querySelector(".theme-card-preview-trigger")).not.toBeInTheDocument();
  });
});
