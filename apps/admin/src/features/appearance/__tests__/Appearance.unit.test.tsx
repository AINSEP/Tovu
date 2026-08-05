import { render, screen } from "@testing-library/react";
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
    expect(activeCard.querySelector("button")).not.toBeInTheDocument();
  });

  it("gives every inactive theme an Activate button that calls activate(themeId)", async () => {
    const user = userEvent.setup();
    const activate = vi.fn(async () => {});
    render(<Appearance useAppearanceHook={() => baseController({ activate })} />);

    const columnCard = screen.getByText("column").closest(".theme-card") as HTMLElement;
    await user.click(columnCard.querySelector("button") as HTMLElement);
    expect(activate).toHaveBeenCalledWith("column");
  });

  it("disables every Activate button while any one theme is busy, and shows Activating… on that one", () => {
    render(<Appearance useAppearanceHook={() => baseController({ busyTheme: "column" })} />);
    const columnButton = screen.getByRole("button", { name: "Activating…" });
    const officialButton = screen.getByText("tovu-official").closest(".theme-card")!.querySelector("button")!;
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
});

describe("View site link", () => {
  it("links out to the public site root", () => {
    render(<Appearance useAppearanceHook={() => baseController()} />);
    const link = screen.getByRole("link", { name: /view site/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });
});
