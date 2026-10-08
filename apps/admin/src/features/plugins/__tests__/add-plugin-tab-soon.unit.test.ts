import { expect, it } from "vitest";

import { ADD_PLUGIN_TAB_SOON, addPluginTabSoonTag } from "../add-plugin-tab-soon";

it("leaves working Add tabs untagged by default", () => {
  expect(ADD_PLUGIN_TAB_SOON).toBe(false);
  expect(addPluginTabSoonTag("en")).toBeUndefined();
  expect(addPluginTabSoonTag("es")).toBeUndefined();
});

it("uses the translated sidebar badge when explicitly enabled", () => {
  expect(addPluginTabSoonTag("en", true)).toBe("Soon");
  expect(addPluginTabSoonTag("es", true)).toBe("Próximamente");
});

it("leaves the tab untagged once the flag is off", () => {
  expect(addPluginTabSoonTag("en", false)).toBeUndefined();
});
