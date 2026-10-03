import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CapabilityList, CapabilityMark, DisclosureChevron, FullSiteIcon, HistoryIcon,
  LayersIcon, OverviewIcon, StaticSiteIcon, StepDoneIcon,
} from "../deployment-visuals";

const translations: Record<string, string> = {
  Supported: "Compatible", "Not supported": "No compatible",
  Checkout: "Pago", Pages: "Páginas",
};
function t(key: string): string {
  if (!(key in translations)) throw new Error(`Unexpected translation key: ${key}`);
  return translations[key];
}

// F1.3/F1.6: inverting flags or pairing status with another row must fail.
it("associates each translated capability label with its own accessible support status", () => {
  const { rerender } = render(<CapabilityList rows={[
    { id: "checkout", labelKey: "Checkout", supported: false },
    { id: "pages", labelKey: "Pages", supported: true },
  ]} t={t} />);
  const checkout = screen.getByText("Pago").closest("li")!;
  const pages = screen.getByText("Páginas").closest("li")!;
  expect(checkout).toBeInTheDocument();
  expect(pages).toBeInTheDocument();
  expect(within(checkout).getByRole("img", { name: "No compatible" })).not.toHaveAttribute("aria-hidden");
  expect(within(pages).getByRole("img", { name: "Compatible" })).not.toHaveAttribute("aria-hidden");
  expect(checkout).toHaveClass("is-off");
  expect(pages).not.toHaveClass("is-off");
  rerender(<CapabilityList rows={[]} t={t} />);
  expect(screen.getByRole("list")).toBeEmptyDOMElement();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

// F2.4: the real CapabilityList/CapabilityMark composition is covered above. Pin the marks'
// different shapes as the non-color status signal; do not claim a browser layout measurement.
it("changes both the accessible name and glyph when support changes", () => {
  const { rerender } = render(<CapabilityMark supported t={t} />);
  const yes = screen.getByRole("img", { name: "Compatible" });
  expect(yes.querySelector("path")).toHaveAttribute("d", "m5 13 4.5 4.5L19 6.5");
  rerender(<CapabilityMark supported={false} t={t} />);
  const no = screen.getByRole("img", { name: "No compatible" });
  expect(no.querySelector("path")).toHaveAttribute("d", "M6 6l12 12M18 6L6 18");
});

// F4.3/F1.5: exact attributes protect default/override sizes and hidden semantics. These
// decorative, non-interactive icons have no UI state or user actions to test.
describe.each([
  { name: "Overview", Icon: OverviewIcon, size: 20 },
  { name: "Static site", Icon: StaticSiteIcon, size: 20 },
  { name: "Full site", Icon: FullSiteIcon, size: 20 },
  { name: "History", Icon: HistoryIcon, size: 20 },
  { name: "Layers", Icon: LayersIcon, size: 20 },
  { name: "Done", Icon: StepDoneIcon, size: 12 },
  { name: "Disclosure", Icon: DisclosureChevron, size: 14 },
])("$name decorative icon", ({ Icon, size }) => {
  it("renders its default size and respects an explicit size without adding screen-reader noise", () => {
    const { container, rerender } = render(<Icon />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", String(size));
    expect(svg).toHaveAttribute("height", String(size));
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    rerender(<Icon size={33} />);
    expect(svg).toHaveAttribute("width", "33");
    expect(svg).toHaveAttribute("height", "33");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
