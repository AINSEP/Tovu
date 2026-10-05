import { describe, expect, it } from "vitest";

import { pluginInstallPreviewDisplay } from "../rules";
import { t as translatePlugins } from "../plugins-i18n";
import type { PluginInstallPreview } from "../hooks/plugin-install-port.hooks";

/**
 * @file The install dialog's preview copy (2026-10-04): AW-7 Tier 1's code-free wording for a
 * manifest-only package, its declared content types, and the plugin-conflicts install preview —
 * the names it would clash with in the CURRENT workspace if turned on. Pure, identity translator
 * unless a test is about translation.
 */

const identity = (key: string) => key;
const base: PluginInstallPreview = {
  id: "faq-pack", name: "FAQ pack", version: "2.0.0", tier: "tier-3", capabilities: ["content.read"], hooks: ["content.entry.beforeSave"],
  hasCode: true, contentTypes: [], conflicts: [], digest: "sha256-" + "a".repeat(64),
};

describe("pluginInstallPreviewDisplay", () => {
  it("a package with code: full-access warning, its capabilities and hooks, no conflict block", () => {
    expect(pluginInstallPreviewDisplay(base, identity)).toEqual({
      title: "FAQ pack (faq-pack)",
      version: "2.0.0",
      tier: "tier-3",
      capabilities: "content.read",
      hooks: "content.entry.beforeSave",
      contentTypes: "—",
      codeNotice: "This plugin runs code with full access to this computer and every site on it.",
      conflicts: null,
    });
  });

  it("a code-free (tier-1) package says it has no code and lists its content types instead", () => {
    const view = pluginInstallPreviewDisplay({ ...base, tier: "tier-1", hasCode: false, capabilities: [], hooks: [], contentTypes: ["faq", "testimonial"], upgradeFrom: "1.0.0" }, identity);
    expect(view.codeNotice).toBe("This plugin has no code; nothing in it runs on this computer. Turning it on only adds what it declares.");
    expect(view.contentTypes).toBe("faq, testimonial");
    expect(view.capabilities).toBe("—");
    expect(view.hooks).toBe("—");
    expect(view.version).toBe("1.0.0 → 2.0.0");
    expect(view.tier).toBe("tier-1");
  });

  it("conflicts: says they are this workspace's, and reuses the Plugins row's sentences", () => {
    const view = pluginInstallPreviewDisplay({
      ...base,
      conflicts: [
        { kind: "content-type", key: "faq", heldBy: "faq-holder", heldByName: "FAQ Holder", heldKey: "faq" },
        { kind: "route", key: "GET /api/faq", heldBy: "core", heldByName: "Tovu core", heldKey: "/api/*" },
      ],
    }, identity);
    expect(view.conflicts).toEqual({
      heading: "Already in use in this workspace (other workspaces are checked when you turn it on there):",
      lines: ['Content type "faq" is already used by FAQ Holder.', 'Route "GET /api/faq" is reserved by Tovu ("/api/*").'],
    });
  });

  it("translates the notice, the heading and the conflict sentence", () => {
    const es = (key: string) => translatePlugins("es", key);
    const view = pluginInstallPreviewDisplay({ ...base, hasCode: false, conflicts: [{ kind: "content-type", key: "faq", heldBy: "o", heldByName: "O", heldKey: "faq" }] }, es);
    expect(view.codeNotice).toBe(es("This plugin has no code; nothing in it runs on this computer. Turning it on only adds what it declares."));
    expect(view.codeNotice).not.toMatch(/^This plugin/);
    expect(view.conflicts?.heading).not.toMatch(/^Already/);
    expect(view.conflicts?.lines).toEqual(['Tipo de contenido "faq": ya en uso por O.']);
  });
});

describe("every plugins locale translates the install-preview copy", () => {
  const LOCALES = ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];
  const KEYS = [
    "Content type",
    "Content types",
    "This plugin has no code; nothing in it runs on this computer. Turning it on only adds what it declares.",
    "Already in use in this workspace (other workspaces are checked when you turn it on there):",
    // The Plugins row's conflict copy, which the install dialog reuses (zh-CN/zh-TW/pt-BR lacked it).
    "Names already in use — turn the other plugin off first:",
    '{kind} "{key}" is already used by {plugin}.',
    '{kind} "{key}" is reserved by Tovu.',
    '{kind} "{key}" is reserved by Tovu ("{reserved}").',
    "Turned off automatically",
    "Quarantined after {count} consecutive failures",
    "This plugin uses names that core or another plugin already has. Open its details to see which, and turn the other plugin off first.",
  ];
  const PLACEHOLDER = /\{[a-z]+\}/g;

  it.each(LOCALES)("%s", (locale) => {
    for (const key of KEYS) {
      const translated = translatePlugins(locale, key);
      expect(translated, `${locale}: ${key}`).not.toBe(key);
      expect((translated.match(PLACEHOLDER) ?? []).sort(), `${locale}: ${key}`).toEqual((key.match(PLACEHOLDER) ?? []).sort());
    }
  });
});
