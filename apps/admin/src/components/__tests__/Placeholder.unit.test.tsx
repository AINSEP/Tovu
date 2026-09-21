import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// `Placeholder`'s "Unknown section" branch reads `useWiredAdminLocale()` directly (deliberately
// not hook-injected — see that call site's own comment in `Placeholder.tsx`), so the one test below
// that needs an unsupported locale mocks this module. Every other test in this file leaves the
// mock at its default ("en", the real hook's own jsdom-unmocked fallback) so none of them observe
// any difference from the previously-unmocked real hook.
const mockUseWiredAdminLocale = vi.hoisted(() => vi.fn(() => "en"));
vi.mock("../../hooks/use-admin-locale.hooks", () => ({
  useWiredAdminLocale: mockUseWiredAdminLocale,
}));

import { ComingSoonNotice, findNavGroupLabel, Placeholder } from "../Placeholder";

afterEach(() => {
  mockUseWiredAdminLocale.mockReturnValue("en");
});

/**
 * @file `Placeholder` — pins the fix for the audit's live-verified Newsletter bug
 * (`ADS-memory/reports/audits/20260801-admin-adversarial-ux-audit.md`, exec summary #3): a
 * `soon: true` `nav.ts` item must render an honest "coming soon" notice, never the "Unknown
 * section" error banner that previously came from a second, stale registry (a shared,
 * framework-agnostic admin-shell package, since removed as dead code) missing the id. A genuinely
 * bogus id (present in neither registry) must still show the error — this is not a "never show an
 * error" fix, only a "a real, known-but-unbuilt section is not an error" fix.
 */

describe("a soon: true nav.ts item", () => {
  it("renders its own label and a coming-soon notice, not an error banner", () => {
    // "newsletter" is `soon: true` in nav.ts and was never added to the legacy admin-shell
    // registry (since deleted) — the exact reproduction of the live bug.
    render(<Placeholder sectionId="newsletter" />);

    expect(screen.getByRole("heading", { name: "Newsletter" })).toBeInTheDocument();
    expect(screen.getByText("Newsletter is coming soon.")).toBeInTheDocument();
    expect(screen.queryByText(/unknown section/i)).not.toBeInTheDocument();
  });
});

describe("an optional disambiguation note (2026-08-10, admin-appearance)", () => {
  it("renders the note as a second line when provided", () => {
    render(<Placeholder sectionId="newsletter" note="This is a disambiguation note." />);
    expect(screen.getByText("Newsletter is coming soon.")).toBeInTheDocument();
    expect(screen.getByText("This is a disambiguation note.")).toBeInTheDocument();
  });

  it("renders nothing extra when omitted — every other soon caller stays unchanged", () => {
    render(<Placeholder sectionId="newsletter" />);
    expect(screen.getByText("Newsletter is coming soon.")).toBeInTheDocument();
    // Only the one page-description paragraph — no empty second <p>.
    expect(document.querySelectorAll(".page-description")).toHaveLength(1);
  });
});

describe("an id absent from nav.ts entirely", () => {
  it("renders the Unknown section error, matching the legacy /section/:id fallback's expectations", () => {
    render(<Placeholder sectionId="does-not-exist-12345" />);

    expect(screen.getByText("Unknown section: does-not-exist-12345")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("a prototype-chain key is not mistaken for a real section", () => {
    render(<Placeholder sectionId="constructor" />);
    expect(screen.getByText(/unknown section/i)).toBeInTheDocument();
  });

  it("falls back to the English prefix when the admin locale has no UNKNOWN_SECTION_PREFIX entry", () => {
    mockUseWiredAdminLocale.mockReturnValue("xx-unsupported");

    render(<Placeholder sectionId="does-not-exist-12345" />);

    expect(screen.getByText("Unknown section: does-not-exist-12345")).toBeInTheDocument();
  });
});

describe("findNavGroupLabel", () => {
  it("returns the item's own nav group label", () => {
    // "newsletter" sits in the "Marketing" group (panels.tsx) — the ordinary, matching-group case.
    expect(findNavGroupLabel("newsletter")).toBe("Marketing");
  });

  it("falls back to 'Overview' for an id in the ungrouped top row, whose nav group carries no label", () => {
    // "dashboard" is one of `panels.tsx`'s "Ungrouped top row" entries — `buildNav` (Jini's
    // `@jini-ai/admin/core`) deliberately omits `label` for that group, so this exercises the
    // `group.label ?? "Overview"` fallback with REAL nav data, not a synthetic gap.
    expect(findNavGroupLabel("dashboard")).toBe("Overview");
  });

  it("falls back to 'Overview' for an id present in no nav group at all", () => {
    // Exercises the loop-exhausted fallback directly against this exported pure function's own
    // contract. `findNavGroupLabel`'s one real caller (`Placeholder`; the other, `PlaceholderTabs`,
    // was deleted 2026-09-21 as dead code) only ever passes an id already confirmed to exist via
    // `getNav()`, so this path is not reachable through it today — but the function itself is
    // general-purpose and exported, and its own "no match found" behavior is part of what it
    // promises callers.
    expect(findNavGroupLabel("no-such-section-anywhere")).toBe("Overview");
  });
});

describe("ComingSoonNotice", () => {
  it("falls back to the English template when locale has no COMING_SOON_TEMPLATE entry", () => {
    render(<ComingSoonNotice kicker="Overview" label="Widgets" locale="xx-unsupported" />);

    expect(screen.getByText("Widgets is coming soon.")).toBeInTheDocument();
  });
});
