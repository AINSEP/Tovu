import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vitest";
import renderBoundary from "../RoutedA2uiSurfaceCard.tsx?raw";

// Vitest returns "" for `?inline` CSS unless css processing is on, so read the built file the package export points at.
const interactiveCss = readFileSync(createRequire(import.meta.url).resolve("@jini-ai/ui/interactive-ui.css"), "utf8");

it("loads the built table stylesheet at the shared inline and canvas A2UI boundary", () => {
  expect(renderBoundary).toContain('import "@jini-ai/ui/interactive-ui.css";');
  expect(interactiveCss).toContain(".jini-data-table");
  expect(interactiveCss).toContain(".jini-data-table-scroll");
  // Importing the shared stylesheet must not reset unrelated admin elements.
  expect(interactiveCss).not.toMatch(/\*[^{}]*\{[^}]*box-sizing\s*:\s*border-box/);
});
