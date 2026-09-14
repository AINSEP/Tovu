import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Plugins } from "../Plugins";

/**
 * @file `Plugins` screen — SPEC-005 REQ-12..18, AC-18..26, EC-11 (ui.spec.md), rebuilt onto the
 * row-based, tabbed (Installed/Downloaded/Marketplace) shape (2026-09-09). This rewrite REPLACES
 * the plain-`DataTable` version of this suite rather than deleting its coverage: every assertion
 * below carries forward the same requirement, adapted to where that fact now lives.
 *
 * What moved and why:
 *  - `role="table"`/`"row"` -> `role="tablist"`/`"tab"` for the tab bar, `role="listitem"` for a
 *    plugin row (a `<ul>` of `PluginRow`, not a table) — same adaptation
 *    `AgentPlugins.unit.test.tsx` made for its own sibling redesign the same night.
 *  - The single unified list split into Installed (`enabled: true` only) and Downloaded
 *    (unfiltered) tabs. AC-18's "every record, in API order" now applies to Downloaded specifically
 *    — Installed's own scope is a NEW assertion, not a renamed old one.
 *  - Quarantine (`automatic plugin quarantine`) and per-row `errors[]` (AC-24) moved from
 *    always-visible `DataTable` columns into the row's own expander — those tests now expand the
 *    row first.
 *  - The tier badge (AC-26) moved into the row's plain-text subline (`source · tier · status`) —
 *    asserted as that exact string instead of a separate `<span>`.
 *  - AC-19 ("activating Enable on a valid, disabled plugin") is NO LONGER REACHABLE through this
 *    screen's rendered UI: Installed only ever shows `enabled: true` rows (so its toggle only ever
 *    reads "Disable"), and Downloaded's own action slot is Remove, not a toggle (owner's explicit,
 *    repeated instruction — Downloaded showing the same switch as Installed was called out as
 *    redundant). The underlying `onToggleEnabled(plugin, {enabled:true})` codepath is unchanged and
 *    still directly covered in `use-plugins.hooks.unit.test.ts`; AC-19/AC-20/EC-11 below are
 *    redirected to the Disable direction, which IS still reachable (Installed's own toggle). This is
 *    a genuine screen-capability gap worth the owner's attention, not something silently patched
 *    around here — flagged in the handoff, not hidden by rewriting the scenario to look unchanged.
 *  - AC-21's "invisible toggle" branch (`pluginToggleControl`'s `visible: false` case, for an
 *    invalid+disabled plugin) is now unreachable via Installed-tab-only rendering (Installed
 *    pre-filters to `enabled: true`, which alone satisfies `pluginToggleControl`'s visibility
 *    condition). Covered instead by a direct function invocation in `plugins-rules.unit.test.ts`,
 *    per this workspace's "unreachable branch: delete vs. direct-invoke test" convention.
 *
 * New coverage this rewrite adds (not present in the pre-split suite): tab order/default, the
 * row-action split itself, the Remove confirm dialog gating the real `DELETE`, a built-in plugin's
 * honestly-disabled Remove, and `?tab=` deep-linking.
 */

const AC11_PLUGINS_RESPONSE = {
  plugins: [
    { id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", enabled: true, quarantine: null, errors: [] },
    {
      id: "invalid-site-plugin",
      name: "Invalid Site Plugin",
      version: "1.0.0",
      source: "site",
      tier: "tier-3",
      status: "invalid",
      enabled: false,
      quarantine: null,
      errors: [{ code: "HOOK_UNKNOWN", file: "tovu.plugin.json", message: "attaches to an undeclared hook point" }],
    },
    { id: "valid-site-plugin", name: "Valid Site Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `Plugins` also calls `useAdminLocale()` (real `fetch`, not this screen's own concern), which
  // would otherwise consume one of this file's strictly-ordered `mockResolvedValueOnce` slots and
  // shift every later assertion by one call. Routed to a fixed default-locale response outside
  // `fetchMock`'s own call queue, so `fetchMock.mock.calls` still holds exactly this screen's own
  // requests, in the order each test already expects.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  // `navigate()` drives real `history.pushState` — same cleanup convention `Security.unit.test.tsx`
  // uses, so one test's tab click never leaks into the next.
  window.history.replaceState(null, "", "/");
});

describe("tabs: Installed, Downloaded, Marketplace, in that order, Installed active by default", () => {
  it("renders exactly those three tabs in that order, with Installed selected", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    const tablist = await screen.findByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Installed", "Downloaded", "Marketplace"]);
    expect(within(tablist).getByRole("tab", { name: "Installed" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Installed tab scope: plugin.enabled === true only", () => {
  it("shows only the enabled row by default", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    await screen.findByRole("tablist");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem", { name: "Word Count" })).toBeInTheDocument();
  });
});

describe("REQ-12/AC-18: Downloaded tab renders every PLUGINS_LIST record, unfiltered, in API order", () => {
  it("renders exactly 3 rows in the order the endpoint returns them (TB-01, no client re-sort)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    // `tabId="downloaded"` rather than clicking the tab: `Plugins`'s active tab is a CONTROLLED prop
    // sourced from the URL (`panels.tsx`'s `ctx.query.get("tab")`) — clicking a tab in production
    // calls `navigate()` and the app's router re-invokes `render(ctx)` with the new query, but a
    // bare `render(<Plugins />)` in a unit test has no such router wrapping it, so a click alone
    // never changes which tab this component itself thinks is active. `Security.unit.test.tsx`'s
    // own suite draws the identical line: its click test asserts only `window.location`, and its
    // per-tab content tests render fresh with a `tabId` prop instead of clicking through.
    render(<Plugins tabId="downloaded" />);

    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("Word Count")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Invalid Site Plugin")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Valid Site Plugin")).toBeInTheDocument();
  });
});

describe("row-action split: Installed carries the toggle, Downloaded carries Remove (enabled row) or Enable (disabled row)", () => {
  it("Installed's row shows the Enable/Disable toggle and no Remove/Enable action", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    const row = await screen.findByRole("listitem", { name: "Word Count" });
    expect(within(row).getByRole("button", { name: "Disable Word Count" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Enable/ })).not.toBeInTheDocument();
  });

  it("Downloaded's row for an ENABLED plugin shows Remove and no Enable", async () => {
    const response = {
      plugins: [
        { id: "site-plugin-enabled", name: "Site Plugin Enabled", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: true, quarantine: null, errors: [] },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));
    render(<Plugins tabId="downloaded" />);

    const row = await screen.findByRole("listitem", { name: "Site Plugin Enabled" });
    expect(within(row).getByRole("button", { name: "Remove Site Plugin Enabled" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Enable/ })).not.toBeInTheDocument();
  });

  it("Downloaded's row for a DISABLED plugin shows Enable and no Remove — the re-enable path this fix adds", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins tabId="downloaded" />);

    // "Valid Site Plugin" is enabled: false in the fixture.
    const row = await screen.findByRole("listitem", { name: "Valid Site Plugin" });
    expect(within(row).getByRole("button", { name: "Enable Valid Site Plugin" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it("clicking Enable on a disabled Downloaded row PATCHes {enabled:true} directly, with no confirm dialog", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE)) // initial GET
      .mockResolvedValueOnce(
        jsonResponse({ plugin: { id: "valid-site-plugin", version: "1.0.0", enabled: true, updatedAt: "now" }, changeSetId: "cs-2" }),
      ) // PATCH
      .mockResolvedValueOnce(
        jsonResponse({ plugins: AC11_PLUGINS_RESPONSE.plugins.map((p) => (p.id === "valid-site-plugin" ? { ...p, enabled: true } : p)) }),
      ); // re-fetch GET

    render(<Plugins tabId="downloaded" />);
    const row = await screen.findByRole("listitem", { name: "Valid Site Plugin" });
    const button = within(row).getByRole("button", { name: "Enable Valid Site Plugin" });

    await user.click(button);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(String(patchCall![1].body))).toEqual({ enabled: true });

    await waitFor(() => {
      expect(within(screen.getByRole("listitem", { name: "Valid Site Plugin" })).getByRole("button", { name: "Remove Valid Site Plugin" })).toBeInTheDocument();
    });
  });
});

describe("REQ-15/AC-23: loading and error states", () => {
  it("shows a loading notice while the initial fetch is in flight, no tabs yet", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<Plugins />);
    expect(await screen.findByText(/loading plugins/i)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows an error notice instead of any tab when the initial fetch rejects, with no partial/stale data", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    render(<Plugins />);

    expect(await screen.findByText(/network down|failed/i)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("REQ-14/AC-22: Downloaded shows its own empty-state notice instead of an empty list when zero plugins are returned", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ plugins: [] }));
    render(<Plugins tabId="downloaded" />);

    expect(await screen.findByText(/no plugins installed/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("Installed shows its own honest empty note when nothing is enabled", async () => {
    const allDisabled = { plugins: AC11_PLUGINS_RESPONSE.plugins.map((p) => ({ ...p, enabled: false })) };
    fetchMock.mockResolvedValueOnce(jsonResponse(allDisabled));
    render(<Plugins />);

    expect(await screen.findByText(/no plugins are enabled for this site/i)).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("Downloaded still lists every plugin while Installed has nothing enabled — the same fixture, two independent renders", async () => {
    const allDisabled = { plugins: AC11_PLUGINS_RESPONSE.plugins.map((p) => ({ ...p, enabled: false })) };
    fetchMock.mockResolvedValueOnce(jsonResponse(allDisabled));
    render(<Plugins tabId="downloaded" />);

    expect(await screen.findAllByRole("listitem")).toHaveLength(3);
  });
});

describe("REQ-16/AC-24: per-row inline error display, now inside the row's own expander", () => {
  it("an invalid plugin's own errors[] (code + message) are hidden until the row is expanded, then shown", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins tabId="downloaded" />);

    const row = await screen.findByRole("listitem", { name: "Invalid Site Plugin" });
    expect(within(row).getByText(/HOOK_UNKNOWN/)).not.toBeVisible();

    await user.click(within(row).getByRole("button", { name: /^Invalid Site Plugin/ }));
    expect(within(row).getByText(/HOOK_UNKNOWN/)).toBeVisible();
    expect(within(row).getByText(/attaches to an undeclared hook point/)).toBeVisible();

    // A valid row's errors[] is empty — nothing should render for it.
    const validRow = screen.getByRole("listitem", { name: "Valid Site Plugin" });
    expect(within(validRow).queryByText(/HOOK_UNKNOWN/)).not.toBeInTheDocument();
  });
});

describe("automatic plugin quarantine", () => {
  it("shows the durable reason/count inside the row's expander", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        plugins: AC11_PLUGINS_RESPONSE.plugins.map((plugin) =>
          plugin.id === "word-count"
            ? {
                ...plugin,
                enabled: false,
                quarantine: {
                  at: "2026-08-12T12:00:00.000Z",
                  reason: "plugin 'word-count' content.entry.beforeSave filter failed: save blocker",
                  consecutiveFailures: 3,
                },
              }
            : plugin,
        ),
      }),
    );

    render(<Plugins tabId="downloaded" />);
    const row = await screen.findByRole("listitem", { name: "Word Count" });
    await user.click(within(row).getByRole("button", { name: /^Word Count/ }));

    expect(within(row).getByText("Quarantined after 3 consecutive failures")).toBeVisible();
    expect(within(row).getByText(/save blocker/)).toBeVisible();
    // Word Count is now quarantined AND disabled: it no longer appears on Installed (enabled-only).
    // Downloaded's row-state split (2026-09-10 fix) gives a disabled row Enable regardless of
    // `source` — unlike Remove, re-enabling isn't destructive, so a built-in row gets the same
    // direct control a site-sourced one would. This is the re-enable path that was previously
    // entirely missing for a quarantined plugin.
    expect(within(row).getByRole("button", { name: "Enable Word Count" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
  });
});

describe("REQ-18/AC-26: row subline shows source · tier · status verbatim, not hardcoded", () => {
  it("each row's subline reflects that record's own source/tier/status", async () => {
    const response = {
      plugins: [
        { id: "tier-one-plugin", name: "Tier One Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] },
        { id: "tier-two-plugin", name: "Tier Two Plugin", version: "1.0.0", source: "site", tier: "tier-2", status: "invalid", enabled: false, quarantine: null, errors: [] },
        { id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", enabled: true, quarantine: null, errors: [] },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(response));
    render(<Plugins tabId="downloaded" />);

    await screen.findAllByRole("listitem");
    expect(within(screen.getByRole("listitem", { name: "Tier One Plugin" })).getByText("site · tier-1 · valid")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Tier Two Plugin" })).getByText("site · tier-2 · invalid")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "Word Count" })).getByText("built-in · tier-3 · valid")).toBeInTheDocument();
  });
});

describe("REQ-13/AC-19/AC-20/EC-11: Installed's toggle interaction — redirected to the Disable direction (see this file's own header for why Enable is not reachable here)", () => {
  it("activating Disable on Word Count PATCHes {enabled:false}, shows in-flight, re-fetches, and the row leaves Installed", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE)) // initial GET
      .mockResolvedValueOnce(jsonResponse({ plugin: { id: "word-count", version: "1.0.0", enabled: false, updatedAt: "now" }, changeSetId: "cs-1" })) // PATCH
      .mockResolvedValueOnce(
        jsonResponse({ plugins: AC11_PLUGINS_RESPONSE.plugins.map((p) => (p.id === "word-count" ? { ...p, enabled: false } : p)) }),
      ); // re-fetch GET

    render(<Plugins />);
    const row = await screen.findByRole("listitem", { name: "Word Count" });
    const button = within(row).getByRole("button", { name: "Disable Word Count" });

    await user.click(button);

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(String(patchCall![1].body))).toEqual({ enabled: false });

    await waitFor(() => {
      expect(screen.queryByRole("listitem", { name: "Word Count" })).not.toBeInTheDocument();
      expect(screen.getByText(/no plugins are enabled for this site/i)).toBeInTheDocument();
    });
  });

  it("a non-2xx PATCH response shows an error, leaves the row on Installed unchanged, and returns the control to normal (re-clickable)", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ error: "This plugin failed validation and cannot be enabled.", code: "PLUGIN_INVALID" }, 422));

    render(<Plugins />);
    const row = await screen.findByRole("listitem", { name: "Word Count" });
    const button = within(row).getByRole("button", { name: "Disable Word Count" });

    await user.click(button);

    expect(await screen.findByText(/failed validation and cannot be enabled/i)).toBeInTheDocument();

    const stillRow = screen.getByRole("listitem", { name: "Word Count" });
    const stillButton = within(stillRow).getByRole("button", { name: "Disable Word Count" });
    expect(stillButton).toBeInTheDocument();
    expect(stillButton).not.toBeDisabled();
  });

  it("EC-11: a second click on the same row's toggle before the first request resolves does not send a second PATCH", async () => {
    const user = userEvent.setup();
    let resolvePatch!: (value: Response) => void;
    const patchPromise = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE)).mockImplementationOnce(() => patchPromise);

    render(<Plugins />);
    const row = await screen.findByRole("listitem", { name: "Word Count" });
    const button = within(row).getByRole("button", { name: "Disable Word Count" });

    await user.click(button);
    await user.click(button); // must be a no-op — the button is now disabled/in-flight

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0]![1]?.headers as Record<string, string> | undefined).not.toHaveProperty("Idempotency-Key");

    resolvePatch(jsonResponse({ plugin: { id: "word-count", version: "1.0.0", enabled: false, updatedAt: "now" }, changeSetId: "cs-1" }));
  });
});

describe("Downloaded tab: Remove is gated behind a confirm dialog before the real DELETE call fires", () => {
  // Remove only ever shows for an ENABLED row (a disabled one shows Enable instead — see the
  // row-action-split describe block above), so these two tests need "Valid Site Plugin" enabled,
  // unlike the base AC11 fixture. Built locally rather than mutating AC11_PLUGINS_RESPONSE itself:
  // other tests in this file rely on that fixture's "Valid Site Plugin" staying disabled (e.g. the
  // Installed-tab-scope test's "exactly one enabled row" count).
  const enabledSitePluginResponse = {
    plugins: AC11_PLUGINS_RESPONSE.plugins.map((p) => (p.id === "valid-site-plugin" ? { ...p, enabled: true } : p)),
  };

  it("opens a confirm dialog naming the plugin and does not call DELETE until Confirm is pressed", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(enabledSitePluginResponse));
    render(<Plugins tabId="downloaded" />);

    const row = await screen.findByRole("listitem", { name: "Valid Site Plugin" });
    await user.click(within(row).getByRole("button", { name: "Remove Valid Site Plugin" }));

    const dialog = screen.getByRole("dialog", { name: 'Remove "Valid Site Plugin" from this site?' });
    expect(within(dialog).getByText(/deletes the plugin's files from this site/)).toBeInTheDocument();
    expect(within(dialog).getByText(/cannot be undone/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ pluginId: "valid-site-plugin", clearedWorkspaceIds: [] }))
      .mockResolvedValueOnce(jsonResponse({ plugins: enabledSitePluginResponse.plugins.filter((p) => p.id !== "valid-site-plugin") }));

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(deleteCall).toBeTruthy();
      expect(String(deleteCall![0])).toContain("/plugins/valid-site-plugin");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Valid Site Plugin" })).not.toBeInTheDocument());
  });

  it("Cancel closes the dialog without ever calling DELETE", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(enabledSitePluginResponse));
    render(<Plugins tabId="downloaded" />);

    const row = await screen.findByRole("listitem", { name: "Valid Site Plugin" });
    await user.click(within(row).getByRole("button", { name: "Remove Valid Site Plugin" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    // The row itself is untouched.
    expect(screen.getByRole("listitem", { name: "Valid Site Plugin" })).toBeInTheDocument();
  });

  it("a built-in plugin's Remove is honestly disabled, with the reason reaching the accessibility tree", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins tabId="downloaded" />);

    const row = await screen.findByRole("listitem", { name: "Word Count" });
    const removeBtn = within(row).getByRole("button", { name: "Remove Word Count — unavailable" });

    expect(removeBtn).toBeDisabled();
    // A disabled control is not focusable, so the WHY has to reach the accessibility tree some
    // other way — a described-by pointing at the section's own visible note.
    expect(removeBtn).toHaveAccessibleDescription(/ship with Tovu itself/);
  });
});

describe("?tab= deep-linking (ADR-063's shared idiom, same as Security.tsx/Database.tsx)", () => {
  it("falls back to Installed for an absent or unrecognized ?tab= value", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins tabId="not-a-real-tab" />);
    expect(await screen.findByRole("tab", { name: "Installed" })).toHaveAttribute("aria-selected", "true");
  });

  it("selects the tab named by a recognized ?tab= value", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins tabId="downloaded" />);
    expect(await screen.findByRole("tab", { name: "Downloaded" })).toHaveAttribute("aria-selected", "true");
  });

  it("switching tabs calls navigate with the right query string", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    await user.click(await screen.findByRole("tab", { name: "Downloaded" }));
    expect(window.location.pathname).toBe("/admin/plugins");
    expect(window.location.search).toBe("?tab=downloaded");
  });
});

describe("each tab renders only its own panel (characterization)", () => {
  it("Marketplace shows its designed empty state, with no plugin rows and no other tab's copy", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins tabId="marketplace" />);

    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("Nothing to browse yet");
    expect(note).toHaveTextContent("Install a plugin by placing its files in this site's plugin install directory.");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.queryByText(/Built-in plugins ship with Tovu itself/)).not.toBeInTheDocument();
    expect(screen.queryByText(/no plugins are enabled for this site/i)).not.toBeInTheDocument();
  });

  it("Installed shows neither Downloaded's built-in note nor Marketplace's empty state", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    await screen.findByRole("listitem", { name: "Word Count" });
    expect(screen.queryByText(/Built-in plugins ship with Tovu itself/)).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing to browse yet")).not.toBeInTheDocument();
  });

  it("Downloaded's built-in note accompanies only a non-empty list", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ plugins: [] }));
    render(<Plugins tabId="downloaded" />);

    expect(await screen.findByText(/no plugins installed/i)).toBeInTheDocument();
    expect(screen.queryByText(/Built-in plugins ship with Tovu itself/)).not.toBeInTheDocument();
  });
});

describe("package-files viewer: a row's eye button opens it (characterization)", () => {
  it("opens the viewer named for the plugin, selects another file, and closes", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE)).mockResolvedValueOnce(
      jsonResponse({
        pluginId: "word-count",
        source: "built-in",
        files: [
          { relativePath: "tovu.plugin.json", sizeBytes: 2, content: "{}", omitted: null },
          { relativePath: "index.mjs", sizeBytes: 18, content: "export default {};", omitted: null },
        ],
        truncated: false,
        limits: { maxFiles: 200, maxEntries: 2000, maxFileBytes: 524288, maxTotalBytes: 4194304 },
      }),
    );
    render(<Plugins />);

    const row = await screen.findByRole("listitem", { name: "Word Count" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Inspect package files — Word Count" }));

    const dialog = await screen.findByRole("dialog", { name: /Word Count package files/ });
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/plugins/word-count/files");
    const nav = await within(dialog).findByRole("navigation", { name: "Package files" });
    await user.click(within(nav).getByRole("button", { name: "index.mjs" }));
    expect(within(dialog).getByRole("heading", { name: "index.mjs" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /close/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Accessibility (React Component Testing Policy)", () => {
  it("the plugin list renders as a semantic list with an accessible toggle button per row", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    const row = await screen.findByRole("listitem", { name: "Word Count" });
    expect(within(row).getByRole("button", { name: /disable/i })).toBeInTheDocument();
  });

  it("the row's subline is visible text, not color alone — status is always rendered as text", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins tabId="downloaded" />);

    const invalidRow = await screen.findByRole("listitem", { name: "Invalid Site Plugin" });
    expect(within(invalidRow).getByText(/invalid/)).toBeInTheDocument();
  });
});
