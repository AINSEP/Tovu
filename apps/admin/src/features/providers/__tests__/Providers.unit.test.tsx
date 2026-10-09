import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

import { Providers } from "../Providers";
import { useRouteLocation } from "@/lib/router";
import { defaultIntegrationsPort } from "../../integrations/hooks/integrations-dependencies.hooks";
import { defaultAlwaysAllowPort } from "../hooks/always-allow-dependencies.hooks";
import { defaultAdminLocalePort } from "../../../hooks/admin-locale-dependencies.hooks";
import type { ProvidersController } from "../hooks/use-providers.hooks";

/**
 * @file `Providers.tsx` — MCP Server and Webhooks tabs, "Soon" and greyed-inert (owner call,
 * 2026-09-19, revised twice: first brief was "delete the fake install command," the owner's actual
 * ask was "keep the real content visible, grey it out, make it genuinely inert" — see
 * `ComingSoonPanel.tsx`'s own header). External MCP has its own coverage through
 * `ExternalMcpSettingsPanel`.
 */

function fixtureProviders(restartRequired = false): ProvidersController {
  return {
    externalMcp: {
      dependencies: createFakeSourceConfigDependencies<SourceConfigItem>({
        sources: [],
        createSource: (input) => ({ id: input.fields.id?.trim() || "new-server", fields: input.fields }),
      }),
      restartRequired,
    },
  };
}

function renderPage(tabId?: string | null, restartRequired = false) {
  // `FetchQueryProvider` is required whenever the default "external-mcp" tab is on screen:
  // `ExternalMcpSettingsPanel` reads the running assistant's admissions through `useFetchQuery`,
  // which needs a query client — same requirement `ExternalMcpSettingsPanel.unit.test.tsx` documents
  // for that panel directly.
  function RoutedPage() {
    const location = useRouteLocation();
    const query = new URLSearchParams(location.split("?")[1] ?? "");
    return <Providers tabId={query.get("tab") ?? tabId} useProvidersHook={() => fixtureProviders(restartRequired)} />;
  }
  return render(<FetchQueryProvider><RoutedPage /></FetchQueryProvider>);
}

describe("Providers — tab strip: MCP Server and Webhooks tagged Soon, External MCP untouched", () => {
  afterEach(() => {
    // Same convention `SourceControl.unit.test.tsx` documents: `navigate()` drives real
    // `history.pushState`, so one test's click could otherwise leak into the next.
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("tags MCP Server and Webhooks Soon, and leaves External MCP untagged", () => {
    renderPage("external-mcp");
    const mcpTab = screen.getByRole("tab", { name: /MCP Server/ });
    const webhooksTab = screen.getByRole("tab", { name: /^Webhooks/ });
    const externalMcpTab = screen.getByRole("tab", { name: /^External MCP/ });
    expect(within(mcpTab).getByText("Soon")).toBeInTheDocument();
    expect(within(webhooksTab).getByText("Soon")).toBeInTheDocument();
    expect(within(externalMcpTab).queryByText("Soon")).not.toBeInTheDocument();
  });

  it.each([["MCP Server", "mcp-server"], ["Webhooks", "webhooks"]])("keeps the tagged %s tab clickable and routes to its own panel", async (label, tabId) => {
    const user = userEvent.setup();
    renderPage("external-mcp");
    const mcpTab = screen.getByRole("tab", { name: new RegExp(`^${label}`) });
    expect(mcpTab).not.toBeDisabled();
    expect(mcpTab).not.toHaveAttribute("aria-disabled");

    await user.click(mcpTab);
    expect(window.location.search).toBe(`?tab=${tabId}`);
    expect(mcpTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });
  it("clicking Always allow shows its real panel", async () => {
    const user = userEvent.setup();
    vi.spyOn(defaultAlwaysAllowPort, "listExternalMcpToolApprovals").mockResolvedValue({ approvals: [] });
    vi.spyOn(defaultAlwaysAllowPort, "listExternalMcpServers").mockResolvedValue({ servers: [] });
    renderPage("external-mcp");
    await user.click(screen.getByRole("tab", { name: /^Always allow/ }));
    expect(window.location.search).toBe("?tab=always-allow");
    expect(screen.getByRole("tab", { name: /^Always allow/ })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Nothing is set to Always allow. Pick it on a tool's approval card in chat.")).toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
});

describe("Providers — no Composio tab (Composio is the `composio` agent plugin since 2026-09-27)", () => {
  it("renders exactly External MCP, Always allow, MCP Server and Webhooks tabs, in that order", () => {
    renderPage("external-mcp");
    const names = screen.getAllByRole("tab").map((tab) => tab.textContent ?? "");
    expect(names).toHaveLength(4);
    expect(names[0]).toMatch(/^External MCP/);
    expect(names[1]).toMatch(/^Always allow/);
    expect(names).toEqual(["External MCP", "Always allow", "MCP ServerSoon", "WebhooksSoon"]);
    expect(names.some((name) => /composio/i.test(name))).toBe(false);
  });

  it("an old ?tab=composio link opens External MCP rather than a Composio panel", () => {
    renderPage("composio");
    expect(screen.getByRole("tab", { name: /^External MCP/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/Composio/)).not.toBeInTheDocument();
  });
});

describe("Providers — MCP Server tab body: visible but greyed and inert, not deleted", () => {
  it("says Coming soon", () => {
    renderPage("mcp-server");
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("still renders the real setup card content underneath the wash, not an empty tab", async () => {
    renderPage("mcp-server");
    // The capabilities card and the (fake, until a real port is wired) install command both stay
    // mounted and visible — the owner's explicit call: see what's coming, don't see nothing.
    // `findByText` (not `getByText`): the fake port resolves via a Promise even at 0ms latency, so
    // the real command replaces `IntegrationsTab`'s own "Loading install paths…" placeholder only
    // after that microtask settles.
    expect(screen.getByText("What this server can do")).toBeInTheDocument();
    expect(await screen.findByText(/path\/to\/cli\.js/)).toBeInTheDocument();
  });

  it("wraps the real content in the shared genuinely-inert wrapper, not just a visual dim", () => {
    renderPage("mcp-server");
    const copyButton = screen.getByRole("button", { name: "Copy" });
    const inertWrap = copyButton.closest(".settings-ui-inert-control");
    expect(inertWrap).not.toBeNull();
    // `inert` is a real boolean HTML attribute — present means the browser natively drops this
    // subtree from tab order, click handling, and the accessibility tree. Same assertion shape
    // `SettingsUi.unit.test.tsx`'s "Privacy tab — inert by design" suite already uses for the
    // identical wrapper class.
    expect(inertWrap).toHaveAttribute("inert");
  });
});

describe("Providers — Webhooks tab body: visible but greyed and inert, same as MCP Server", () => {
  it("says Coming soon", () => {
    renderPage("webhooks");
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("wraps the real webhooks list in the shared genuinely-inert wrapper", async () => {
    const list = vi.spyOn(defaultIntegrationsPort, "listIntegrationSubscriptions").mockResolvedValue({ subscriptions: [] });
    try {
      renderPage("webhooks");
      const addWebhook = await screen.findByRole("button", { name: "Add webhook" });
      const inertWrap = addWebhook.closest(".settings-ui-inert-control");
      expect(inertWrap).not.toBeNull();
      expect(inertWrap).toHaveAttribute("inert");
      expect(inertWrap?.textContent).toBeTruthy();
      expect(within(inertWrap as HTMLElement).getByText("Send webhook notifications to external services when content on this site changes.")).toBeInTheDocument();
      expect(within(inertWrap as HTMLElement).getByRole("button", { name: "Add webhook" })).toBeInTheDocument();
    } finally {
      list.mockRestore();
    }
  });
});

describe("Providers — External MCP restart note: translated through this page's own dictionary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The saved note lives in `providers-i18n.ts`, not `settings-capabilities-i18n.ts`. Translating it
  // through the capabilities dictionary misses the key and falls back to the English copy, so the
  // pill stayed English in every non-English locale.
  it.each([
    [true, "Gespeichert — starten Sie Tovu neu, um eine Verbindung herzustellen"],
  ])("restartRequired=%s renders the German note in a de locale", async (restartRequired, expected) => {
    vi.spyOn(defaultAdminLocalePort, "loadLanguage").mockResolvedValue("de");
    renderPage("external-mcp", restartRequired);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  it("D-33: a fresh site has no pending-change restart note", async () => {
    vi.spyOn(defaultAdminLocalePort, "loadLanguage").mockResolvedValue("en");
    renderPage("external-mcp", false);
    await screen.findByText("Third-party tools for your coding agent.");
    expect(screen.queryByText("Changes apply when Tovu restarts")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved — restart Tovu to connect")).not.toBeInTheDocument();
  });
});
