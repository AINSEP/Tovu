import { expect, it } from "vitest";

import { ADD_PLUGIN_TAB_SOON, MARKETPLACE_TAB_SOON, addPluginTabSoonTag, marketplaceTabSoonTag } from "../add-plugin-tab-soon";

it("leaves working Add tabs untagged by default", () => {
  expect(ADD_PLUGIN_TAB_SOON).toBe(false);
  expect(addPluginTabSoonTag({ locale: "en" })).toBeUndefined();
  expect(addPluginTabSoonTag({ locale: "es" })).toBeUndefined();
});

it("uses the translated sidebar badge when explicitly enabled", () => {
  expect(addPluginTabSoonTag({ locale: "en" }, { enabled: true })).toBe("Soon");
  expect(addPluginTabSoonTag({ locale: "es" }, { enabled: true })).toBe("Próximamente");
});

it("leaves the tab untagged once the flag is off", () => {
  expect(addPluginTabSoonTag({ locale: "en" }, { enabled: false })).toBeUndefined();
});

it("tags Marketplace tabs Soon by default, in the sidebar badge's own words", () => {
  expect(MARKETPLACE_TAB_SOON).toBe(true);
  expect(marketplaceTabSoonTag({ locale: "en" })).toBe("Soon");
  expect(marketplaceTabSoonTag({ locale: "es" })).toBe("Próximamente");
  expect(marketplaceTabSoonTag({ locale: "en" }, { enabled: false })).toBeUndefined();
});
