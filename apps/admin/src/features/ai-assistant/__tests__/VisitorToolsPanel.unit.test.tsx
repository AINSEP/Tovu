import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { VisitorToolConfigureInput, VisitorToolsPort, VisitorToolsView, VisitorToolView } from "@jini-ai/core/contracts/site/api-ai-assistant-api-types";
import { VisitorToolsPanel } from "@jini-ai/admin/screens/assistant-settings/VisitorToolsPanel";
import { useVisitorTools } from "@jini-ai/admin/screens/assistant-settings/use-visitor-tools.hooks";
import { visitorToolsDependencies, visitorToolsPanelBindings } from "../hooks/visitor-tools-dependencies.hooks";
import { t as translate } from "../ai-assistant-i18n";
import { VISITOR_TOOLS_DICT } from "../visitor-tools-i18n";
import { createVanillaToolConfirmation } from "../../../../../site-chat/src/vanilla-tool-confirmation";

/**
 * @file Host-side proof for the engine's Visitor tools tab: this admin's dictionaries translate its
 * copy, its help names the public chat's real Allow button, and its handles stay approval-gated.
 * The tab's behaviour tests live with the component in the engine package.
 */
const t = (key: string) => key;
const DEFAULTS = { perIpPerHour: 30, perSitePerDay: 1000 };

function tool(id: string, overrides: Partial<VisitorToolView> = {}): VisitorToolView {
  return { id, source: "builtin", sourceRevision: "r1", title: `Tool ${id}`, description: `Does ${id}.`, effect: "read",
    availability: { available: true }, mode: "auto", limits: { ...DEFAULTS }, ...overrides };
}
function view(overrides: Partial<VisitorToolsView> = {}): VisitorToolsView {
  return { revisionSeq: 7, defaults: { ...DEFAULTS }, callsPerTurn: 4, tools: [tool("list_posts"), tool("site_guide", { mode: "off" })], ...overrides };
}

/** Typed fake of the HTTP port: applies writes like the server (new revision each time). */
function fakePort(initial: VisitorToolsView = view()) {
  let current = initial;
  let nextFailure: unknown = null;
  let lists = 0;
  const writes: VisitorToolConfigureInput[] = [];
  const port: VisitorToolsPort = {
    list: async () => { lists++; return current; },
    configure: async (input) => {
      writes.push(input);
      if (nextFailure) { const failure = nextFailure; nextFailure = null; throw failure; }
      const ids = input.toolId === "site" ? current.tools.map(item => item.id) : [input.toolId];
      current = { ...current, revisionSeq: current.revisionSeq + 1, policyState: undefined,
        tools: current.tools.map(item => ids.includes(item.id)
          ? { ...item, mode: input.mode ?? item.mode, limits: { ...item.limits, ...input.limits } } : item) };
      return current;
    },
  };
  return { port, writes, lists: () => lists, failNext: (error: unknown) => { nextFailure = error; },
    changeElsewhere: (next: VisitorToolsView) => { current = next; } };
}

/** The panel as this admin binds it, with only the endpoint swapped for the fake. */
function Panel({ t, port }: { t: (key: string) => string; port: VisitorToolsPort }) {
  return <VisitorToolsPanel t={t} {...visitorToolsPanelBindings}
    useVisitorToolsHook={(input) => useVisitorTools({ ...input, ...visitorToolsDependencies, port })} />;
}

describe("VisitorToolsPanel (host copy and policy)", () => {
  it("shows translated display copy instead of the model text, including the accessible tool name", async () => {
    const fake = fakePort(view({ tools: [tool("list_categories", {
      title: "list categories", description: "Model-only instructions: list public content types.",
      displayTitle: "List categories", displayDescription: "Lets visitors see your post categories.",
    })] }));
    const { rerender } = render(<Panel t={(key) => translate({ locale: "de", key })} port={fake.port} />);
    expect(await screen.findByText("Kategorien auflisten")).toBeTruthy();
    expect(screen.getByText("Zeigt Besuchern deine Beitragskategorien.")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Kategorien auflisten" })).toBeTruthy();
    expect(screen.queryByText("list categories")).toBeNull();
    expect(screen.queryByText(/Model-only instructions/)).toBeNull();
    rerender(<Panel t={t} port={fake.port} />);
    expect(await screen.findByText("List categories")).toBeTruthy();
    expect(screen.getByText("Lets visitors see your post categories.")).toBeTruthy();
    expect(fake.writes).toEqual([]);
  });

  it.each(Object.keys(VISITOR_TOOLS_DICT))("names the visitor's rendered Allow button in the mode help (%s)", async (locale) => {
    const visitor = document.createElement("div");
    visitor.innerHTML = '<div class="jini-chat-vanilla__tool-confirmation" hidden><span></span><button>Continue</button></div>';
    document.body.append(visitor);
    const project = createVanillaToolConfirmation({ element: visitor, document }, { confirm: async () => true });
    project({ directive: { kind: "tool_confirmation", challengeId: "a".repeat(22), title: "Confirm search", summary: "Search posts." } });
    try {
      const allow = within(visitor).getByRole("button", { name: "Allow" });
      const fake = fakePort();
      render(<Panel t={(key) => translate({ locale, key })} port={fake.port} />);
      await screen.findByText("Tool list_posts");
      const tip = screen.getByRole("button", { name: translate({ locale, key: "About visitor tools" }) });
      await userEvent.click(tip);
      const descriptionId = tip.getAttribute("aria-describedby")!;
      // Public confirmation owns the visible label; the admin dictionary does not render that button.
      expect(document.getElementById(descriptionId)?.textContent).toContain(allow.textContent);
    } finally {
      project({ directive: null });
      visitor.remove();
    }
  });

  it("no Visitor tools handle is a direct (approval-free) page click", () => {
    const policy = readFileSync(resolve(process.cwd(), "../website/src/assistant/assistant-tool-approval-policy.ts"), "utf8");
    const direct = policy.slice(policy.indexOf("DIRECT_PAGE_HANDLES"), policy.indexOf("]);", policy.indexOf("DIRECT_PAGE_HANDLES")));
    expect(direct).not.toMatch(/visitor/);
  });
});
