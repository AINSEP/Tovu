import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { GaugeIcon, PulseIcon } from "../observability-visuals";

it.each([["pulse", PulseIcon], ["gauge", GaugeIcon]] as const)("%s emits decorative SVG with default and requested dimensions", (_name, Icon) => {
  // F4.3 regression target: hardcode width/height to 16, or drop aria-hidden. This checks emitted markup, not layout (F1.5).
  const view = render(<Icon />);
  const svg = view.container.querySelector("svg")!;
  expect(svg).toHaveAttribute("width", "16");
  expect(svg).toHaveAttribute("height", "16");
  expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  view.rerender(<Icon size={31} />);
  expect(svg).toHaveAttribute("width", "31");
  expect(svg).toHaveAttribute("height", "31");
});
