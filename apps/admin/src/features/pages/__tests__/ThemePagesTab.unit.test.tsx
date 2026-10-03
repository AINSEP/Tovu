import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ThemePagesTab } from "../ThemePagesTab";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";

const candidate: ThemePageRow = { pageId: "pricing", filePath: "render/pages/pricing.html", published: true, resettable: true, collidingContent: null };
function props() {
  return { pages: [candidate], activeThemeId: "north-star", error: null, savingPageId: null, setPagePublished: vi.fn(), t: (key: string) => key };
}

it("shows an initial error instead of loading, then keeps loaded rows visible with a later error", () => {
  // F6.2 regression target: return an error-only view even after pages have loaded, or hide the error banner.
  const p = props();
  const view = render(<ThemePagesTab {...p} pages={null} error="Theme unavailable" />);
  expect(screen.getByText("Theme unavailable")).toBeInTheDocument();
  expect(screen.queryByText("Loading theme pages…")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  view.rerender(<ThemePagesTab {...p} error="Publishing failed" />);
  expect(screen.getByText("Publishing failed")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "pricing" })).toHaveAttribute("href", "/admin/themes/explore?theme=north-star&page=pricing");
  expect(screen.getByRole("switch", { name: "Publish pricing" })).toHaveAttribute("aria-checked", "true");
});

it("assigns lock and saving state to the owning row and dispatches the correct publish boolean", async () => {
  // F1.3/F2.5 regression target: disable all rows during one save, or always dispatch true.
  const user = userEvent.setup();
  const p = props();
  const rows: ThemePageRow[] = [
    candidate, { ...candidate, pageId: "index", published: null },
    { ...candidate, pageId: "about", published: false }, { ...candidate, pageId: "terms", published: false },
  ];
  render(<ThemePagesTab {...p} pages={rows} savingPageId="terms" />);
  const row = (name: string) => screen.getByRole("link", { name }).closest("tr")!;
  const toggle = (name: string) => within(row(name)).getByRole("switch", { name: `Publish ${name}` });
  expect(toggle("index")).toBeDisabled();
  expect(toggle("index")).toHaveAttribute("aria-checked", "true");
  expect(row("index").querySelector(".theme-page-lock-glyph")).toHaveAttribute("aria-hidden", "true");
  expect(row("pricing").querySelector(".theme-page-lock-glyph")).toBeNull();
  expect(row("about").querySelector(".theme-page-lock-glyph")).toBeNull();
  expect(toggle("terms")).toBeDisabled();
  expect(toggle("pricing")).toBeEnabled();
  expect(toggle("about")).toBeEnabled();
  await user.click(toggle("terms"));
  await user.click(toggle("index"));
  expect(p.setPagePublished).not.toHaveBeenCalled();
  await user.click(toggle("pricing"));
  await user.click(toggle("about"));
  expect(p.setPagePublished.mock.calls).toEqual([["pricing", false], ["about", true]]);
});
