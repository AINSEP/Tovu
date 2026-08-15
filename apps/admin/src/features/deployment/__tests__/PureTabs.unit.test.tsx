import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StaticSiteTab } from "../StaticSiteTab";
import { FullSiteTab } from "../FullSiteTab";
import { HistoryTab } from "../HistoryTab";
import { FULL_SITE_PROVIDERS, STATIC_HOSTS } from "../rules";

/**
 * @file `StaticSiteTab`/`FullSiteTab`/`HistoryTab` — the three tabs with no hook and no fetch (see
 * each file's own header for why). `useAdminLocale()`'s real fetch attempt inside these is left
 * unstubbed on purpose: it swallows its own failure to the English default
 * (`use-admin-locale.hooks.ts`'s own doc comment), so nothing here needs a network shim.
 */

describe("StaticSiteTab", () => {
  it("states plainly that the exporter does not exist, rather than implying one does", () => {
    render(<StaticSiteTab />);
    expect(screen.getByText("Not built yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tovu has no static exporter, and the sitemap alone can't drive one — it only lists published posts, not the home page, products, theme pages, redirects, the 404 page, or assets.",
      ),
    ).toBeInTheDocument();
  });

  it("names the four things a static export gives up", () => {
    render(<StaticSiteTab />);
    expect(screen.getByText("No checkout, no admin online, no assistant, no dynamic anything.")).toBeInTheDocument();
  });

  it("lists all four static hosts from rules.ts", () => {
    render(<StaticSiteTab />);
    for (const host of STATIC_HOSTS) expect(screen.getByText(host)).toBeInTheDocument();
  });

  it("renders the build action disabled, with an honest reason — never a live no-op button", () => {
    render(<StaticSiteTab />);
    const button = screen.getByRole("button", { name: "Build static export" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Not available yet — see above.")).toBeInTheDocument();
  });
});

describe("FullSiteTab", () => {
  it("lists all six providers from rules.ts, each honestly marked Planned", () => {
    render(<FullSiteTab />);
    for (const provider of FULL_SITE_PROVIDERS) expect(screen.getByText(provider.name)).toBeInTheDocument();
    expect(screen.getAllByText("Planned")).toHaveLength(FULL_SITE_PROVIDERS.length);
  });

  it("states there are no credential fields yet, rather than rendering fields that write nowhere", () => {
    render(<FullSiteTab />);
    expect(
      screen.getByText("No credential fields yet — this instance has no backend to store them."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("HistoryTab", () => {
  it("renders a real empty state — no fabricated build/deploy rows", () => {
    render(<HistoryTab />);
    expect(screen.getByText("No deploys yet")).toBeInTheDocument();
    expect(
      screen.getByText("Builds and deploys will show up here once a real host is wired up."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
