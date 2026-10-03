import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { AccessTokensIcon, ConnectedMarkIcon, DisclosureChevronIcon, SearchIcon, SiteTokenIcon } from "../security-visuals";

it.each([
  [AccessTokensIcon, 16], [SiteTokenIcon, 16], [SearchIcon, 16], [ConnectedMarkIcon, 12], [DisclosureChevronIcon, 14],
] as const)("keeps %s decorative and respects default and explicit dimensions", (Icon, defaultSize) => {
  // Author Checklist F6.1/F4.3: SVG attributes are the contract, no claim of browser layout.
  // Reject: drop aria-hidden, hardcode dimensions or replace the small default with 16.
  const { container, rerender } = render(<Icon />);
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  expect(svg).toHaveAttribute("width", String(defaultSize));
  expect(svg).toHaveAttribute("height", String(defaultSize));
  rerender(<Icon size={27} />);
  expect(svg).toHaveAttribute("width", "27");
  expect(svg).toHaveAttribute("height", "27");
  expect(svg).toHaveAttribute("aria-hidden", "true");
});
