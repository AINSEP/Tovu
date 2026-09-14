import { describe, expect, it } from "vitest";

import { ApiError, type AdminPlugin } from "@/lib/api";
import {
  buildPluginRemoveConfirmCopy,
  describeApiError,
  filterInstalledPlugins,
  pluginRemoveAriaLabel,
  pluginSubline,
  pluginToggleControl,
} from "../rules";

/**
 * @file Direct, no-React coverage for `Plugins.tsx`'s pure `rules.ts` functions added or changed by
 * the Installed/Downloaded/Marketplace tab rebuild (2026-09-09) — the `.tovu-plugin` runtime
 * family's own rules, independent of `agent-plugin-rules.unit.test.ts` (the sibling screen's
 * equivalent, for a different plugin family).
 *
 * `pluginToggleControl`'s AC-21 "invisible toggle" branch (an invalid+disabled plugin gets no
 * enable-capable control) is exercised here by DIRECT invocation rather than through
 * `Plugins.unit.test.tsx`'s rendered UI: since Installed now pre-filters to `plugin.enabled ===
 * true`, that branch's precondition (`!(plugin.enabled || plugin.status === "valid")`) can never be
 * true for any row the Installed tab actually renders — `plugin.enabled` alone already satisfies
 * the OR. Per this workspace's "unreachable branch: delete vs. direct-invoke test" convention, the
 * function keeps its full contract (any future caller can still hit this precondition) and this
 * test proves the branch still behaves correctly, without pretending the current UI can reach it.
 */

function makePlugin(overrides: Partial<AdminPlugin> = {}): AdminPlugin {
  return {
    id: "p1",
    name: "Word Count",
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

describe("pluginSubline", () => {
  it("joins source · tier · status verbatim, untranslated", () => {
    expect(pluginSubline(makePlugin({ source: "built-in", tier: "tier-1", status: "invalid" }))).toBe("built-in · tier-1 · invalid");
  });
});

describe("filterInstalledPlugins", () => {
  it("keeps only enabled: true rows, preserving order", () => {
    const plugins = [makePlugin({ id: "a", enabled: true }), makePlugin({ id: "b", enabled: false }), makePlugin({ id: "c", enabled: true })];
    expect(filterInstalledPlugins(plugins)!.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("passes null through — a load that hasn't settled is not the same fact as 'loaded, none enabled'", () => {
    expect(filterInstalledPlugins(null)).toBeNull();
  });

  it("returns an empty array, not null, for a settled load with zero enabled rows", () => {
    expect(filterInstalledPlugins([makePlugin({ enabled: false })])).toEqual([]);
  });
});

describe("pluginToggleControl — AC-21 direct invocation (unreachable via Installed-tab-only rendering)", () => {
  it("an invalid, disabled plugin offers no enable-capable control (visible: false)", () => {
    const control = pluginToggleControl(makePlugin({ status: "invalid", enabled: false }), null, "en");
    expect(control).toEqual({ visible: false, disabled: false, label: "" });
  });

  it("an enabled plugin always stays visible regardless of status — the only case Installed can ever render", () => {
    const control = pluginToggleControl(makePlugin({ status: "invalid", enabled: true }), null, "en");
    expect(control.visible).toBe(true);
    expect(control.label).toBe("Disable");
  });

  it("a valid, disabled plugin is visible with an Enable label", () => {
    const control = pluginToggleControl(makePlugin({ status: "valid", enabled: false }), null, "en");
    expect(control).toEqual({ visible: true, disabled: false, label: "Enable" });
  });
});

describe("pluginRemoveAriaLabel", () => {
  it("names the plugin for a site plugin", () => {
    expect(pluginRemoveAriaLabel(makePlugin({ source: "site", name: "Valid Site Plugin" }), "en")).toBe("Remove Valid Site Plugin");
  });

  it("says unavailable for a built-in plugin", () => {
    expect(pluginRemoveAriaLabel(makePlugin({ source: "built-in", name: "Word Count" }), "en")).toBe("Remove Word Count — unavailable");
  });
});

describe("buildPluginRemoveConfirmCopy", () => {
  it("names the exact plugin and states the deletion is real and permanent", () => {
    const copy = buildPluginRemoveConfirmCopy({ name: "Valid Site Plugin" });
    expect(copy.title).toBe('Remove "Valid Site Plugin" from this site?');
    expect(copy.body).toMatch(/deletes the plugin's files from this site/);
    expect(copy.body).toMatch(/cannot be undone/);
    expect(copy.body).toMatch(/reinstalling starts from scratch/);
  });
});

describe("describeApiError — PLUGIN_UNINSTALL's four codes", () => {
  it("maps PLUGIN_NOT_UNINSTALLABLE to a built-in-specific message", () => {
    expect(describeApiError(new ApiError("x", 422, "PLUGIN_NOT_UNINSTALLABLE"), "fallback")).toBe(
      "This plugin ships with Tovu and cannot be removed.",
    );
  });

  it("maps PLUGIN_ENABLED to the disable-first guidance", () => {
    expect(describeApiError(new ApiError("x", 409, "PLUGIN_ENABLED"), "fallback")).toBe(
      "This plugin is enabled and must be disabled everywhere before it can be removed.",
    );
  });

  it("maps PLUGIN_ID_INVALID", () => {
    expect(describeApiError(new ApiError("x", 400, "PLUGIN_ID_INVALID"), "fallback")).toBe("This plugin's id is invalid.");
  });

  it("still maps PLUGIN_NOT_FOUND — shared verbatim with PLUGIN_SET_ENABLED's own error envelope", () => {
    expect(describeApiError(new ApiError("x", 404, "PLUGIN_NOT_FOUND"), "fallback")).toBe("No plugin with that id is installed.");
  });

  it("falls back to the shared default for a non-Error, non-ApiError rejection", () => {
    expect(describeApiError("not an Error instance", "fallback text")).toBe("fallback text");
  });

  it("surfaces a plain Error's own message unchanged (the shared default's behavior, not overridden here)", () => {
    expect(describeApiError(new Error("network down"), "fallback text")).toBe("network down");
  });
});

describe("describeApiError — characterization of every remaining branch", () => {
  it("maps PLUGIN_SET_ENABLED's PLUGIN_INVALID and PLUGIN_INCOMPATIBLE", () => {
    expect(describeApiError(new ApiError("x", 422, "PLUGIN_INVALID"), "fallback")).toBe("This plugin failed validation and cannot be enabled.");
    expect(describeApiError(new ApiError("x", 422, "PLUGIN_INCOMPATIBLE"), "fallback")).toBe("This plugin requires a different SDK version.");
  });

  it("an ApiError with an unmapped code, or no code, surfaces the server's own message", () => {
    expect(describeApiError(new ApiError("server says no", 500, "INTERNAL"), "fallback")).toBe("server says no");
    expect(describeApiError(new ApiError("server says no", 500), "fallback")).toBe("server says no");
  });

  it("an ApiError with an unmapped code and an empty message uses the fallback", () => {
    expect(describeApiError(new ApiError("", 500, "INTERNAL"), "fallback")).toBe("fallback");
  });

  it("a code that names an Object.prototype member is not treated as a mapped code", () => {
    expect(describeApiError(new ApiError("server says no", 500, "toString"), "fallback")).toBe("server says no");
    expect(describeApiError(new ApiError("server says no", 500, "constructor"), "fallback")).toBe("server says no");
  });
});
