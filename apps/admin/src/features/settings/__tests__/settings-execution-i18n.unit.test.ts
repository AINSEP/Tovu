import { describe, expect, it } from "vitest";

import { AI_ASSISTANT_DICT } from "../../ai-assistant/ai-assistant-i18n";
import { STORED_KEY_NO_ENDPOINT_COPY, STORED_KEY_OTHER_PROVIDER_COPY } from "@jini-ai/admin/shell/lib/stored-credential-endpoint";
import { t } from "@jini-ai/admin/screens/settings/settings-execution-i18n";
import { localCliScopeCopy } from "@jini-ai/chat/react/admin-execution/ai-agent-presentation";
import { scopeKeys } from "../ai-agent-presentation";
import { SETTINGS_EXECUTION_PRODUCT_VARS } from "@/integrations/jini-admin/settings-execution-copy";
import { interpolate } from "@jini-ai/core/text";

/**
 * @file Settings -> Execution mode and AI Assistant -> Admin AI Assistant render the same form over the same
 * stored key, so they must word its two stored-key asks alike. `settings-execution-i18n.ts` copies its
 * values from `ai-assistant-i18n.ts`; this fails when either copy changes alone, or a locale is missing.
 */

const STORED_KEY_ASKS = [STORED_KEY_OTHER_PROVIDER_COPY, STORED_KEY_NO_ENDPOINT_COPY];

describe("settings-execution-i18n — the stored-key asks", () => {
  it.each(Object.keys(AI_ASSISTANT_DICT))("%s: translated, and worded exactly as AI Assistant words them", (locale) => {
    for (const key of STORED_KEY_ASKS) {
      expect(t({ locale: locale, key: key })).not.toBe(key);
      expect(t({ locale: locale, key: key })).toBe(AI_ASSISTANT_DICT[locale]?.[key]);
    }
  });

  it("keeps the English copy for English", () => {
    for (const key of STORED_KEY_ASKS) expect(t({ locale: "en", key: key })).toBe(key);
  });
});

// K3 product copy: the server-scope label names the product. Screen output must not change when the
// dictionary key carries `{productName}` and the host fills it at the render site. Mutation: drop
// `vars` (or the token in a translation) and German renders "{productName}" instead of "Tovu".
describe("settings-execution-i18n — the Local CLI scope label names the host product", () => {
  const scopeLabel = (locale: string, desktop: boolean) =>
    interpolate({ template: t({ locale, key: localCliScopeCopy({ desktop, ...scopeKeys }) }), vars: SETTINGS_EXECUTION_PRODUCT_VARS });

  it("renders the server-scope label in German with the product name", () => {
    expect(scopeLabel("de", false)).toBe("Auf dem Tovu-Server erkannt, nicht auf Ihrem eigenen Computer.");
    expect(scopeLabel("ja", false)).toBe("自分のコンピューターではなく、Tovuサーバー上で検出されました。");
  });

  it("renders the English server-scope label and the desktop label unchanged", () => {
    expect(scopeLabel("en", false)).toBe("Detected on the Tovu server, not on your own computer.");
    expect(scopeLabel("de", true)).toBe(t({ locale: "de", key: "Detected on this computer." }));
  });
});
