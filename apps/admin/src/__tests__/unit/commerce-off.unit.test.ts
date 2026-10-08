import { describe, expect, it } from "vitest";
import { getNav } from "../../nav";
import { ADMIN_PANELS } from "../../panels";
/** Phase 12: future Payments UI lives in Jini and is absent from Tovu's real panel/nav registry. */
describe("commerce off", () => {
  it("does not expose the Payments panel or a navigation link", () => {
    expect(ADMIN_PANELS.some(panel => panel.id === "payments")).toBe(false);
    expect(getNav().flatMap(group => group.items).some(item => item.id === "payments")).toBe(false);
  });
});
