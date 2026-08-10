import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Appearance } from "../Appearance";
import type { AppearanceController } from "../hooks/use-appearance.hooks";
import type { PresentationSettings } from "../../../lib/api";

/**
 * @file `Appearance` (Themes screen) — driven through the `useAppearanceHook` dependency-injection
 * seam. `features/appearance` was 3.6% covered with no dedicated test file before this pass.
 */

const SETTINGS: PresentationSettings = {
  workspaceId: "w1",
  activeThemeId: "signal",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

function baseController(overrides: Partial<AppearanceController> = {}): AppearanceController {
  return {
    settings: SETTINGS,
    themes: ["tovu-official", "column", "signal"],
    error: null,
    busyTheme: null,
    activate: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("loading and error states", () => {
  it("shows a loading placeholder before settings have loaded", () => {
    render(<Appearance useAppearanceHook={() => baseController({ settings: null, themes: [] })} />);
    expect(screen.getByText("Loading themes…")).toBeInTheDocument();
  });

  it("shows the error message instead of the grid when the initial load failed (no settings yet)", () => {
    render(
      <Appearance
        useAppearanceHook={() => baseController({ settings: null, themes: [], error: "failed to load themes" })}
      />,
    );
    expect(screen.getByText("failed to load themes")).toBeInTheDocument();
    expect(screen.queryByText("Themes")).not.toBeInTheDocument();
  });

  it("shows a non-fatal error banner alongside the grid once settings have already loaded", () => {
    render(<Appearance useAppearanceHook={() => baseController({ error: "failed to switch theme" })} />);
    expect(screen.getByText("failed to switch theme")).toBeInTheDocument();
    expect(screen.getByText("Themes")).toBeInTheDocument();
  });
});

describe("theme grid", () => {
  it("marks the active theme with the Active tag, not an Activate button", () => {
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const activeCard = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    expect(activeCard).toHaveClass("active");
    expect(activeCard.querySelector(".theme-active-tag")).toHaveTextContent("Active");
    // Scoped past the card's own preview-expand trigger button (unrelated to Activate/Active).
    expect(within(activeCard).queryByRole("button", { name: /^Activate/ })).not.toBeInTheDocument();
  });

  it("gives every inactive theme an Activate button that calls activate(themeId)", async () => {
    const user = userEvent.setup();
    const activate = vi.fn(async () => {});
    render(<Appearance useAppearanceHook={() => baseController({ activate })} />);

    const columnCard = screen.getByText("column").closest(".theme-card") as HTMLElement;
    await user.click(within(columnCard).getByRole("button", { name: "Activate" }));
    expect(activate).toHaveBeenCalledWith("column");
  });

  it("disables every Activate button while any one theme is busy, and shows Activating… on that one", () => {
    render(<Appearance useAppearanceHook={() => baseController({ busyTheme: "column" })} />);
    const columnButton = screen.getByRole("button", { name: "Activating…" });
    const officialCard = screen.getByText("tovu-official").closest(".theme-card") as HTMLElement;
    const officialButton = within(officialCard).getByRole("button", { name: "Activate" });
    expect(columnButton).toBeDisabled();
    expect(officialButton).toBeDisabled();
    expect(officialButton).toHaveTextContent("Activate");
  });

  it("renders a card for every theme, using known blurb copy where available and blank otherwise", () => {
    render(<Appearance useAppearanceHook={() => baseController({ themes: ["signal", "some-unknown-theme"] })} />);
    expect(screen.getByText(/bright product-blog/i)).toBeInTheDocument();
    const unknownCard = screen.getByText("some-unknown-theme").closest(".theme-card") as HTMLElement;
    expect(unknownCard.querySelector("p")).toHaveTextContent("");
  });

  it("styles Activate with the admin's primary-action class, not the muted theme-card default (owner feedback: match PostEditor's Save button)", () => {
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const columnCard = screen.getByText("column").closest(".theme-card") as HTMLElement;
    expect(within(columnCard).getByRole("button", { name: "Activate" })).toHaveClass("btn-primary");
  });
});

describe("View site link", () => {
  it("links out to the public site root", () => {
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const link = screen.getByRole("link", { name: /view site/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});

describe("tier tabs", () => {
  it("renders four tab-group tabs (not five raw tiers) plus a disabled Marketplace placeholder, each carrying its theme count", () => {
    render(
      <Appearance
        useAppearanceHook={() =>
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
      "Marketplace (soon)",
    ]);
  });

  it("folds a handlebars-tier theme into the same Templated tab a templated-tier theme uses — owner feedback: 5 raw tiers, 4 conceptual tabs", () => {
    render(
      <Appearance
        useAppearanceHook={() => baseController({ themeTiers: { "tovu-official": "handlebars" } })}
      />,
    );
    expect(screen.getByRole("tab", { name: "Templated1" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /^Handlebars/ })).not.toBeInTheDocument();
  });

  it("opens on the tab matching the active theme's tier, not always the first tier", () => {
    // SETTINGS.activeThemeId is "signal" — putting it in the static tier should open Static, not
    // Declarative (the first tier in tab order).
    render(
      <Appearance
        useAppearanceHook={() => baseController({ themeTiers: { signal: "static" } })}
      />,
    );
    expect(screen.getByRole("tab", { name: /^Static/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("signal")).toBeInTheDocument();
    expect(screen.queryByText("column")).not.toBeInTheDocument();
  });

  it("switches the visible cards when a different tab is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Appearance
        useAppearanceHook={() => baseController({ themeTiers: { column: "static" } })}
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
    render(<Appearance useAppearanceHook={() => baseController()} />);
    await user.click(screen.getByRole("tab", { name: /^Code/ }));
    expect(screen.getByText("No themes in this tier yet.")).toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });
});

describe("Marketplace placeholder tab", () => {
  it("renders disabled — no active-tab switch, no visible-cards change on click", async () => {
    const user = userEvent.setup();
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const marketplaceTab = screen.getByRole("tab", { name: "Marketplace (soon)" });
    expect(marketplaceTab).toBeDisabled();
    expect(marketplaceTab).toHaveAttribute("aria-disabled", "true");
    expect(marketplaceTab).toHaveAttribute("aria-selected", "false");
    await user.click(marketplaceTab);
    // Still on the default (Declarative) tab — the click never fired onChange.
    expect(screen.getByRole("tab", { name: /^Declarative/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("signal")).toBeInTheDocument();
  });
});

describe("theme card preview", () => {
  it("shows a screenshot image before it errors, falling back to a placeholder on load failure", () => {
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const img = screen.getByText("signal").closest(".theme-card")!.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "/theme-assets/signal/screenshots/index.png");
    fireEvent.error(img);
    const card = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    expect(card.querySelector("img")).not.toBeInTheDocument();
    expect(card.querySelector(".theme-card-preview-placeholder")).toBeInTheDocument();
  });

  it("opens the ImagePreviewModal at the same image when the thumbnail is clicked", async () => {
    const user = userEvent.setup();
    render(<Appearance useAppearanceHook={() => baseController()} />);
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
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const card = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Expand preview for signal" }));
    await user.click(within(card).getByRole("button", { name: "Close preview" }));
    const dialog = card.querySelector("dialog.image-preview-modal")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("gives a failed (placeholder) card no click-to-expand trigger", () => {
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const card = screen.getByText("signal").closest(".theme-card") as HTMLElement;
    fireEvent.error(card.querySelector("img") as HTMLImageElement);
    expect(card.querySelector(".theme-card-preview-trigger")).not.toBeInTheDocument();
  });
});
