import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

import { FetchQueryProvider } from "@/lib/fetch-query";

import { Providers } from "../Providers";
import type { ProvidersController } from "../hooks/use-providers.hooks";

/**
 * @file First dedicated test file for `Providers.tsx` (empty `__tests__/` before this pass — no
 * existing suite mounted this page directly). Scoped to the MCP Server tab defect found 2026-09-19:
 * with no `port` prop, the old `<IntegrationsTab>` render fell back to
 * `createFakeMcpIntegrationsPort()`'s demo install command
 * (`{command: "node", args: ["/path/to/cli.js", "mcp"]}`), shown as real, copyable text on every
 * install. This suite pins the fix — a `TabBarTab.tag` "Soon" badge plus `McpServerSoonPanel`
 * replacing that render — rather than exercising the whole page (Composio/External MCP/Webhooks tabs
 * already have their own coverage through `ComposioKeyField`/`ExternalMcpSettingsPanel`/
 * `Integrations`, none of which this change touches).
 */

function fixtureProviders(): ProvidersController {
  return {
    composio: {
      config: null,
      unlocked: false,
      loadError: null,
      saveState: "idle",
      saveError: null,
      catalogRefreshKey: 0,
      save: async () => {},
      clear: async () => {},
    },
    externalMcp: {
      dependencies: createFakeSourceConfigDependencies<SourceConfigItem>({
        sources: [],
        createSource: (input) => ({ id: input.fields.id?.trim() || "new-server", fields: input.fields }),
      }),
      restartRequired: false,
    },
  };
}

function renderPage(tabId?: string | null) {
  // `FetchQueryProvider` is required whenever the default "external-mcp" tab is on screen:
  // `ExternalMcpSettingsPanel` reads the running assistant's admissions through `useFetchQuery`,
  // which needs a query client — same requirement `ExternalMcpSettingsPanel.unit.test.tsx` documents
  // for that panel directly. The "mcp-server" tab under test here doesn't need it, but wrapping
  // unconditionally is harmless and keeps this helper single-shaped.
  return render(
    <FetchQueryProvider>
      <Providers tabId={tabId} useProvidersHook={() => fixtureProviders()} />
    </FetchQueryProvider>,
  );
}

describe("Providers — MCP Server tab strip: tagged Soon", () => {
  it("shows a Soon tag on the MCP Server tab, visible without switching to it", () => {
    renderPage("external-mcp");
    const tab = screen.getByRole("tab", { name: /MCP Server/ });
    expect(within(tab).getByText("Soon")).toBeInTheDocument();
  });

  it("does not tag the sibling External MCP or Webhooks tabs", () => {
    renderPage("external-mcp");
    const externalMcpTab = screen.getByRole("tab", { name: /^External MCP/ });
    const webhooksTab = screen.getByRole("tab", { name: /^Webhooks/ });
    expect(within(externalMcpTab).queryByText("Soon")).not.toBeInTheDocument();
    expect(within(webhooksTab).queryByText("Soon")).not.toBeInTheDocument();
  });

  // Same convention `SourceControl.unit.test.tsx`/`StaticSiteTab.unit.test.tsx` document: `navigate()`
  // drives real `history.pushState`, so one test's click could otherwise leak into the next.
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("keeps the MCP Server tab fully clickable — Soon is a tag, not disabled", async () => {
    const user = userEvent.setup();
    renderPage("external-mcp");
    const tab = screen.getByRole("tab", { name: /MCP Server/ });
    expect(tab).not.toBeDisabled();
    expect(tab).not.toHaveAttribute("aria-disabled");

    // `Providers` derives `activeTabId` from its `tabId` PROP (owned by `panels.tsx`'s router, not
    // by this component), so clicking here can't flip `aria-selected` on this same static-prop
    // render — same reasoning `SourceControl.unit.test.tsx`'s own cross-link test gives for
    // asserting on the resulting URL instead. `navigate()` really drives `history.pushState` (not
    // mocked), so this is a real click reaching a real handler, not a spy that could pass unwired.
    await user.click(tab);
    expect(window.location.pathname).toBe("/admin/providers");
    expect(window.location.search).toBe("?tab=mcp-server");
  });
});

describe("Providers — MCP Server tab body: honest, not a dead install command", () => {
  it("never renders the fake /path/to/cli.js install command", () => {
    renderPage("mcp-server");
    expect(screen.queryByText(/path\/to\/cli\.js/)).not.toBeInTheDocument();
  });

  it("renders no Copy button and no client picker — nothing to copy or choose a client for", () => {
    renderPage("mcp-server");
    expect(screen.queryByRole("button", { name: "Copy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /client/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("tells the operator plainly that there is nothing to install yet", () => {
    renderPage("mcp-server");
    expect(screen.getByText("Not available yet.")).toBeInTheDocument();
    expect(
      screen.getByText("There's nothing to install here yet — this tab isn't connected to anything."),
    ).toBeInTheDocument();
  });

  it("keeps the capabilities explanation of what this server will do", () => {
    renderPage("mcp-server");
    expect(screen.getByText("What this server can do")).toBeInTheDocument();
    expect(screen.getByText("Read your project files")).toBeInTheDocument();
  });
});
