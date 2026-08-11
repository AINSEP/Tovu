import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeExplore } from "../ThemeExplore";
import type { ThemeExploreController, ThemeExploreFile } from "../hooks/use-theme-explore.hooks";

/**
 * @file `ThemeExplore` (the Explore screen, `ThemeExplore.tsx`) had no test file at all before this
 * pass (2026-08-11) — the 42 tests that already lived under this directory cover `Themes.tsx` (the
 * theme LIST screen) and `rules.ts`, neither of which this component is. Driven through the
 * `useThemeExploreHook` DI seam, the same convention `Themes.unit.test.tsx` and
 * `PageEditor.unit.test.tsx` use for their own screens.
 *
 * Two things this pass specifically pins down (2026-08-11 owner feedback on the Explore screen):
 * - Partials now preview standalone (`/theme-explore/{theme}/partial/{id}`) instead of showing "no
 *   standalone preview" — a partial is complete, styled markup the moment its CSS loads.
 * - The Preview pane has a Desktop/Tablet/Mobile width control (reusing `PageEditor.tsx`'s own
 *   `PAGE_PREVIEW_WIDTHS`) plus a fullscreen affordance, keyboard-dismissible via Escape.
 */

const FILES: ThemeExploreFile[] = [
  { path: "pages/index.html", label: "index", kind: "page" },
  { path: "pages/about.html", label: "about", kind: "page" },
  { path: "nav.html", label: "nav", kind: "partial" },
  { path: "footer.html", label: "footer", kind: "partial" },
];

function controller(overrides: Partial<ThemeExploreController> = {}): ThemeExploreController {
  return {
    detail: {
      id: "novice",
      name: "Novice",
      tier: "static",
      status: "valid",
      errors: [],
      lineage: null,
      hasOriginal: true,
    },
    files: FILES,
    selected: "pages/index.html",
    select: vi.fn(),
    view: "preview",
    setView: vi.fn(),
    source: "<p>hi</p>",
    setSource: vi.fn(),
    dirty: false,
    saving: false,
    error: null,
    notice: null,
    dismissNotice: vi.fn(),
    save: vi.fn(),
    previewNonce: 0,
    ...overrides,
  };
}

function renderExplore(overrides: Partial<ThemeExploreController> = {}) {
  const ctrl = controller(overrides);
  const useThemeExploreHook = () => ctrl;
  const utils = render(<ThemeExplore themeId="novice" useThemeExploreHook={useThemeExploreHook} />);
  return { ctrl, ...utils };
}

describe("preview src — pages vs. partials", () => {
  it("points a selected PAGE's preview at /theme-explore/{theme}/{pageId}", () => {
    renderExplore({ selected: "pages/about.html" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-explore/novice/about");
    expect(iframe.src).not.toContain("/partial/");
  });

  it("points a selected PARTIAL's preview at /theme-explore/{theme}/partial/{partialId} — regression for 'Partials have no standalone preview'", () => {
    renderExplore({ selected: "nav.html" });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-explore/novice/partial/nav");
    expect(screen.queryByText(/no standalone preview/i)).not.toBeInTheDocument();
  });

  it("carries previewNonce through for a partial the same way it does for a page (cache-busting reload after Save)", () => {
    renderExplore({ selected: "footer.html", previewNonce: 3 });
    const iframe = screen.getByTitle("Theme preview") as HTMLIFrameElement;
    expect(iframe.src).toContain("/theme-explore/novice/partial/footer");
    expect(iframe.src).toContain("v=3");
  });
});

describe("device width control", () => {
  it("shows the Desktop/Tablet/Mobile group in preview view", () => {
    renderExplore({ view: "preview" });
    expect(screen.getByRole("group", { name: /preview width/i })).toBeInTheDocument();
  });

  it("hides the device control in html view", () => {
    renderExplore({ view: "html" });
    expect(screen.queryByRole("group", { name: /preview width/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view preview fullscreen/i })).not.toBeInTheDocument();
  });

  it("defaults to Desktop pressed and shows its pixel width, matching PAGE_PREVIEW_WIDTHS.desktop", () => {
    renderExplore({ view: "preview" });
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1280px")).toBeInTheDocument();
  });

  it("clicking Tablet presses Tablet, un-presses Desktop, and updates the width readout", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: "Tablet" }));
    expect(screen.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("834px")).toBeInTheDocument();
  });

  it("clicking Mobile updates the readout to PAGE_PREVIEW_WIDTHS.mobile", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: "Mobile" }));
    expect(screen.getByText("390px")).toBeInTheDocument();
  });
});

describe("fullscreen preview", () => {
  it("has no open attribute before the trigger is clicked", () => {
    renderExplore({ view: "preview" });
    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("opens the dialog when the fullscreen trigger is clicked", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: /view preview fullscreen/i }));
    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("closes on the dialog's native cancel event (Escape) and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    const trigger = screen.getByRole("button", { name: /view preview fullscreen/i });
    await user.click(trigger);

    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    const cancelEvent = new Event("cancel", { cancelable: true });
    fireEvent(dialog, cancelEvent);

    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(trigger).toHaveFocus();
  });

  it("closes on a click on the dialog's own backdrop area (not a click on its content)", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    await user.click(screen.getByRole("button", { name: /view preview fullscreen/i }));

    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    fireEvent.click(dialog);
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("closes via its own close button and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    renderExplore({ view: "preview" });
    const trigger = screen.getByRole("button", { name: /view preview fullscreen/i });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: /close fullscreen preview/i }));

    const dialog = document.querySelector("dialog.theme-explore-preview-dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(trigger).toHaveFocus();
  });

  it("disables the fullscreen trigger when there is nothing selected to preview", () => {
    renderExplore({ view: "preview", selected: null });
    expect(screen.getByRole("button", { name: /view preview fullscreen/i })).toBeDisabled();
  });
});
