import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/** @file "Export static site" and its "Exporting…" busy label share one button width, so the split button does not narrow while it works. */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles/site-transfer.css"), "utf8");

describe("static export action width", () => {
  it("keeps a fixed minimum width across idle and busy labels", () => {
    expect(effectiveDeclarationsFor(stylesheet, ".static-export-action")).toMatch(/min-inline-size:\s*11rem;/);
  });
});
