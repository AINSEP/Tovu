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
  it("states the export is a terminal command today, not a claim that no exporter exists", () => {
    // `tovu export <dir>` landed mid-session (`src/cli/commands/export.ts`) — this tab must not
    // ship the earlier, now-false "Tovu has no static exporter" claim. See `StaticSiteTab.tsx`'s
    // own file header for the verification trail.
    render(<StaticSiteTab />);
    expect(screen.getByText("Build it from a terminal")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Run tovu export <dir> and Tovu writes a static copy of this site — every post, the home page, products, and theme pages — to a folder.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/tovu has no static exporter/i)).not.toBeInTheDocument();
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
    // Still disabled even though the exporter itself now exists: there is no admin-reachable HTTP
    // route to trigger it from, only the CLI (`grep -rln "runExportCommand|exportSite\b"
    // src/server/routes` returns nothing) — an enabled button here would still do nothing.
    render(<StaticSiteTab />);
    const button = screen.getByRole("button", { name: "Build static export" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Not available from this screen yet — run tovu export from a terminal.")).toBeInTheDocument();
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
