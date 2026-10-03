import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { AllSitesIcon, NewSiteIcon, SiteFlagIcon } from "../sites-visuals";

// Author Checklist / F2.3/F4.1: real components; DOM accessibility/sizing contract,
// not a claim about pixel layout. Mutation: drop aria-hidden or ignore the size prop.
it.each([
  ["all sites", AllSitesIcon, "16"],
  ["new site", NewSiteIcon, "16"],
  ["registration warning", SiteFlagIcon, "14"],
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
