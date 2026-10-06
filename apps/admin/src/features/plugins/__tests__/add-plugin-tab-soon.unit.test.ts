import { expect, it } from "vitest";

import { ADD_PLUGIN_TAB_SOON, addPluginTabSoonTag } from "../add-plugin-tab-soon";

it("is on, and reads as the sidebar's own translated Soon word", () => {
  expect(ADD_PLUGIN_TAB_SOON).toBe(true);
  expect(addPluginTabSoonTag("en")).toBe("Soon");
  expect(addPluginTabSoonTag("es")).toBe("Próximamente");
});

it("leaves the tab untagged once the flag is off", () => {
  expect(addPluginTabSoonTag("en", false)).toBeUndefined();
});
