import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { ConnectedMarkIcon, DisclosureChevronIcon, SourceControlIcon } from "../source-control-visuals";

// Author Checklist / F2.3/F4.1: real glyph rendering, literal accessibility/sizing
// contract, no assertions about browser layout. Mutation: drop aria-hidden or size forwarding.
it.each([
  ["source connection", SourceControlIcon, "20"],
  ["connected marker", ConnectedMarkIcon, "12"],
  ["disclosure", DisclosureChevronIcon, "14"],
] as const)("keeps the %s glyph decorative and honors an explicit size", (_name, Icon, defaultSize) => {
  const { container, rerender } = render(<Icon />);
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("width", defaultSize);
  expect(svg).toHaveAttribute("height", defaultSize);
  expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  rerender(<Icon size={31} />);
  expect(svg).toHaveAttribute("width", "31");
  expect(svg).toHaveAttribute("height", "31");
  expect(svg).toHaveAttribute("aria-hidden", "true");
});
