import { afterEach, expect, it } from "vitest";
import { buildSeoSettingsPatch, goToSeoTab, resolveSeoTabs, sitemapStateLabel } from "../Seo.hooks";
import { t } from "../seo-i18n";

const originalUrl = window.location.href;
afterEach(() => window.history.replaceState(null, "", originalUrl));

it("switches SEO tabs using replacement history entries", () => {
  // Author Checklist F2.1/F2.4/F7.5: real router and readback; reject push navigation.
  window.history.replaceState(null, "", "/admin/seo?tab=defaults");
  const entries = window.history.length;
  goToSeoTab("sitemap");
  expect(window.location.pathname + window.location.search).toBe("/admin/seo?tab=sitemap");
  expect(window.history.length).toBe(entries);
  goToSeoTab("entries");
  expect(window.location.pathname + window.location.search).toBe("/admin/seo?tab=entries");
  expect(window.history.length).toBe(entries);
});

it("resolves the SEO dictionary into Spanish tabs and both sitemap states", () => {
  // Author Checklist F1.1/F2.4/F4.1/F6.2: reject binding an empty dictionary,
  // ignoring locale, or always reporting the disabled sitemap state. No source mutations.
  expect(resolveSeoTabs("es").map(({ id, label }) => ({ id, label }))).toEqual([
    { id: "defaults", label: "Valores predeterminados del sitio" },
    { id: "sitemap", label: "Mapa del sitio" },
    { id: "entries", label: "Páginas y entradas" },
  ]);
  expect(sitemapStateLabel("es", true)).toBe("Este sitio publica un mapa del sitio.");
  expect(sitemapStateLabel("es", false)).toBe("Este sitio no publica un mapa del sitio. Actívalo en Valores predeterminados del sitio.");
  expect(t("es", "failed to save SEO settings")).toBe("no se pudo guardar la configuración de SEO");
  expect(t("unlisted-locale", "Save settings")).toBe("Save settings");
  expect(t("es", "future SEO label")).toBe("future SEO label");
});

it("uses the absent-title default while preserving an explicitly empty title and clearing optional fields", () => {
  // Author Checklist F4.3/F6.2: missing and empty are separate inputs; reject
  // replacing ?? with ||, undefined clear sentinels, or truthy checkbox parsing.
  const form = new FormData();
  expect(buildSeoSettingsPatch(form)).toEqual({
    titleTemplate: "%s", defaultDescription: null, defaultOgImage: null, twitterSite: null,
    defaultRobots: { noindex: false, nofollow: false }, sitemapEnabled: false,
  });
  form.set("titleTemplate", "");
  form.set("defaultDescription", "Distinct description");
  form.set("defaultOgImage", "https://example.test/social.png");
  form.set("twitterSite", "@example");
  form.set("noindex", "on");
  form.set("nofollow", "false");
  form.set("sitemapEnabled", "on");
  expect(buildSeoSettingsPatch(form)).toEqual({
    titleTemplate: "", defaultDescription: "Distinct description",
    defaultOgImage: "https://example.test/social.png", twitterSite: "@example",
    defaultRobots: { noindex: true, nofollow: false }, sitemapEnabled: true,
  });
});
