import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";
import classicManifest from "../../classic/manifest.json";
import glassManifest from "../manifest.json";
import type { AdminThemeManifest } from "../../registry";

/** ADR-069: mirrors Classic's manifest/preview/scope guards without registering Glass. */
const THEME_DIR = resolve(process.cwd(), "src/admin-themes/glass");
const ROOT = ':root[data-admin-theme="glass"]';
const DARK = `${ROOT}[data-color-scheme="dark"]`;
const theme: AdminThemeManifest = glassManifest as AdminThemeManifest;

describe("Glass theme package", () => {
  it("uses Classic's manifest shape and ships the declared stylesheets and local fonts", () => {
    expect(Object.keys(theme).sort()).toEqual(Object.keys(classicManifest).sort());
    expect(theme.id).toBe("glass");
    expect(theme.name).toBe("Glassmorphic");
    expect(theme.schemes).toEqual(["light", "dark"]);
    expect(theme.stylesheets).toEqual(classicManifest.stylesheets);
    for (const sheet of Object.values(theme.stylesheets)) {
      expect(() => readFileSync(resolve(THEME_DIR, sheet), "utf8"), sheet).not.toThrow();
    }
    expect(theme.fonts).toEqual([{ family: "Inter", stylesheet: "./fonts/fonts.css" }]);
    const fonts = parse(readFileSync(resolve(THEME_DIR, theme.fonts[0]!.stylesheet), "utf8"));
    expect(fonts.nodes).toHaveLength(3); // Licence comment and normal/italic variable faces.
    fonts.walkAtRules("font-face", (face) => {
      const descriptors = new Map<string, string>();
      face.walkDecls((decl) => { descriptors.set(decl.prop, decl.value); });
      expect(descriptors.get("font-display")).toBe("swap");
      expect(descriptors.get("font-weight")).toBe("100 900");
      const path = descriptors.get("src")!.match(/url\('([^']+)'\)/)![1]!;
      expect(readFileSync(resolve(THEME_DIR, "fonts", path)).length).toBeGreaterThan(0);
    });
    expect(readFileSync(resolve(THEME_DIR, "fonts/Inter-LICENSE.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });

  it("provides each scheme's five preview paints from its own palette inputs", () => {
    const css = parse(readFileSync(resolve(THEME_DIR, "admin.css"), "utf8"));
    const palette = new Map<string, string>();
    css.walkDecls((decl) => {
      // Conditional opaque fallbacks are not the default preview paints.
      if (decl.parent?.type === "rule" && decl.parent.parent?.type === "root") palette.set(decl.prop, decl.value);
    });
    const roles = { bg: "bg", surface: "surface", text: "text", accent: "primary", border: "border" } as const;
    for (const scheme of theme.schemes) {
      expect(Object.keys(theme.preview[scheme]!).sort()).toEqual(Object.keys(roles).sort());
      for (const [role, input] of Object.entries(roles)) {
        expect(theme.preview[scheme]![role as keyof typeof roles], `${scheme}/${role}`).toBe(palette.get(`--jini-theme-${scheme}-${input}`));
      }
    }
  });

  it("scopes all values to Glass and imports only its font faces", () => {
    for (const sheet of Object.values(theme.stylesheets)) {
      const css = parse(readFileSync(resolve(THEME_DIR, sheet), "utf8"));
      css.walkRules((rule) => { expect([ROOT, DARK], `${sheet}: ${rule.selector}`).toContain(rule.selector); });
      css.walkDecls((decl) => { expect(decl.prop.startsWith("--"), `${sheet}: ${decl.prop}`).toBe(true); });
      css.walkAtRules("import", (rule) => { expect(rule.params).toBe("'./fonts/fonts.css'"); });
    }
  });

  it("supplies every Classic chat input explicitly in each scheme", () => {
    const classic = parse(readFileSync(resolve(THEME_DIR, "../classic/chat.css"), "utf8"));
    const required = new Set<string>();
    classic.walkDecls((decl) => { required.add(decl.prop); });
    const chat = parse(readFileSync(resolve(THEME_DIR, "chat.css"), "utf8"));
    for (const selector of [ROOT, DARK]) {
      const names = new Set<string>();
      chat.walkRules((rule) => {
        if (rule.selector === selector && rule.parent?.type === "root") rule.walkDecls((decl) => { names.add(decl.prop); });
      });
      for (const name of required) expect(names.has(name), `${selector}: ${name}`).toBe(true);
    }
  });

  // Owner 2026-10-18: sidebar and dock rendered as opaque white slabs beside the glass content.
  it("frosts the rail and dock over one clear shell, with opaque reduced-transparency fallbacks", () => {
    const top = (file: string) => {
      const values = new Map<string, string>();
      parse(readFileSync(resolve(THEME_DIR, file), "utf8")).walkRules(ROOT, (rule) => {
        if (rule.parent?.type === "root") rule.walkDecls((decl) => { values.set(decl.prop, decl.value); });
      });
      return values;
    };
    const admin = top("admin.css");
    expect(admin.get("--jini-theme-shell-bg")).toBe("transparent");
    for (const role of ["panel", "rail"]) {
      expect(admin.get(`--jini-theme-${role}-bg`), role).toMatch(/^rgb\(255 255 255 \/ \.\d+\)$/);
      expect(admin.get(`--jini-theme-${role}-backdrop`), role).toMatch(/^blur\(/);
    }
    expect(top("chat.css").get("--jini-theme-chat-bg")).toBe("transparent");
    const reduced = new Map<string, string>();
    parse(readFileSync(resolve(THEME_DIR, "admin.css"), "utf8")).walkAtRules("media", (media) => {
      media.walkRules(ROOT, (rule) => { rule.walkDecls((decl) => { reduced.set(decl.prop, decl.value); }); });
    });
    expect(reduced.get("--jini-theme-rail-bg")).toMatch(/^#/);
    expect(reduced.get("--jini-theme-panel-bg")).toMatch(/^#/);
    expect(reduced.get("--jini-theme-rail-backdrop")).toBe("none");

    // The filter lives on a ::before layer: on the element it would re-anchor fixed composer menus.
    const declsOf = (file: string, selector: string) => {
      const decls = new Map<string, string>();
      parse(readFileSync(resolve(THEME_DIR, "..", "..", file), "utf8")).walkRules((rule) => {
        if (rule.selector === selector && rule.parent?.type === "root") rule.walkDecls((decl) => { decls.set(decl.prop, decl.value); });
      });
      return decls;
    };
    for (const [file, host, filter] of [
      ["styles.css", ".cms-nav", "var(--jini-rail-backdrop, none)"],
      ["styles/assistant.css", ".admin-chat-dock", "var(--jini-panel-backdrop, none)"],
    ] as const) {
      expect(declsOf(file, host).has("backdrop-filter"), host).toBe(false);
      expect(declsOf(file, `${host}::before`).get("backdrop-filter"), host).toBe(filter);
    }
    expect(declsOf("styles.css", ".cms-nav").get("background")).toContain("var(--jini-rail-bg");
  });
});
