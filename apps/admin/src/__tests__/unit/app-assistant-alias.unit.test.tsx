import { describe, expect, it } from "vitest";
import { parseRoute } from "../../App";

/** P18: a retired assistant URL replaces history before any Dashboard screen mounts. */
describe("P18 assistant alias", () => {
  it.each([
    ["/assistant", "/ai-assistant"],
    ["/assistant/", "/ai-assistant"],
    ["/assistant?tab=admin", "/ai-assistant?tab=admin"],
    ["/assistant/?tab=admin&x=a%20b&x=a+b&empty=&flag", "/ai-assistant?tab=admin&x=a%20b&x=a+b&empty=&flag"],
  ])("parses %s as the canonical assistant and keeps the query bytes", (path, destination) => {
    const route = parseRoute(path);
    expect(route).toMatchObject({ panelId: "ai-assistant", redirectPath: destination });
    expect(route.query).toEqual(parseRoute(destination).query);
  });

  it.each([
    "/assistant/typo", "/assistants", "/Assistant", "/assistant//",
  ])("keeps the unknown-route fallback for %s", path => {
    const route = parseRoute(path);
    expect(route.panelId).toBeNull();
    expect(route.redirectPath).toBeUndefined();
  });

  it("leaves the canonical assistant route free of further redirects", () => {
    const route = parseRoute("/ai-assistant?tab=admin");
    expect(route.panelId).toBe("ai-assistant");
    expect(route.redirectPath).toBeUndefined();
  });
});
