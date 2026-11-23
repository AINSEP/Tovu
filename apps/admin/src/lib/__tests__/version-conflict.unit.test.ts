import { describe, expect, it } from "vitest";

import { VERSION_CONFLICT_MESSAGE } from "@jini-ai/admin/shell/lib/version-conflict";
import { COMMON_I18N } from "../i18n-common";

/** The classifiers moved to `@jini-ai/admin/shell/lib/version-conflict` (tested there); the host's
 *  common dictionary must still translate their shared message key. */
describe("VERSION_CONFLICT_MESSAGE", () => {
  it("is translated in every COMMON_I18N locale", () => {
    for (const [locale, dict] of Object.entries(COMMON_I18N)) {
      expect(dict[VERSION_CONFLICT_MESSAGE], locale).toBeTruthy();
      expect(dict[VERSION_CONFLICT_MESSAGE], locale).not.toBe(VERSION_CONFLICT_MESSAGE);
    }
  });
});
