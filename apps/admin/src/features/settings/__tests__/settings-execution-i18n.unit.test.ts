import { describe, expect, it } from "vitest";

import { AI_ASSISTANT_DICT } from "../../ai-assistant/ai-assistant-i18n";
import { STORED_KEY_NO_ENDPOINT_COPY, STORED_KEY_OTHER_PROVIDER_COPY } from "@/lib/stored-credential-endpoint";
import { t } from "../settings-execution-i18n";

/**
 * @file Settings -> Execution mode and AI Assistant -> Admin AI Assistant render the same form over the same
 * stored key, so they must word its two stored-key asks alike. `settings-execution-i18n.ts` copies its
 * values from `ai-assistant-i18n.ts`; this fails when either copy changes alone, or a locale is missing.
 */

const STORED_KEY_ASKS = [STORED_KEY_OTHER_PROVIDER_COPY, STORED_KEY_NO_ENDPOINT_COPY];

describe("settings-execution-i18n — the stored-key asks", () => {
  it.each(Object.keys(AI_ASSISTANT_DICT))("%s: translated, and worded exactly as AI Assistant words them", (locale) => {
    for (const key of STORED_KEY_ASKS) {
      expect(t(locale, key)).not.toBe(key);
      expect(t(locale, key)).toBe(AI_ASSISTANT_DICT[locale]?.[key]);
    }
  });

  it("keeps the English copy for English", () => {
    for (const key of STORED_KEY_ASKS) expect(t("en", key)).toBe(key);
  });
});
