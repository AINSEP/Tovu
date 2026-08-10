import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Placeholder } from "../Placeholder";

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
});
