import { describe, expect, it } from "vitest";

import { t as sitesT } from "../sites-i18n";

describe("site publish copy", () => {
  it("carries every Publish key in all 21 locales", async () => {
    const { SITE_PUBLISH_DICT } = await import("../site-publish-i18n");
    const locales = Object.keys(SITE_PUBLISH_DICT);
    expect(locales).toHaveLength(21);
    const keys = Object.keys(SITE_PUBLISH_DICT.de!).sort();
    for (const locale of locales) expect(Object.keys(SITE_PUBLISH_DICT[locale]!).sort()).toEqual(keys);
  });

  it("is merged into the Sites translator", () => {
    // Mutation: drop the SITE_PUBLISH_DICT merge loop; these fall back to English.
    expect(sitesT({ locale: "de", key: "Last published {when}" })).toBe("Zuletzt veröffentlicht {when}");
    expect(sitesT({ locale: "ja", key: "Review in Publish" })).toBe("公開画面で確認");
    expect(sitesT({ locale: "fr", key: "Deploy started, not confirmed" })).toBe("Déploiement lancé, non confirmé");
  });
});
