import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MigrateForwardIcon, TimelineIcon } from "../database-visuals";

// F4.3: hardcoding 16 instead of forwarding size must fail. These are SVG attribute and
// accessibility contracts, not claims about layout in jsdom (F1.5). No interactions exist.
describe.each([TimelineIcon, MigrateForwardIcon])("database decorative icon: %s", (Icon) => {
  it("renders a hidden 16px icon by default and forwards a non-default size to both dimensions", () => {
    const { container, rerender } = render(<Icon />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "16");
    expect(svg).toHaveAttribute("height", "16");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    rerender(<Icon size={31} />);
    expect(svg).toHaveAttribute("width", "31");
    expect(svg).toHaveAttribute("height", "31");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
