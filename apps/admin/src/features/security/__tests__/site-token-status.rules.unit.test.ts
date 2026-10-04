import { describe, expect, it } from "vitest";
import { siteTokenStatusBadgeLabel } from "../hooks/site-token-status.rules";
import { t } from "../security-i18n";

describe("site key env provenance", () => {
  it("renders the server's actual env name", () => {
    const translate = (key: string) => t("en", key);
    expect(siteTokenStatusBadgeLabel({ status: { active: true, source: "env", envVarName: "TOVU_SITE_KEY" }, t: translate })).toBe("Active: environment variable TOVU_SITE_KEY");
    expect(siteTokenStatusBadgeLabel({ status: { active: true, source: "env", envVarName: "LEGACY_VAR" }, t: translate })).toBe("Active: environment variable LEGACY_VAR");
  });
  it("interpolates the German badge", () => {
    expect(siteTokenStatusBadgeLabel({ status: { active: true, source: "env", envVarName: "TOVU_SITE_KEY" }, t: key => t("de", key) })).toBe("Aktiv: Umgebungsvariable TOVU_SITE_KEY");
  });
});
