import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file A locked ("Soon") agent-plugin switch reads as disabled, not busy. The in-flight rule dims the
 * grey track to near-white (the owner's "white empty switch"), so a locked switch overrides it.
 */
const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("locked agent-plugin switch", () => {
  const locked = effectiveDeclarationsFor(stylesheet, ".agent-plugin-switch--locked:disabled");

  it("keeps full opacity so the track stays grey, and shows a not-allowed cursor", () => {
    expect(locked).toMatch(/opacity:\s*1;/);
    expect(locked).toMatch(/cursor:\s*not-allowed;/);
  });

  it("uses a pale track with a grey knob, so it reads as disabled rather than white and empty", () => {
    expect(locked).toMatch(/background:\s*var\(--jini-border\);/);
    expect(effectiveDeclarationsFor(stylesheet, ".agent-plugin-switch--locked:disabled .agent-plugin-switch-knob")).toMatch(/background:\s*var\(--jini-border-strong\);/);
  });
});
