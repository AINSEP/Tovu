import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_THEME_STORAGE_KEY,
  applyAdminThemeToDocument,
  rememberAdminThemeChoice,
  resolveAdminThemeDocument,
} from "../apply";
import { ADMIN_THEMES, DEFAULT_ADMIN_THEME_ID, findAdminTheme, resolveAdminThemeScheme, type AdminThemeManifest } from "../registry";
import { CLASSIC_DARK, CLASSIC_ROOT } from "../../__tests__/unit/css-declarations.test-helper";

/**
 * @file The admin theme registry, the document applier and the pre-paint bootstrap in `index.html`.
 * The CSS checks read the real theme files: each manifest's preview must equal its theme's own
 * values, and classic must stay scoped so another theme can replace it.
 */

const SRC = resolve(process.cwd(), "src");
const THEME_DIRS: Record<string, string> = {
  classic: resolve(SRC, "admin-themes/classic"),
  default: resolve(process.cwd(), "node_modules/@jini-ai/admin/src/themes/default"),
};
const read = (path: string) => readFileSync(path, "utf8");

/** Last value of `property` across rules whose selector list contains exactly `selector`. */
function valueFor(css: string, selector: string, property: string): string | undefined {
  let value: string | undefined;
  parse(css).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(property, (decl) => {
      value = decl.value;
    });
  });
  return value;
}

function fakeMatchMedia(dark: boolean) {
  return vi.fn(() => ({ matches: dark }));
}

describe("admin theme registry", () => {
  it("lists classic first as the default and Jini Default after it, each with a unique id", () => {
    expect(ADMIN_THEMES.map((theme) => theme.id)).toEqual(["classic", "default"]);
    expect(DEFAULT_ADMIN_THEME_ID).toBe("classic");
    expect(ADMIN_THEMES.map((theme) => theme.name)).toEqual(["Tovu Classic", "Jini Default"]);
  });

  it.each(ADMIN_THEMES.map((theme) => [theme.id, theme] as const))("%s ships its stylesheets and a preview for every scheme", (id, theme) => {
    for (const sheet of Object.values(theme.stylesheets)) expect(() => read(resolve(THEME_DIRS[id]!, sheet)), sheet).not.toThrow();
    expect(theme.schemes.length).toBeGreaterThan(0);
    for (const scheme of theme.schemes) expect(Object.keys(theme.preview[scheme] ?? {}).sort()).toEqual(["accent", "bg", "border", "surface", "text"]);
  });

  it("classic's preview is classic's own light and dark values", () => {
    const css = read(resolve(THEME_DIRS.classic!, "admin.css"));
    const classic = findAdminTheme({ id: "classic" });
    const tokens = { bg: "--bg", surface: "--surface", text: "--fg", accent: "--primary", border: "--border" } as const;
    for (const [role, token] of Object.entries(tokens)) {
      expect(classic.preview.light?.[role as keyof typeof tokens], role).toBe(valueFor(css, CLASSIC_ROOT, token));
      expect(classic.preview.dark?.[role as keyof typeof tokens], role).toBe(valueFor(css, CLASSIC_DARK, token));
    }
  });

  it("Jini Default's preview is its own palette inputs", () => {
    const css = read(resolve(THEME_DIRS.default!, "admin.css"));
    const theme = findAdminTheme({ id: "default" });
    const inputs = { bg: "bg", surface: "surface", text: "text", accent: "primary", border: "border" } as const;
    for (const scheme of ["light", "dark"] as const) {
      for (const [role, input] of Object.entries(inputs)) {
        expect(theme.preview[scheme]?.[role as keyof typeof inputs], `${scheme} ${role}`).toBe(valueFor(css, ":root", `--jini-theme-${scheme}-${input}`));
      }
    }
  });

  it("an unknown id falls back to classic", () => {
    expect(findAdminTheme({ id: "removed-theme" }).id).toBe("classic");
  });

  it("snaps a scheme the theme lacks to the theme's first scheme", () => {
    const darkOnly = { ...findAdminTheme({ id: "classic" }), schemes: ["dark"] } as AdminThemeManifest;
    expect(resolveAdminThemeScheme({ theme: darkOnly, scheme: "light" }, {})).toBe("dark");
    expect(resolveAdminThemeScheme({ theme: findAdminTheme({ id: "classic" }), scheme: "dark" }, {})).toBe("dark");
  });
});

describe("admin theme cascade", () => {
  it("scopes every classic block so another theme stops matching it", () => {
    for (const sheet of ["admin.css", "chat.css"]) {
      parse(read(resolve(THEME_DIRS.classic!, sheet))).walkRules((rule) => {
        expect([CLASSIC_ROOT, CLASSIC_DARK], `${sheet}: ${rule.selector}`).toContain(rule.selector);
      });
    }
  });

  it("imports the bridge, then Jini Default, then classic, so classic wins at equal specificity", () => {
    const imports = [...read(resolve(SRC, "styles.css")).matchAll(/@import '([^']+)'/g)].map((match) => match[1]);
    expect(imports.slice(2, 5)).toEqual(["./styles/admin-theme-bridge.css", "@jini-ai/admin/themes/default/admin.css", "./admin-themes/classic/admin.css"]);
    const chatImports = [...read(resolve(SRC, "styles/assistant.css")).matchAll(/@import '([^']+)'/g)].map((match) => match[1]);
    expect(chatImports.slice(0, 2)).toEqual(["@jini-ai/admin/themes/default/chat.css", "../admin-themes/classic/chat.css"]);
  });

  it("the bridge supplies every non-Jini legacy name classic declares, and classic overrides each", () => {
    const bridge = read(resolve(SRC, "styles/admin-theme-bridge.css"));
    const classic = read(resolve(THEME_DIRS.classic!, "admin.css"));
    const names: string[] = [];
    parse(bridge).walkDecls((decl) => {
      names.push(decl.prop);
    });
    expect(names).toContain("--focus-ring");
    expect(names).toContain("--chat-border-seam");
    // Layout measures moved to the bridge; every other bridged name keeps classic's own value.
    for (const name of names.filter((prop) => !/measure|clearance/.test(prop))) expect(valueFor(classic, CLASSIC_ROOT, name), name).toBeDefined();
    for (const name of ["--form-measure", "--content-measure", "--assistant-clearance"]) expect(valueFor(classic, CLASSIC_ROOT, name), name).toBeUndefined();
  });
});

describe("document applier", () => {
  it("resolves system against the OS and leaves explicit choices alone", () => {
    expect(resolveAdminThemeDocument({ choice: { themeId: "default", preference: "system" } }, { matchMedia: fakeMatchMedia(true) })).toEqual({ themeId: "default", scheme: "dark" });
    expect(resolveAdminThemeDocument({ choice: { themeId: "default", preference: "light" } }, { matchMedia: fakeMatchMedia(true) })).toEqual({ themeId: "default", scheme: "light" });
    expect(resolveAdminThemeDocument({ choice: { themeId: "classic", preference: "system" } }, {})).toEqual({ themeId: "classic", scheme: "light" });
    expect(resolveAdminThemeDocument({ choice: { themeId: "gone", preference: "dark" } }, {})).toEqual({ themeId: "classic", scheme: "dark" });
  });

  it("sets the theme and canonical scheme, and data-theme only for dark", () => {
    const root = document.createElement("html");
    applyAdminThemeToDocument({ state: { themeId: "default", scheme: "dark" } }, { root });
    expect(root.getAttribute("data-admin-theme")).toBe("default");
    expect(root.getAttribute("data-color-scheme")).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    applyAdminThemeToDocument({ state: { themeId: "classic", scheme: "light" } }, { root });
    expect(root.getAttribute("data-admin-theme")).toBe("classic");
    expect(root.getAttribute("data-color-scheme")).toBe("light");
    // Never "light" on <html>: that is the per-screen light pin.
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("remembers the registered id with its schemes, and survives throwing storage", () => {
    const setItem = vi.fn();
    rememberAdminThemeChoice({ choice: { themeId: "gone", preference: "system" } }, { storage: { setItem } });
    expect(setItem).toHaveBeenCalledWith(ADMIN_THEME_STORAGE_KEY, JSON.stringify({ themeId: "classic", preference: "system", schemes: ["light", "dark"] }));
    expect(() => rememberAdminThemeChoice({ choice: { themeId: "default", preference: "dark" } }, { storage: { setItem: () => { throw new Error("quota"); } } })).not.toThrow();
    expect(() => rememberAdminThemeChoice({ choice: { themeId: "default", preference: "dark" } }, { storage: undefined })).not.toThrow();
  });
});

describe("index.html pre-paint bootstrap", () => {
  const html = read(resolve(dirname(SRC), "index.html"));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

  function runBootstrap(stored: string | null, { dark = false } = {}) {
    const root = document.createElement("html");
    const storage = { getItem: vi.fn(() => stored) };
    new Function("localStorage", "matchMedia", "document", script)(storage, fakeMatchMedia(dark), { documentElement: root });
    return { root, storage };
  }

  it("reads the applier's storage key", () => {
    expect(script).toContain(`"${ADMIN_THEME_STORAGE_KEY}"`);
    expect(runBootstrap(null).storage.getItem).toHaveBeenCalledWith(ADMIN_THEME_STORAGE_KEY);
  });

  it("paints what the applier would, before React loads", () => {
    for (const [choice, dark] of [[{ themeId: "default", preference: "system" }, true], [{ themeId: "classic", preference: "light" }, true], [{ themeId: "default", preference: "dark" }, false]] as const) {
      const storage = { setItem: vi.fn() };
      rememberAdminThemeChoice({ choice }, { storage });
      const { root } = runBootstrap(storage.setItem.mock.calls[0]![1] as string, { dark });
      const expected = document.createElement("html");
      applyAdminThemeToDocument({ state: resolveAdminThemeDocument({ choice }, { matchMedia: fakeMatchMedia(dark) }) }, { root: expected });
      for (const name of ["data-admin-theme", "data-color-scheme", "data-theme"]) expect(root.getAttribute(name), `${choice.themeId}/${choice.preference} ${name}`).toBe(expected.getAttribute(name));
    }
  });

  it("leaves <html> untouched with nothing stored or a corrupt value", () => {
    for (const stored of [null, "{not json"]) {
      const { root } = runBootstrap(stored);
      expect(root.getAttributeNames()).toEqual([]);
    }
  });
});
