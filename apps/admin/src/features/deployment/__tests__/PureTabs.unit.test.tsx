import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HistoryTab } from "../HistoryTab";

/**
 * @file `HistoryTab` — the tab left with no hook and no fetch (see its file's
 * own header for why). `useAdminLocale()`'s real fetch attempt inside these is left unstubbed on
 * purpose: it swallows its own failure to the English default (`use-admin-locale.hooks.ts`'s own
 * doc comment), so nothing here needs a network shim.
 *
 * `StaticSiteTab` moved OUT of this file 2026-08-15: it gained three injected hooks (a real build
 * action, a real publish flow, live CLI detection) and is no longer pure, so it no longer belongs
 * next to a component that renders the exact same markup every time. Its own coverage now lives
 * in `StaticSiteTab.unit.test.tsx`, driven through its `useStaticExportHook`/`useStaticPublishHook`/
 * `useDeploymentOverviewHook` DI seams — same convention `DockerfileTab.unit.test.tsx` established
 * for the first tab in this panel to make that same jump.
 */

// Full Site assertions retired with that tab (2026-10-03).

describe("HistoryTab", () => {
  it("renders a real empty state — no fabricated build/deploy rows", () => {
    render(<HistoryTab />);
    expect(screen.getByText("No deploys yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nothing has been deployed from this screen — and nothing can be yet. Once a host is wired up, every build and deploy will be listed here with its outcome.",
      ),
    ).toBeInTheDocument();
    // Still the load-bearing assertion: no table, and now also no placeholder rows of any kind.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("tags the empty-state region and its publish link for the AI assistant", () => {
    render(<HistoryTab />);
    expect(document.querySelector('[data-agent-element="deployment-history-empty"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-history-publish-link"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See how to publish today" })).toHaveAttribute("data-agent-element", "deployment-history-publish-link");
  });
});
