import { describe, expect, it } from "vitest";

import { ApiError, type AdminPlugin } from "@/lib/api";
import { describeApiError, pluginConflictLines, pluginQuarantineHeadline, pluginRowDetailView } from "../rules";
import { t as translatePlugins } from "../plugins-i18n";

/**
 * @file The Plugins row's conflict and quarantine copy (2026-10-04, plugin conflict detection —
 * `ADS-memory/specs/005-plugin-system/conflicts.spec.md`). `PLUGINS_LIST` rows carry `conflicts[]`
 * (names core or an earlier-enabled plugin already holds), and boot quarantines a conflicting plugin
 * with `consecutiveFailures: 0`. Pure functions, called directly with an identity translator unless a
 * test is about translation itself.
 */

const identity = (key: string) => key;

function makePlugin(overrides: Partial<AdminPlugin> = {}): AdminPlugin {
  return {
    id: "seo-boost",
    name: "SEO Boost",
    version: "1.0.0",
    source: "site",
    tier: "tier-3",
    status: "valid",
    enabled: false,
    quarantine: null,
    errors: [],
    ...overrides,
  };
}

describe("pluginConflictLines", () => {
  it("names the plugin that already holds the name, by its display name", () => {
    const plugin = makePlugin({
      conflicts: [{ kind: "tool", key: "seo_audit", heldBy: "seo-pro", heldByName: "SEO Pro", heldKey: "seo_audit" }],
    });
    expect(pluginConflictLines(plugin, identity)).toEqual(['Tool "seo_audit" is already used by SEO Pro.']);
  });

  it("says Tovu reserves a core name, and shows the reserved pattern only when it differs from the key", () => {
    const plugin = makePlugin({
      conflicts: [
        { kind: "route", key: "GET /api/seo", heldBy: "core", heldByName: "Tovu core", heldKey: "/api/*" },
        { kind: "permission", key: "admin.plugins.read", heldBy: "core", heldByName: "Tovu core", heldKey: "admin.plugins.read" },
      ],
    });
    expect(pluginConflictLines(plugin, identity)).toEqual([
      'Route "GET /api/seo" is reserved by Tovu ("/api/*").',
      'Permission "admin.plugins.read" is reserved by Tovu.',
    ]);
  });

  it("labels every kind the server sends, and passes an unknown kind through verbatim", () => {
    const kinds = ["table", "setting", "widget", "hook", "custom-kind"];
    const plugin = makePlugin({
      conflicts: kinds.map((kind) => ({ kind, key: "x", heldBy: "other", heldByName: "Other", heldKey: "x" })),
    });
    expect(pluginConflictLines(plugin, identity)).toEqual([
      'Table "x" is already used by Other.',
      'Setting "x" is already used by Other.',
      'Widget "x" is already used by Other.',
      'Hook "x" is already used by Other.',
      'custom-kind "x" is already used by Other.',
    ]);
  });

  it("does not resolve a kind named after an Object.prototype member", () => {
    const plugin = makePlugin({ conflicts: [{ kind: "toString", key: "x", heldBy: "o", heldByName: "O", heldKey: "x" }] });
    expect(pluginConflictLines(plugin, identity)).toEqual(['toString "x" is already used by O.']);
  });

  it("drops duplicate lines (a manifest that lists the same name twice reports it twice)", () => {
    const one = { kind: "tool", key: "dup", heldBy: "o", heldByName: "O", heldKey: "dup" };
    expect(pluginConflictLines(makePlugin({ conflicts: [one, { ...one }] }), identity)).toHaveLength(1);
  });

  it("inserts values literally — a `$&` in a name is not a replacement pattern", () => {
    const plugin = makePlugin({ conflicts: [{ kind: "tool", key: "a$&b", heldBy: "o", heldByName: "$'Odd", heldKey: "a$&b" }] });
    expect(pluginConflictLines(plugin, identity)).toEqual(['Tool "a$&b" is already used by $\'Odd.']);
  });

  it("is empty for a row with no conflicts, or from a server that predates the field", () => {
    expect(pluginConflictLines(makePlugin({ conflicts: [] }), identity)).toEqual([]);
    expect(pluginConflictLines(makePlugin(), identity)).toEqual([]);
  });

  it("translates the sentence and the kind label", () => {
    const plugin = makePlugin({
      conflicts: [
        { kind: "tool", key: "seo_audit", heldBy: "seo-pro", heldByName: "SEO Pro", heldKey: "seo_audit" },
        { kind: "route", key: "/api/x", heldBy: "core", heldByName: "Tovu core", heldKey: "/api/*" },
      ],
    });
    expect(pluginConflictLines(plugin, (key) => translatePlugins("es", key))).toEqual([
      'Herramienta "seo_audit": ya en uso por SEO Pro.',
      'Ruta "/api/x": Tovu lo reserva ("/api/*").',
    ]);
  });
});

describe("pluginQuarantineHeadline", () => {
  it("counts hook failures", () => {
    expect(pluginQuarantineHeadline({ at: "t", reason: "r", consecutiveFailures: 3 }, identity)).toBe("Quarantined after 3 consecutive failures");
  });

  it("reads 'Turned off automatically' for a boot conflict quarantine (zero failures), not 'after 0 failures'", () => {
    expect(pluginQuarantineHeadline({ at: "t", reason: "r", consecutiveFailures: 0 }, identity)).toBe("Turned off automatically");
  });
});

describe("pluginRowDetailView", () => {
  it("is null when the row has nothing to say — no empty detail panel", () => {
    expect(pluginRowDetailView(makePlugin(), identity)).toBeNull();
    expect(pluginRowDetailView(makePlugin({ conflicts: [] }), identity)).toBeNull();
  });

  it("carries the quarantine headline and the server's reason verbatim", () => {
    const view = pluginRowDetailView(makePlugin({ quarantine: { at: "t", reason: "Turned off at startup because …", consecutiveFailures: 0 } }), identity);
    expect(view).toEqual({
      quarantine: { headline: "Turned off automatically", reason: "Turned off at startup because …" },
      conflicts: null,
      errors: [],
    });
  });

  it("carries the conflict heading and lines on their own", () => {
    const view = pluginRowDetailView(
      makePlugin({ conflicts: [{ kind: "widget", key: "w", heldBy: "o", heldByName: "O", heldKey: "w" }] }),
      identity,
    );
    expect(view).toEqual({
      quarantine: null,
      conflicts: { heading: "Names already in use — turn the other plugin off first:", lines: ['Widget "w" is already used by O.'] },
      errors: [],
    });
  });

  it("carries validation errors on their own", () => {
    const errors = [{ code: "HOOK_UNKNOWN", file: null, message: "m" }];
    expect(pluginRowDetailView(makePlugin({ errors }), identity)).toEqual({ quarantine: null, conflicts: null, errors });
  });
});

describe("describeApiError — PLUGIN_CONFLICT (409 from PLUGIN_SET_ENABLED)", () => {
  it("points the operator at the row's conflict list and the fix", () => {
    expect(describeApiError(new ApiError("server sentence", 409, "PLUGIN_CONFLICT"), "fallback")).toBe(
      "This plugin uses names that core or another plugin already has. Open its details to see which, and turn the other plugin off first.",
    );
  });

  it("translates an override when given a translator", () => {
    expect(
      describeApiError(new ApiError("server sentence", 409, "PLUGIN_CONFLICT"), "fallback", { translate: (key) => translatePlugins("es", key) }),
    ).toBe("Este plugin usa nombres que ya tiene el núcleo u otro plugin. Abre sus detalles para ver cuáles y desactiva primero el otro plugin.");
  });
});

describe("every plugins locale translates the conflict and quarantine copy", () => {
  const LOCALES = ["es", "id", "de", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];
  const KEYS = [
    "Turned off automatically",
    "Quarantined after {count} consecutive failures",
    "Names already in use — turn the other plugin off first:",
    '{kind} "{key}" is already used by {plugin}.',
    '{kind} "{key}" is reserved by Tovu.',
    '{kind} "{key}" is reserved by Tovu ("{reserved}").',
    "Route",
    "Tool",
    "Table",
    "Setting",
    "Widget",
    "Permission",
    "Hook",
    "This plugin uses names that core or another plugin already has. Open its details to see which, and turn the other plugin off first.",
  ];
  const PLACEHOLDER = /\{[a-z]+\}/g;

  it.each(LOCALES)("%s", (locale) => {
    for (const key of KEYS) {
      const translated = translatePlugins(locale, key);
      // A miss falls back to the English key; "Hooks"/"Plugins"-style loanwords are the one place a
      // locale may legitimately keep the English word, so only a full-sentence key must differ.
      if (key.length > 12) expect(translated, `${locale}: ${key}`).not.toBe(key);
      expect((translated.match(PLACEHOLDER) ?? []).sort(), `${locale}: ${key}`).toEqual((key.match(PLACEHOLDER) ?? []).sort());
    }
  });
});
