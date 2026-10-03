import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import {
  AGENT_PLUGIN_GLYPHS, ChevronIcon, DocumentIcon, EyeIcon, InstalledIcon, MarketplaceIcon,
  PackageIcon, PaletteIcon, PlugIcon, RocketIcon, ShieldCheckIcon, TrashIcon,
} from "../agent-plugins-visuals";
import {
  DownloadedTabIcon, InstalledTabIcon, MarketplaceTabIcon, PluginChevronIcon, PluginPackageIcon, PluginTrashIcon,
} from "../plugins-visuals";

it.each([
  ["installed agent", InstalledIcon, 16], ["marketplace agent", MarketplaceIcon, 16],
  ["compliance", ShieldCheckIcon, 18], ["deploy", RocketIcon, 18], ["design", PaletteIcon, 18],
  ["integration", PlugIcon, 18], ["content", DocumentIcon, 18], ["package", PackageIcon, 18],
  ["inspect", EyeIcon, 16], ["trash", TrashIcon, 16], ["agent chevron", ChevronIcon, 14],
  ["installed plugin", InstalledTabIcon, 16], ["downloaded plugin", DownloadedTabIcon, 16],
  ["marketplace plugin", MarketplaceTabIcon, 16], ["plugin package", PluginPackageIcon, 18],
  ["plugin trash", PluginTrashIcon, 16], ["plugin chevron", PluginChevronIcon, 14],
] as const)("%s emits decorative SVG with default and requested dimensions", (_name, Icon, defaultSize) => {
  // F4.3 regression target: ignore size, or drop aria-hidden. Only emitted SVG attributes are claimed (F1.5).
  const view = render(<Icon />);
  const svg = view.container.querySelector("svg")!;
  expect(svg).toHaveAttribute("width", String(defaultSize));
  expect(svg).toHaveAttribute("height", String(defaultSize));
  expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  view.rerender(<Icon size={31} />);
  expect(svg).toHaveAttribute("width", "31");
  expect(svg).toHaveAttribute("height", "31");
});

it("maps domain categories to their intended glyphs", () => {
  // Regression target: point deploy at ShieldCheckIcon; identities pin the lookup, not a copied output.
  expect(AGENT_PLUGIN_GLYPHS).toEqual({
    compliance: ShieldCheckIcon, deploy: RocketIcon, design: PaletteIcon,
    integration: PlugIcon, content: DocumentIcon, package: PackageIcon,
  });
});
