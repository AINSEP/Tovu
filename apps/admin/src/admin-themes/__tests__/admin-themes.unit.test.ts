import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_THEME_STORAGE_KEY,
  applyAdminThemeToDocument,
  rememberAdminThemeChoice,
  resolveAdminThemeBoundary,
  resolveAdminThemeDocument,
} from "../apply";
import { ADMIN_THEMES, adminThemeAccentDefaults, DEFAULT_ADMIN_THEME_ID, findAdminTheme, resolveAdminThemeScheme, type AdminThemeManifest } from "../registry";
import { CLASSIC_DARK, CLASSIC_ROOT } from "../../__tests__/unit/css-declarations.test-helper";

/**
 * @file The admin theme registry, the document applier and the pre-paint bootstrap in `index.html`.
 * The CSS checks read the real theme files: each manifest's preview must equal its theme's own
 * values, and classic must stay scoped so another theme can replace it.
 */

const SRC = resolve(process.cwd(), "src");
const THEME_DIRS: Record<string, string> = {
  classic: resolve(SRC, "admin-themes/classic"),
  glass: resolve(SRC, "admin-themes/glass"),
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
  it("lists only Classic, keeping it as the default", () => {
    expect(ADMIN_THEMES.map((theme) => theme.id)).toEqual(["classic"]);
    expect(DEFAULT_ADMIN_THEME_ID).toBe("classic");
    expect(ADMIN_THEMES.map((theme) => theme.name)).toEqual(["Tovu Classic"]);
  });

  it.each(ADMIN_THEMES.map((theme) => [theme.id, theme] as const))("%s ships its stylesheets and a preview for every scheme", (id, theme) => {
    for (const sheet of Object.values(theme.stylesheets)) expect(() => read(resolve(THEME_DIRS[id]!, sheet)), sheet).not.toThrow();
    expect(theme.schemes.length).toBeGreaterThan(0);
    for (const scheme of theme.schemes) {
      const { accentHex, ...preview } = theme.preview[scheme] ?? {};
      expect(Object.keys(preview).sort()).toEqual(["accent", "bg", "border", "surface", "text"]);
      if (accentHex !== undefined) expect(accentHex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("classic's preview is classic's own light and dark values", () => {
    const css = read(resolve(THEME_DIRS.classic!, "admin.css"));
    const classic = findAdminTheme({ id: "classic" });
    const tokens = { bg: "--bg", surface: "--surface", text: "--fg", accent: "--primary", border: "--border" } as const;
    for (const [scheme, selector] of [["light", CLASSIC_ROOT], ["dark", CLASSIC_DARK]] as const) {
      for (const [role, token] of Object.entries(tokens)) {
        const value = valueFor(css, selector, token);
        // The preview stores a colour, while Classic's equal canvas/panel fills share --bg.
        expect(classic.preview[scheme]?.[role as keyof typeof tokens], `${scheme}: ${role}`)
          .toBe(value === "var(--bg)" ? valueFor(css, selector, "--bg") : value);
      }
    }
  });

  it.each(["removed-theme", "glass"])("%s falls back to classic", (id) => {
    expect(findAdminTheme({ id }).id).toBe("classic");
  });

  it("snaps a scheme the theme lacks to the theme's first scheme", () => {
    const darkOnly = { ...findAdminTheme({ id: "classic" }), schemes: ["dark"] } as AdminThemeManifest;
    expect(resolveAdminThemeScheme({ theme: darkOnly, scheme: "light" }, {})).toBe("dark");
    expect(resolveAdminThemeScheme({ theme: findAdminTheme({ id: "classic" }), scheme: "dark" }, {})).toBe("dark");
  });

  it("renders light for a theme that declares no schemes at all", () => {
    const schemeless: AdminThemeManifest = { ...findAdminTheme({ id: "classic" }), schemes: [] };
    expect(resolveAdminThemeScheme({ theme: schemeless, scheme: "dark" }, {})).toBe("light");
  });

  it("falls back to the first theme of a registry that has no classic", () => {
    const classic = findAdminTheme({ id: "classic" });
    const themes: AdminThemeManifest[] = [{ ...classic, id: "first" }, { ...classic, id: "second" }];
    expect(findAdminTheme({ id: "second" }, { themes }).id).toBe("second");
    expect(findAdminTheme({ id: "missing" }, { themes }).id).toBe("first");
  });
});

describe("admin theme cascade", () => {
  it("scopes every classic block so another theme stops matching it", () => {
    const lightPin = `${CLASSIC_ROOT} [data-theme="light"]`;
    const customAccent = `${CLASSIC_ROOT}[data-admin-accent]`;
    for (const sheet of ["admin.css", "chat.css"]) {
      parse(read(resolve(THEME_DIRS.classic!, sheet))).walkRules((rule) => {
        expect([CLASSIC_ROOT, CLASSIC_DARK, lightPin, customAccent], `${sheet}: ${rule.selector}`).toContain(rule.selector);
        if (rule.selector === lightPin || rule.selector === customAccent) {
          expect(rule.nodes.every((node) => node.type === "comment" || (node.type === "decl" && node.prop.startsWith("--"))),
            `${sheet}: ${rule.selector} may only re-resolve custom properties`).toBe(true);
        }
      });
    }
  });

  it("imports the bridge, Classic and Glass, without Jini Default stylesheets", () => {
    const imports = [...read(resolve(SRC, "styles.css")).matchAll(/@import '([^']+)'/g)].map((match) => match[1]);
    expect(imports.slice(2, 5)).toEqual(["./styles/admin-theme-bridge.css", "./admin-themes/classic/admin.css", "./admin-themes/glass/admin.css"]);
    expect(imports.some((path) => path?.includes("themes/default"))).toBe(false);
    const chatImports = [...read(resolve(SRC, "styles/assistant.css")).matchAll(/@import '([^']+)'/g)].map((match) => match[1]);
    expect(chatImports.some((path) => path?.includes("themes/default"))).toBe(false);
    expect(chatImports.slice(0, 2)).toEqual(["../admin-themes/classic/chat.css", "../admin-themes/glass/chat.css"]);
  });

  it.each([false, true])("preserves all inherited root token values (dark=%s)", (dark) => {
    const classic = read(resolve(THEME_DIRS.classic!, "admin.css"));
    const chat = read(resolve(THEME_DIRS.classic!, "chat.css"));
    const bridge = read(resolve(SRC, "styles/admin-theme-bridge.css"));
    const platform = resolve(process.cwd(), "node_modules/@jini-ai/admin/src/themes/default");
    const variables = read(resolve(process.cwd(), "node_modules/@jini-ai/ui/src/styles/variables.css"));
    const tokens = (sheets: string[]) => {
      const values: Record<string, string> = {};
      for (const sheet of sheets) parse(sheet).walkRules((rule) => {
        if (!rule.selectors.some((selector) => selector === ":root" || selector === CLASSIC_ROOT || (dark && selector === CLASSIC_DARK))) return;
        for (const node of rule.nodes) {
          if (node.type === "decl" && node.prop.startsWith("--")) values[node.prop] = node.value;
        }
      });
      return values;
    };
    // Both cascades inherit UI defaults, including fonts, radius and density. The retired
    // stylesheet's explicit inputs still form the baseline; Classic must preserve every value.
    const previous = tokens([variables, bridge, read(resolve(platform, "admin.css")), classic, read(resolve(platform, "chat.css")), chat]);
    expect(tokens([variables, bridge, classic, chat])).toEqual(previous);
  });

  it("classic overrides bridged legacy names while layout and material compatibility stay bridge-owned", () => {
    const bridge = read(resolve(SRC, "styles/admin-theme-bridge.css"));
    const classic = read(resolve(THEME_DIRS.classic!, "admin.css"));
    const names: string[] = [];
    parse(bridge).walkDecls((decl) => {
      names.push(decl.prop);
    });
    expect(names).toContain("--focus-ring");
    expect(names).toContain("--chat-border-seam");
    // Layout and material compatibility belong to the host bridge; theme-owned legacy names
    // still require Classic's own values. The selector checks below cover the material seams.
    for (const name of names.filter((prop) => !prop.startsWith("--jini-") && !prop.startsWith("--tovu-admin-") && !/measure|clearance/.test(prop))) expect(valueFor(classic, CLASSIC_ROOT, name), name).toBeDefined();
    for (const name of ["--form-measure", "--content-measure", "--assistant-clearance"]) expect(valueFor(classic, CLASSIC_ROOT, name), name).toBeUndefined();
  });

  it("keeps material compatibility values at their root, Classic and local bridge selectors", () => {
    const bridge = read(resolve(SRC, "styles/admin-theme-bridge.css"));
    const values: Record<string, Record<string, string>> = {};
    parse(bridge).walkRules((rule) => {
      rule.walkDecls((decl) => {
        if (!decl.prop.startsWith("--tovu-admin-")) return;
        for (const selector of rule.selectors) (values[selector] ??= {})[decl.prop] = decl.value;
      });
    });
    const classicRoot = {
      "--tovu-admin-layout-bg": "var(--jini-bg)",
      "--tovu-admin-elevated-bg": "var(--surface)",
      "--tovu-admin-elevated-shadow": "var(--shadow-md)",
      "--tovu-admin-scrim-backdrop": "none",
      "--tovu-admin-rail-shadow": "none",
      "--tovu-admin-mobile-panel-shadow": "var(--shadow-md)",
    };
    const panels = ":is(.settings-ui-section, .media-providers-panel)";
    const classicScope = ':where(:root:not([data-admin-theme]), :root[data-admin-theme="classic"])';
    expect(values).toEqual({
      ":root": {
        "--tovu-admin-layout-bg": "var(--jini-shell-bg, var(--jini-bg))",
        "--tovu-admin-elevated-bg": "var(--jini-bg-elevated)",
        "--tovu-admin-elevated-shadow": "var(--jini-overlay-shadow)",
        "--tovu-admin-scrim-backdrop": "var(--jini-overlay-backdrop)",
        "--tovu-admin-rail-shadow": "var(--jini-panel-shadow)",
        "--tovu-admin-mobile-panel-shadow": "var(--jini-panel-shadow)",
      },
      ":root:not([data-admin-theme])": classicRoot,
      ':root[data-admin-theme="classic"]': classicRoot,
      [panels]: {
        "--tovu-admin-settings-control-bg": "var(--jini-control-bg)",
        "--tovu-admin-settings-control-border": "var(--jini-control-border)",
      },
      ".jini-select-menu": {
        "--tovu-admin-select-menu-bg": "var(--jini-bg-elevated)",
        "--tovu-admin-select-menu-shadow": "var(--jini-overlay-shadow)",
      },
      [`${classicScope} ${panels}`]: {
        "--tovu-admin-settings-control-bg": "var(--jini-bg-panel)",
        "--tovu-admin-settings-control-border": "var(--jini-border)",
      },
      [`${classicScope} .jini-select-menu`]: {
        "--tovu-admin-select-menu-bg": "var(--jini-bg-panel)",
        "--tovu-admin-select-menu-shadow": "0 8px 24px color-mix(in srgb, black 18%, transparent)",
      },
    });
  });
});

describe("document applier", () => {
  it.each(["light", "dark"] as const)("keeps Classic pinned and follows Glass's %s scheme", (scheme) => {
    expect(resolveAdminThemeBoundary({ state: { themeId: "classic", scheme } })).toEqual({ "data-theme": "light" });
    expect(resolveAdminThemeBoundary({ state: { themeId: "glass", scheme } })).toEqual({ "data-theme": scheme, "data-color-scheme": scheme });
  });
  it("resolves system against the OS and leaves explicit choices alone", () => {
    expect(resolveAdminThemeDocument({ choice: { themeId: "default", preference: "system" } }, { matchMedia: fakeMatchMedia(true) })).toEqual({ themeId: "classic", scheme: "dark" });
    expect(resolveAdminThemeDocument({ choice: { themeId: "default", preference: "light" } }, { matchMedia: fakeMatchMedia(true) })).toEqual({ themeId: "classic", scheme: "light" });
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
    for (const [choice, dark] of [[{ themeId: "default", preference: "system" }, true], [{ themeId: "classic", preference: "light" }, true], [{ themeId: "default", preference: "dark" }, false], [{ themeId: "glass", preference: "system" }, true], [{ themeId: "glass", preference: "light" }, true]] as const) {
      const storage = { setItem: vi.fn() };
      rememberAdminThemeChoice({ choice }, { storage });
      const { root } = runBootstrap(storage.setItem.mock.calls[0]![1] as string, { dark });
      const expected = document.createElement("html");
      applyAdminThemeToDocument({ state: resolveAdminThemeDocument({ choice }, { matchMedia: fakeMatchMedia(dark) }) }, { root: expected });
      for (const name of ["data-admin-theme", "data-color-scheme", "data-theme"]) expect(root.getAttribute(name), `${choice.themeId}/${choice.preference} ${name}`).toBe(expected.getAttribute(name));
    }
  });

  it.each(["default", "glass", "removed-theme"])("falls back from cached %s to Classic before first paint", (themeId) => {
    for (const preference of ["light", "dark", "system"] as const) {
      // A retired theme's scheme limits must not constrain Classic's supported schemes.
      const { root } = runBootstrap(JSON.stringify({ themeId, preference, schemes: ["light"] }), { dark: true });
      const scheme = preference === "light" ? "light" : "dark";
      expect(root.getAttribute("data-admin-theme")).toBe("classic");
      expect(root.getAttribute("data-color-scheme")).toBe(scheme);
      expect(root.getAttribute("data-theme")).toBe(scheme === "dark" ? "dark" : null);
    }
  });

  it("leaves <html> untouched with nothing stored or a corrupt value", () => {
    for (const stored of [null, "{not json"]) {
      const { root } = runBootstrap(stored);
      expect(root.getAttributeNames()).toEqual([]);
    }
  });
});

describe("adminThemeAccentDefaults", () => {
  const swatch = { bg: "#fff", surface: "#fff", text: "#111", accent: "oklch(55% 0.11 43)", border: "#ddd" };

  it("gives the native colour input the theme's hex equivalent when it has one", () => {
    expect(adminThemeAccentDefaults({ ...swatch, accentHex: "#a85a38" })).toEqual({ defaultAccent: "oklch(55% 0.11 43)", defaultPickerAccent: "#a85a38" });
  });

  it("falls back to the accent as written when the theme declares no hex", () => {
    expect(adminThemeAccentDefaults(swatch)).toEqual({ defaultAccent: "oklch(55% 0.11 43)", defaultPickerAccent: "oklch(55% 0.11 43)" });
  });
});
