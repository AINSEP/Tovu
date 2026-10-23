import type { ThemeManifest } from "./theme.js";
import { publicThemeResources } from "./public-page-security-headers.js";
import type { PublicThemeResources } from "../../contracts/core/public-page-security-headers.js";

/**
 * Render declared font links; legacy family lists use the shipped URL template unchanged.
 * SPEC-004 CSS sanitization forbids external font @import in theme CSS, so the URLs stay in data.
 * @param required Theme manifest, whose explicit empty list disables font loading.
 * @param optional Shared resource data port for deterministic rendering tests.
 * @returns Escaped head markup, preserving declaration order; resource data loads once by default.
 * @complexity O(f + p) stylesheet URLs and preconnect declarations.
 */
export function renderThemeFontLinks({ manifest }: { manifest: Pick<ThemeManifest, "fonts" | "fontStylesheets"> }, optional: {
  resources?: PublicThemeResources;
} = {}): string {
  const resources = optional.resources ?? publicThemeResources({});
  const stylesheets = manifest.fontStylesheets ?? legacyStylesheets({ fonts: manifest.fonts ?? [], resources });
  if (stylesheets.length === 0) return "";
  const origins = new Set(stylesheets.filter(url => URL.canParse(url)).map(url => new URL(url).origin));
  const preconnects = [...origins].flatMap(origin => resources.fontPreconnects[origin] ?? [])
    .map(entry => `<link rel="preconnect" href="${attribute({ value: entry.url })}"${entry.crossorigin ? " crossorigin" : ""}/>`).join("");
  return preconnects + [...new Set(stylesheets)].map(url => `<link rel="stylesheet" href="${attribute({ value: url })}"/>`).join("");
}

/** Preserve every legacy family and its order without URL encoding or a stock-list lookup.
 * @complexity O(f) family bytes, no I/O or mutation. */
function legacyStylesheets({ fonts, resources }: { fonts: readonly string[]; resources: PublicThemeResources }, _optional = {}): string[] {
  if (fonts.length === 0 || !resources.legacyFontStylesheetTemplate) return [];
  const families = fonts.map(font => `family=${font}`).join("&");
  return [resources.legacyFontStylesheetTemplate.replace("{families}", () => families)];
}

/** Preserve URL query ampersands for existing golden HTML; quotes and tag boundaries are escaped. */
function attribute({ value }: { value: string }, _optional = {}): string {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
