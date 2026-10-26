import { describe, expect, it } from "vitest";
import { parseRoute } from "../../App";
import { resolveImportExportRoute } from "../import-export-routes";

describe("resolveImportExportRoute (owner, 2026-10-25: Sites → Export/Import moved to Import & Export)", () => {
  it.each(["export", "import"])("sends /sites?tab=%s to the Import & Export tab", (tab) => {
    const destination = `/import-export?tab=${tab}`;
    expect(resolveImportExportRoute({ routePath: `/sites?tab=${tab}` })).toEqual({ matchPath: destination, redirectPath: destination });
    expect(resolveImportExportRoute({ routePath: `/sites/?tab=${tab}&x=1` })).toEqual({ matchPath: destination, redirectPath: destination });
  });

  it("leaves every other Sites tab and every other route alone", () => {
    for (const routePath of ["/sites", "/sites?tab=all", "/sites?tab=new", "/sites?tab=trash", "/sites?tab=Export", "/import-export?tab=import", "/deployment?tab=export", "/sites/export"]) {
      expect(resolveImportExportRoute({ routePath }), routePath).toBeUndefined();
    }
  });

  it("runs in parseRoute, so the route is Import & Export before the Sites gate sees it", () => {
    const route = parseRoute("/sites?tab=import");
    expect(route.panelId).toBe("import-export");
    expect(route.query.get("tab")).toBe("import");
    expect(route.redirectPath).toBe("/import-export?tab=import");
    expect(parseRoute("/sites?tab=new")).toMatchObject({ panelId: "sites", redirectPath: undefined });
  });
});
