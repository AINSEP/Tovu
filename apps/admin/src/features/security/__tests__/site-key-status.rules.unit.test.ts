import { describe, expect, it } from "vitest";
import { siteKeyStatusBadgeLabel } from "../hooks/site-key-status.rules";
import { t } from "../security-i18n";

describe("site key env provenance", () => {
  it.each(["none", "file", "env"] as const)("labels an inactive %s key as None", (source) => {
    expect(siteKeyStatusBadgeLabel({
      status: { active: false, source, envVarName: "TOVU_SITE_KEY" },
      t: key => t({ locale: "en", key: key }),
    })).toBe("None");
  });

  it("renders the server's actual env name", () => {
    const translate = (key: string) => t({ locale: "en", key: key });
    expect(siteKeyStatusBadgeLabel({ status: { active: true, source: "env", envVarName: "TOVU_SITE_KEY" }, t: translate })).toBe("Active: environment variable TOVU_SITE_KEY");
    expect(siteKeyStatusBadgeLabel({ status: { active: true, source: "env", envVarName: "LEGACY_VAR" }, t: translate })).toBe("Active: environment variable LEGACY_VAR");
  });
  it("interpolates the German badge", () => {
    expect(siteKeyStatusBadgeLabel({ status: { active: true, source: "env", envVarName: "TOVU_SITE_KEY" }, t: key => t({ locale: "de", key: key }) })).toBe("Aktiv: Umgebungsvariable TOVU_SITE_KEY");
  });
});
