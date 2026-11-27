import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { VisitorAssistantTabs } from "@jini-ai/admin/screens/assistant-settings/VisitorAssistantTabs";
import { useVisitorAssistantTabs } from "@jini-ai/admin/screens/assistant-settings/use-visitor-assistant-tabs.hooks";
import { resolveTabBarTabIndex, useTabBarKeyboard } from "@jini-ai/ui/tab-strip";
import { VISITOR_TOOLS_DICT, VISITOR_TOOLS_KEYS, withVisitorToolsStrings } from "../visitor-tools-i18n";
import { AI_ASSISTANT_DICT, t as translate } from "../ai-assistant-i18n";
import { VISITOR_TOOL_PRESENTATION } from "../../../../../website/src/assistant/site/visitor-tool-presentation";

const t = (key: string) => key;
/** The host's real bindings: this admin's UI library supplies the tab keyboard and roving-tabindex rules. */
const bindings = { useVisitorAssistantTabsHook: useVisitorAssistantTabs, useTabBarKeyboardHook: useTabBarKeyboard, resolveTabIndex: resolveTabBarTabIndex };

describe("VisitorAssistantTabs", () => {
  it("draws as the Auto | Ask first | Off segmented pill and keeps arrow-key tab navigation", async () => {
    render(<VisitorAssistantTabs t={t} {...bindings} providerPanel={<p>provider screen</p>} toolsPanel={<p>tools screen</p>} />);
    expect(screen.getByRole("tablist").classList.contains("jini-chat-settings-segmented")).toBe(true);
    const provider = screen.getByRole("tab", { name: "AI provider" });
    expect(provider.classList.contains("jini-chat-settings-segment")).toBe(true);
    expect(provider.tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: "Visitor tools" }).tabIndex).toBe(-1);
    provider.focus();
    await userEvent.keyboard("{ArrowRight}");
    const tools = screen.getByRole("tab", { name: "Visitor tools" });
    expect(tools.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tools);
    expect(screen.getByText("tools screen")).toBeTruthy();
  });
});

describe("visitor tools strings", () => {
  it("ship every key, non-empty, in all of the screen's locales", () => {
    expect(Object.keys(VISITOR_TOOLS_DICT).sort()).toEqual(Object.keys(AI_ASSISTANT_DICT).sort());
    for (const [locale, dict] of Object.entries(VISITOR_TOOLS_DICT)) {
      for (const key of VISITOR_TOOLS_KEYS) expect(dict[key]?.length, `${locale}: ${key}`).toBeGreaterThan(0);
    }
  });
  it("translate through the screen's translator without overriding existing words", () => {
    expect(translate({ locale: "de", key: "Visitor tools" })).toBe("Besucher-Tools");
    expect(translate({ locale: "ja", key: "Default: {ip} per visitor/hour, {site} per site/day." })).toContain("{ip}");
    // "Off" already belongs to the status pill; the pill's translation wins.
    expect(translate({ locale: "id", key: "Off" })).toBe("Nonaktif");
  });
  it("translates every built-in title and plain description in every admin locale", () => {
    const copy = Object.values(VISITOR_TOOL_PRESENTATION).flatMap(tool => [tool.displayTitle, tool.displayDescription]);
    for (const locale of Object.keys(AI_ASSISTANT_DICT)) for (const key of copy) {
      expect(VISITOR_TOOLS_DICT[locale][key]?.length, `${locale}: ${key}`).toBeGreaterThan(0);
      expect(translate({ locale, key }), `${locale}: ${key}`).not.toBe(key);
    }
    for (const key of copy) expect(translate({ locale: "en", key })).toBe(key);
  });

});

it("merges visitor-tool copy without losing a base-only locale or overriding shared copy", () => {
  const base = { de: { "Visitor tools": "Website-Werkzeuge" }, nl: { "AI provider": "AI-aanbieder" } };
  const merged = withVisitorToolsStrings({ base });
  expect(merged.nl).toEqual({ "AI provider": "AI-aanbieder" });
  expect(merged.de["Visitor tools"]).toBe("Website-Werkzeuge");
  expect(merged.ja["Default: {ip} per visitor/hour, {site} per site/day."]?.match(/\{[^{}]+\}/g)?.sort())
    .toEqual(["{ip}", "{site}"]);
  expect(base.de).toEqual({ "Visitor tools": "Website-Werkzeuge" });
});
