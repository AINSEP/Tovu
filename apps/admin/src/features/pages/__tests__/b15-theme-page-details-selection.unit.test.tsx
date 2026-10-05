import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { ThemePagesTab } from "../ThemePagesTab";
import type { ThemePageRow } from "../hooks/use-theme-pages.hooks";

function rows(): ThemePageRow[] {
  return [
    { pageId: "pricing", filePath: "render/pages/pricing.html", published: false, resettable: true, collidingContent: null },
    {
      pageId: "terms", filePath: "render/pages/terms.html", published: true, resettable: false,
      collidingContent: { id: "post-47", kind: "post", title: "Legal Terms", slug: "legal-terms" },
    },
  ];
}

function tab(pages: ThemePageRow[]) {
  return <ThemePagesTab pages={pages} activeThemeId="north-star" error={null} savingPageId={null}
    setPagePublished={() => { throw new Error("Unexpected publish action"); }} t={(key) => key} />;
}

it("opens the requested row's details, switches rows, and clears the selection on close", async () => {
  // F1.3/F2.1: replacing the pageId lookup with pages[0] must fail on the second row.
  // Real modal state and clicks run; assertions read each selected row's rendered facts.
  const user = userEvent.setup();
  render(tab(rows()));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: 'Actions for "terms"' }));
  await user.click(screen.getByRole("menuitem", { name: "Details" }));
  const terms = screen.getByRole("dialog", { name: "terms" });
  expect(within(terms).getByText("render/pages/terms.html")).toBeVisible();
  expect(within(terms).getByText("Live")).toBeVisible();
  expect(within(terms).getByText("Added to this theme after it was installed — there is no original to reset to.")).toBeVisible();
  expect(within(terms).getByRole("link", { name: "Open Legal Terms" })).toHaveAttribute("href", "/admin/posts/legal-terms");
  expect(within(terms).queryByText("render/pages/pricing.html")).not.toBeInTheDocument();

  await user.click(within(terms).getByRole("button", { name: "Close" }));
  expect(terms).not.toHaveAttribute("open");
  expect(within(terms).queryByText("render/pages/terms.html")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: 'Actions for "pricing"' }));
  await user.click(screen.getByRole("menuitem", { name: "Details" }));
  const pricing = screen.getByRole("dialog", { name: "pricing" });
  expect(pricing).toBe(terms);
  expect(within(pricing).getByText("render/pages/pricing.html")).toBeVisible();
  expect(within(pricing).getByText("Not live")).toBeVisible();
  expect(within(pricing).queryByRole("link", { name: "Open Legal Terms" })).not.toBeInTheDocument();
  expect(within(pricing).queryByText("render/pages/terms.html")).not.toBeInTheDocument();
});

it("keeps details attached to the selected id during refresh and closes when that row disappears", async () => {
  // F1.3/F6.5: retaining a row object or an array index in state ships stale/wrong facts after refresh.
  // Prop refresh represents the caller's new data; selection stays in the real component.
  const user = userEvent.setup();
  const initial = rows();
  const view = render(tab(initial));
  await user.click(screen.getByRole("button", { name: 'Actions for "terms"' }));
  await user.click(screen.getByRole("menuitem", { name: "Details" }));
  const dialog = screen.getByRole("dialog", { name: "terms" });
  expect(within(dialog).getByText("render/pages/terms.html")).toBeVisible();

  view.rerender(tab([
    { ...initial[1]!, filePath: "render/pages/revised-terms.html", published: false, resettable: true, collidingContent: null },
    initial[0]!,
  ]));
  expect(screen.getByRole("dialog", { name: "terms" })).toBe(dialog);
  expect(within(dialog).getByText("render/pages/revised-terms.html")).toBeVisible();
  expect(within(dialog).getByText("Not live")).toBeVisible();
  expect(within(dialog).queryByText("render/pages/terms.html")).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("link", { name: "Open Legal Terms" })).not.toBeInTheDocument();
  expect(within(dialog).queryByText("Added to this theme after it was installed — there is no original to reset to.")).not.toBeInTheDocument();

  view.rerender(tab([initial[0]!]));
  expect(screen.getByRole("link", { name: "pricing" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(dialog).not.toHaveAttribute("open");
  expect(within(dialog).queryByText("render/pages/revised-terms.html")).not.toBeInTheDocument();
});
