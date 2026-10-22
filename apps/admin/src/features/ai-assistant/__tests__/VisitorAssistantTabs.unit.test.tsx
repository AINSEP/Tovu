import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { VisitorAssistantTabs } from "../VisitorAssistantTabs";
import { parseLimitsDraft } from "../hooks/use-visitor-tools.hooks";
import { VISITOR_TOOLS_DICT, VISITOR_TOOLS_KEYS } from "../visitor-tools-i18n";
import { AI_ASSISTANT_DICT, t as translate } from "../ai-assistant-i18n";
import { VISITOR_TOOL_PRESENTATION } from "../../../../../website/src/assistant/site/visitor-tool-presentation";

const t = (key: string) => key;

describe("VisitorAssistantTabs", () => {
  it("opens on AI provider (the unchanged screen) and switches to Visitor tools", async () => {
    render(<VisitorAssistantTabs t={t} providerPanel={<p>provider screen</p>} toolsPanel={<p>tools screen</p>} />);
    expect(screen.getByRole("tablist", { name: "Visitor's AI Assistant" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "AI provider" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("provider screen")).toBeTruthy();
    expect(screen.queryByText("tools screen")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "Visitor tools" }));
    expect(screen.getByRole("tab", { name: "Visitor tools" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Visitor tools" }).textContent).toBe("tools screen");
    expect(screen.queryByText("provider screen")).toBeNull();
  });
});

describe("parseLimitsDraft", () => {
  const current = { perIpPerHour: 30, perSitePerDay: 1000 };
  it("returns only changed dimensions", () => {
    expect(parseLimitsDraft({ draft: { perIpPerHour: "30", perSitePerDay: "1000" }, current })).toEqual({ error: false, patch: {} });
    expect(parseLimitsDraft({ draft: { perIpPerHour: " 5 ", perSitePerDay: "2000" }, current })).toEqual({ error: false, patch: { perIpPerHour: 5, perSitePerDay: 2000 } });
  });
  it("rejects zero, negatives, decimals, blanks and unsafe integers", () => {
    for (const bad of ["0", "-1", "1.5", "", "1e3", "99999999999999999999"]) {
      expect(parseLimitsDraft({ draft: { perIpPerHour: bad, perSitePerDay: "1" }, current })).toEqual({ error: true });
    }
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
