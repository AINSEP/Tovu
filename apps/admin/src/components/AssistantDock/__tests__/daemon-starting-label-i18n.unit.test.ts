import { describe, expect, it } from "vitest";
import { ASSISTANT_DOCK_DICT, t } from "../assistant-dock-i18n";

const KEY = "Starting assistant…";

describe("daemon startup copy", () => {
  // Derive the inventory from the existing table so a newly supported locale cannot be missed.
  it.each(Object.keys(ASSISTANT_DOCK_DICT))("%s translates Starting assistant… through the dock's existing translator", locale => {
    const dockLabel = t(locale, KEY);
    expect(dockLabel.trim()).not.toBe("");
    expect(dockLabel).not.toBe(KEY);
  });
});
