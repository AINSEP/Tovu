import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FullSiteTab } from "../FullSiteTab";
import { HistoryTab } from "../HistoryTab";
import { FULL_SITE_PROVIDERS } from "../rules";

/**
 * @file `FullSiteTab`/`HistoryTab` — the two tabs left with no hook and no fetch (see each file's
 * own header for why). `useAdminLocale()`'s real fetch attempt inside these is left unstubbed on
 * purpose: it swallows its own failure to the English default (`use-admin-locale.hooks.ts`'s own
 * doc comment), so nothing here needs a network shim.
 *
 * `StaticSiteTab` moved OUT of this file 2026-08-15: it gained three injected hooks (a real build
 * action, a real publish flow, live CLI detection) and is no longer pure, so it no longer belongs
 * next to two components that render the exact same markup every time. Its own coverage now lives
 * in `StaticSiteTab.unit.test.tsx`, driven through its `useStaticExportHook`/`useStaticPublishHook`/
 * `useDeploymentOverviewHook` DI seams — same convention `DockerfileTab.unit.test.tsx` established
 * for the first tab in this panel to make that same jump.
 */

describe("FullSiteTab", () => {
  it("lists all six providers from rules.ts, each honestly marked Planned", () => {
    render(<FullSiteTab />);
    for (const provider of FULL_SITE_PROVIDERS) expect(screen.getByText(provider.name)).toBeInTheDocument();
    expect(screen.getAllByText("Planned")).toHaveLength(FULL_SITE_PROVIDERS.length);
  });

  it("shows each provider's cost, so six otherwise-identical rows are told apart by a real value", () => {
    render(<FullSiteTab />);
    for (const provider of FULL_SITE_PROVIDERS) expect(screen.getByText(provider.costKey)).toBeInTheDocument();
  });

  it("states there are no credential fields yet, rather than rendering fields that write nowhere", () => {
    render(<FullSiteTab />);
    expect(
      screen.getByText(
        "No credential fields yet — this instance has no backend to store them, so nothing here can be connected from this screen.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("tags the overview card, its Dockerfile link, and the providers card for the AI assistant", () => {
    // `data-agent-element` querying convention `PostEditor.unit.test.tsx` uses. Guards against a
    // handle silently rotting (renamed, removed, or a typo) with nothing catching it.
    render(<FullSiteTab />);
    expect(document.querySelector('[data-agent-element="deployment-full-site-overview"]')).toBeInTheDocument();
    expect(
      document.querySelector('[data-agent-element="deployment-full-site-dockerfile-link"]'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-full-site-providers"]')).toBeInTheDocument();
  });
});

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
  });
});
