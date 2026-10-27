import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file Regression (76ab3f05d): Tovu's dialogs moved from `tovu-domain-dialog` to Jini's
 * host-neutral `jini-domain-dialog` (Jini 47b9fa4f, shipped in @jini-ai/admin 0.4.11, whose
 * SitemapModal and FieldAttributesDialog emit only the new name). The CSS alias for the old name
 * was then dropped, so a component still emitting it would render as an unstyled native dialog.
 */

const appsRoot = resolve(process.cwd(), "..");
const dialogsCss = resolve(process.cwd(), "src/styles/native-domain-dialogs.css");
const thisFile = fileURLToPath(import.meta.url);
const OLD = "tovu-domain-dialog";
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|css|html)$/;
const SKIP = new Set(["node_modules", "dist", "build", "coverage"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) || entry.name.startsWith(".") ? [] : sourceFiles(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

describe("domain dialogs use jini-domain-dialog", () => {
  it("no file under apps/ names the old tovu-domain-dialog class", () => {
    const offenders = sourceFiles(appsRoot)
      .filter((file) => file !== thisFile && readFileSync(file, "utf8").includes(OLD))
      .map((file) => relative(appsRoot, file));
    expect(offenders).toEqual([]);
  });

  it("every domain-dialog selector targets .jini-domain-dialog", () => {
    const selectors: string[] = [];
    parse(readFileSync(dialogsCss, "utf8")).walkRules((rule) => { selectors.push(...rule.selectors); });
    const domain = selectors.filter((selector) => selector.includes("domain-dialog"));
    expect(domain).toContain(".settings-dialog.jini-domain-dialog");
    for (const selector of domain) expect(selector).toContain(".jini-domain-dialog");
  });

  // Seen in Chrome 2026-10-26: the OpenTelemetry settings body scrolled with a macOS overlay
  // scrollbar drawn over the inputs' right edge. The body now reaches into the dialog padding.
  it("a scrolling body keeps its scrollbar beside the fields, not over them", () => {
    const body = effectiveDeclarationsFor(readFileSync(dialogsCss, "utf8"), ".jini-domain-dialog .jini-dialog-body");
    expect(body).toMatch(/margin: -3px calc\(-1 \* var\(--space-3\)\);/);
    expect(body).toMatch(/padding: 3px var\(--space-3\);/);
  });
});
