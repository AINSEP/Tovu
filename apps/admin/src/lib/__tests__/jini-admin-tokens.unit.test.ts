/**
 * @file The host CSS bridge binds `@jini-ai/admin`'s `--jini-admin-site-preview-bg` to this app's
 * `--tovu-site-preview-bg`. The theme directory is frozen: both themes keep declaring the Tovu
 * name, so renaming it there would leave the Jini-named token undefined for the admin's own preview
 * iframes (transparent instead of white). The alias lives in the bridge, never in the themes.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");
const TOKENS = read("../jini-admin-tokens.css");

describe("site preview background bridge", () => {
  it("aliases the Jini token to the Tovu token the themes declare", () => {
    expect(TOKENS).toMatch(/--jini-admin-site-preview-bg:\s*var\(--tovu-site-preview-bg\);/);
  });

  it.each(["classic", "glass"])("%s theme still declares the Tovu token and not the Jini name", (theme) => {
    const css = read(`../../admin-themes/${theme}/admin.css`);
    expect(css).toMatch(/--tovu-site-preview-bg:\s*#fff;/);
    expect(css).not.toMatch(/--jini-admin-site-preview-bg\s*:/);
  });
});
