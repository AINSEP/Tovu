// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import { SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE } from "@jini-ai/chat/core";
import { guideToPendingCredentialCard } from "../credential-card-guidance";
import { createChatI18nAdapter } from "../../components/AssistantDock/assistant-dock-i18n";

describe("credential paste guidance", () => {
  it("focuses the only pending credential iframe", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="mcpui-surface-overflow-wrap"><div data-agent-element="mcp-ui-pending-ui-tovu-custom-credential-create-one"></div><iframe></iframe></div>';
    document.body.append(root);
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(true);
    expect(document.activeElement).toBe(root.querySelector("iframe"));
    root.remove();
  });
  it("leaves the choice to the model when there is no unique pending credential card", () => {
    const root = document.createElement("div");
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(false);
    root.innerHTML = '<div data-agent-element="mcp-ui-pending-ui-tovu-custom-credential-create-one"></div><div data-agent-element="mcp-ui-pending-ui-tovu-media-provider-credential-two"></div>';
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(false);
  });
  it("uses Jini translations for both credential notices in every locale", () => {
    for (const [locale, dictionary] of Object.entries(SETTINGS_DIALOG_DICTIONARIES)) {
      for (const key of [SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE]) {
        expect(createChatI18nAdapter(locale).t(key)).toBe(dictionary![key]);
      }
    }
  });
});
