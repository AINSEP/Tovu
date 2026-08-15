import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StaticSiteTab } from "../StaticSiteTab";
import { FullSiteTab } from "../FullSiteTab";
import { HistoryTab } from "../HistoryTab";
import {
  FULL_SITE_PROVIDERS,
  PUBLISH_ASSISTANT_REQUEST,
  PUBLISH_CLI_TOOLS,
  STATIC_HOSTS,
  STATIC_SITE_CAPABILITIES,
} from "../rules";

/**
 * @file `StaticSiteTab`/`FullSiteTab`/`HistoryTab` — the three tabs with no hook and no fetch (see
 * each file's own header for why). `useAdminLocale()`'s real fetch attempt inside these is left
 * unstubbed on purpose: it swallows its own failure to the English default
 * (`use-admin-locale.hooks.ts`'s own doc comment), so nothing here needs a network shim.
 *
 * Updated 2026-08-15 (second UI/UX pass) — the assertions below are the SAME properties this file
 * has always pinned: the exporter is described as real-but-CLI-only, the export's limits are stated,
 * the build action cannot be a live no-op, no credential fields exist, and History fabricates
 * nothing. Only the copy each property is expressed in moved. Where a sentence became a list, the
 * assertion follows it to the list rather than being dropped — losing coverage because the wording
 * changed would be the worst possible outcome of a design pass.
 */

describe("StaticSiteTab", () => {
  it("states the export is a terminal command today, not a claim that no exporter exists", () => {
    // `tovu export <dir>` landed mid-session (`src/cli/commands/export.ts`) — this tab must not
    // ship the earlier, now-false "Tovu has no static exporter" claim. See `StaticSiteTab.tsx`'s
    // own file header for the verification trail.
    render(<StaticSiteTab />);
    expect(screen.getByText("Build it from a terminal")).toBeInTheDocument();
    expect(screen.getByText("tovu export <dir>")).toBeInTheDocument();
    expect(screen.queryByText(/tovu has no static exporter/i)).not.toBeInTheDocument();
  });

  it("offers the command as something copyable, not as prose to transcribe", () => {
    // The command is the one thing on this tab a reader has to get exactly right, so it has to be
    // an element of its own with a copy affordance — not a fragment of a sentence, which is what it
    // was before this pass.
    render(<StaticSiteTab />);
    const command = screen.getByText("tovu export <dir>");
    expect(command.tagName).toBe("CODE");
    expect(screen.getByRole("button", { name: "Copy the export command" })).toBeInTheDocument();
  });

  it("names the four things a static export gives up", () => {
    // Previously one sentence ("No checkout, no admin online, no assistant, no dynamic anything.");
    // now the itemized `STATIC_SITE_CAPABILITIES` list, which states the same four facts plus what
    // DOES survive. Driven off the table so a row added there without a label here fails.
    render(<StaticSiteTab />);
    for (const capability of STATIC_SITE_CAPABILITIES) {
      expect(screen.getByText(capability.labelKey)).toBeInTheDocument();
    }
    // The unsupported rows must be marked as such, not merely listed — a list of four labels with
    // no supported/unsupported distinction would pass a naive text check while saying the opposite.
    const unsupported = STATIC_SITE_CAPABILITIES.filter((row) => !row.supported);
    expect(unsupported).toHaveLength(3);
    expect(screen.getAllByTitle("Not supported")).toHaveLength(unsupported.length);
  });

  it("lists all four static hosts from rules.ts", () => {
    render(<StaticSiteTab />);
    for (const host of STATIC_HOSTS) expect(screen.getByText(host)).toBeInTheDocument();
  });

  it("renders the build action inert, with an honest reason — never a live no-op button", () => {
    // Still inert even though the exporter itself now exists: there is no admin-reachable HTTP
    // route to trigger it from, only the CLI (`grep -rln "runExportCommand|exportSite\b"
    // src/server/routes` returns nothing) — an enabled button here would still do nothing.
    //
    // `aria-disabled` rather than `disabled` since this pass, so the control stays reachable and
    // its reason announceable; "inert" is therefore asserted as "says it is disabled AND has no
    // click handler wired", which is the property that actually matters.
    render(<StaticSiteTab />);
    const button = screen.getByRole("button", { name: "Build static export" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    const reason = screen.getByText(
      "Not available from this screen yet — no admin route can start an export. Run the command above instead.",
    );
    expect(reason).toBeInTheDocument();
    // The reason is not merely nearby — it is programmatically tied to the control, which is the
    // whole point of preferring `aria-disabled` over `disabled` here.
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
  });

  it("recommends asking the assistant to install the two CLIs, as a copyable request", () => {
    render(<StaticSiteTab />);
    expect(screen.getByText("Getting it online")).toBeInTheDocument();
    expect(screen.getByText("Recommended — ask the assistant")).toBeInTheDocument();
    // Verbatim from `rules.ts` — people paste this into the assistant, so the string the UI shows
    // and the string the constant defines must not drift apart.
    expect(screen.getByText(PUBLISH_ASSISTANT_REQUEST)).toBeInTheDocument();
    for (const tool of PUBLISH_CLI_TOOLS) {
      expect(screen.getByText(tool.name)).toBeInTheDocument();
      expect(screen.getByText(tool.command)).toBeInTheDocument();
    }
  });

  it("keeps the two Copy buttons distinguishable, since the tab now hands over two different things", () => {
    // Two controls whose only accessible name is "Copy" are ambiguous to anyone listing the page's
    // buttons. Each visible label is still "Copy", which is a substring of both names below —
    // that's what keeps it a valid Label in Name (WCAG 2.5.3).
    render(<StaticSiteTab />);
    expect(screen.getByRole("button", { name: "Copy the export command" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy this request to the assistant" })).toBeInTheDocument();
  });

  it("claims NO installed/not-installed state for either CLI — there is no PATH detection yet", () => {
    // The load-bearing honesty test for this section. As of 2026-08-15 the server cannot see its
    // own PATH, so any per-tool badge would be reporting a check that never ran, and a greyed-out
    // one would read as "not installed" rather than "not known".
    //
    // Asserted STRUCTURALLY rather than by copy: the two things on this screen that carry
    // per-item state are `.status` pills (Full Site's provider rows) and `.deployment-caps-mark`
    // ✓/✗ glyphs (the capability lists). Either one appearing inside the route block would read as
    // a detection result. A copy-based assertion would miss a badge whose wording nobody thought
    // to grep for; this catches any of them.
    const { container } = render(<StaticSiteTab />);
    const route = container.querySelector(".deployment-route");
    expect(route).not.toBeNull();
    expect(route?.querySelectorAll(".status")).toHaveLength(0);
    expect(route?.querySelectorAll(".deployment-caps-mark")).toHaveLength(0);
    // The gap is stated in words instead.
    expect(
      screen.getByText(
        "Tovu can't see what's installed on the server yet, so this is a recommendation rather than a check — the assistant can tell you which ones it found.",
      ),
    ).toBeInTheDocument();
  });

  it("presents the token fallback as planned, so the recommendation cannot read as a prerequisite wall", () => {
    render(<StaticSiteTab />);
    expect(
      screen.getByText(
        "If those tools can't be installed, a token-based fallback is planned — this route is a shortcut, not a requirement.",
      ),
    ).toBeInTheDocument();
  });
});

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
});
