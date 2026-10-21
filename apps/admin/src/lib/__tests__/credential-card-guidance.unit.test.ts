// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import { SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE } from "@jini-ai/chat/core";
import { guideToPendingCredentialCard, onAdminSecretRedacted } from "../credential-card-guidance";
import { createChatI18nAdapter } from "../../components/AssistantDock/assistant-dock-i18n";

describe("credential paste guidance", () => {
  it("focuses the only pending credential iframe", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="mcpui-surface-overflow-wrap"><div data-agent-element="mcp-ui-pending-ui-tovu-secret-card-credential_save-one"></div><iframe></iframe></div>';
    document.body.append(root);
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(true);
    expect(document.activeElement).toBe(root.querySelector("iframe"));
    root.remove();
  });
  it.each(["identity_user_create", "deployment_ops_set_secret", "credential_save", "database_transfer_set_destination"])("focuses the only pending engine card for %s", toolId => {
    const root = document.createElement("div");
    root.innerHTML = `<div class="mcpui-surface-overflow-wrap"><div data-agent-element="mcp-ui-pending-ui-tovu-secret-card-${toolId}-one"></div><iframe></iframe></div>`;
    document.body.append(root);
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(true);
    expect(document.activeElement).toBe(root.querySelector("iframe"));
    root.remove();
  });
  it("leaves the choice to the model when there is no unique pending credential card", () => {
    const root = document.createElement("div");
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(false);
    root.innerHTML = '<div data-agent-element="mcp-ui-pending-ui-tovu-secret-card-credential_save-one"></div><div data-agent-element="mcp-ui-pending-ui-tovu-secret-card-credential_save-two"></div>';
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(false);
  });
  it("scrolls an unwrapped pending card itself into view and focuses its iframe", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div data-agent-element="mcp-ui-pending-ui-tovu-secret-card-credential_save-one"><iframe></iframe></div>';
    document.body.append(root);
    const card = root.firstElementChild as HTMLElement;
    const scrolls: unknown[] = [];
    card.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => { scrolls.push(options); };
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(true);
    expect(scrolls).toEqual([{ block: "center", behavior: "smooth" }]);
    expect(document.activeElement).toBe(root.querySelector("iframe"));
    root.remove();
  });
  it("ignores pending MCP-UI cards that are not secret cards", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div data-agent-element="mcp-ui-pending-ui-tovu-chart-one"><iframe></iframe></div>';
    expect(guideToPendingCredentialCard({ document: root }, {})).toBe(false);
  });
  it("on a redaction signal guides to the page's only pending card, and does nothing in a host with no DOM", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="mcpui-surface-overflow-wrap"><div data-agent-element="mcp-ui-pending-ui-tovu-secret-card-credential_save-one"></div><iframe></iframe></div>';
    document.body.append(root);
    onAdminSecretRedacted({ secretRedacted: true, count: 1 });
    expect(document.activeElement).toBe(root.querySelector("iframe"));
    (document.activeElement as HTMLElement).blur();
    expect(() => onAdminSecretRedacted({ secretRedacted: true, count: 1 }, { document: null })).not.toThrow();
    expect(document.activeElement).toBe(document.body);
    root.remove();
  });
  it("uses Jini translations for both credential notices in every locale", () => {
    for (const [locale, dictionary] of Object.entries(SETTINGS_DIALOG_DICTIONARIES)) {
      for (const key of [SECRET_REDACTED_NOTICE, CREDENTIAL_CARD_GUIDANCE]) {
        expect(createChatI18nAdapter(locale).t(key)).toBe(dictionary![key]);
      }
    }
  });
});
