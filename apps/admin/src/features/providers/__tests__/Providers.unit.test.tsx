import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

import { FetchQueryProvider } from "@/lib/fetch-query";

import { Providers } from "../Providers";
import type { ProvidersController } from "../hooks/use-providers.hooks";

/**
 * @file `Providers.tsx` — MCP Server and Webhooks tabs, "Soon" and greyed-inert (owner call,
 * 2026-09-19, revised twice: first brief was "delete the fake install command," the owner's actual
 * ask was "keep the real content visible, grey it out, make it genuinely inert" — see
 * `ComingSoonPanel.tsx`'s own header). Composio/External MCP already have their own coverage
 * through `ComposioKeyField`/`ExternalMcpSettingsPanel`, untouched by this change.
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
  // for that panel directly.
  return render(
    <FetchQueryProvider>
      <Providers tabId={tabId} useProvidersHook={() => fixtureProviders()} />
    </FetchQueryProvider>,
  );
}

describe("Providers — tab strip: MCP Server and Webhooks tagged Soon, External MCP untouched", () => {
  afterEach(() => {
    // Same convention `SourceControl.unit.test.tsx` documents: `navigate()` drives real
    // `history.pushState`, so one test's click could otherwise leak into the next.
    window.history.replaceState(null, "", "/");
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

  it("keeps both tagged tabs fully clickable — Soon is a tag, not a disabled tab", async () => {
    const user = userEvent.setup();
    renderPage("external-mcp");
    const mcpTab = screen.getByRole("tab", { name: /MCP Server/ });
    expect(mcpTab).not.toBeDisabled();
    expect(mcpTab).not.toHaveAttribute("aria-disabled");

    await user.click(mcpTab);
    expect(window.location.search).toBe("?tab=mcp-server");
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

  it("wraps the real webhooks list in the shared genuinely-inert wrapper", () => {
    // `Integrations` fetches its own list on mount (no fixture hook wired here — this suite only
    // owns the wrapper contract, not the list's own load states, which are
    // `use-integrations.unit.test.tsx`'s job), so this asserts on the WRAPPER regardless of whether
    // the list has resolved to "Loading…" or real rows yet, rather than a button name that only
    // exists post-load.
    renderPage("webhooks");
    const inertWrap = document.querySelector(".settings-ui-inert-control");
    expect(inertWrap).not.toBeNull();
    expect(inertWrap).toHaveAttribute("inert");
    expect(inertWrap?.textContent).toBeTruthy();
  });
});
