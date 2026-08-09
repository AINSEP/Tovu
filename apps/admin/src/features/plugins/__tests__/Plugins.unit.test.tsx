import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Plugins } from "../Plugins";

/**
 * @file `Plugins` screen — SPEC-005 REQ-12..17, AC-18..25, EC-11, ui.spec.md (main 1.1.1 pass);
 * REQ-18/AC-26 (1.1.2 addendum, resolves RT-010 — see the dedicated `describe` block below).
 *
 * RT-009 fixture note: this file's mocked `GET .../plugins` response mirrors the SAME AC-11/AC-18
 * shared fixture shape used by the backend's `discovery.integration.test.ts`/
 * `plugins-http.integration.test.ts` (built-in `word-count` + one valid + one invalid site
 * plugin) — duplicated here as a literal JSON shape rather than a cross-package import, since
 * `apps/admin` is a separate package with its own module resolution and has no path alias into
 * `src/features/plugin-runtime`. The "valid" site plugin's manifest would carry `tier: "tier-3"`
 * on the backend (RT-009); this `AC11_PLUGINS_RESPONSE` fixture omits `tier` entirely, which is
 * fine for what IT tests (id/name/version/source/status/enabled/errors, REQ-12/AC-18) — the 1.1.2
 * addendum below uses its own separate, varied-tier fixture rather than retrofitting `tier` onto
 * this one, since AC-26 specifically requires proving non-tier-3 values render correctly, which a
 * uniform tier-3 fixture could never distinguish from a hardcoded implementation.
 *
 * TDD-certified against the stub in `../Plugins.tsx`; currently RED — the component throws "not
 * implemented" on every render. These assertions describe the contract the Programmer stage must
 * satisfy. This is the FIRST RTL-based component test in `apps/admin` (first-ever test harness for
 * this package, added this dispatch).
 */

const AC11_PLUGINS_RESPONSE = {
  plugins: [
    { id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", status: "valid", enabled: true, errors: [] },
    {
      id: "invalid-site-plugin",
      name: "Invalid Site Plugin",
      version: "1.0.0",
      source: "site",
      status: "invalid",
      enabled: false,
      errors: [{ code: "HOOK_UNKNOWN", file: "tovu.plugin.json", message: "attaches to an undeclared hook point" }],
    },
    { id: "valid-site-plugin", name: "Valid Site Plugin", version: "1.0.0", source: "site", status: "valid", enabled: false, errors: [] },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `Plugins` now also calls `useAdminLocale()` (real `fetch`, not this screen's own concern), which
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
});

describe("REQ-12/AC-18: renders every PLUGINS_LIST record in API response order", () => {
  it("renders exactly 3 rows with id/name/version/source/status/enabled, in the order the endpoint returns them (TB-01, no client re-sort)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));

    render(<Plugins />);

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row").slice(1); // drop the header row
    expect(rows).toHaveLength(3);

    // TB-01 order: built-ins first (id asc), then site plugins (id asc) — exactly the order the
    // mocked response returns them, since this screen must never re-sort/re-group client-side.
    expect(within(rows[0]).getByText("Word Count")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Invalid Site Plugin")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Valid Site Plugin")).toBeInTheDocument();
  });
});

describe("REQ-15/AC-23: loading and error states", () => {
  it("shows a loading notice while the initial fetch is in flight", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<Plugins />);
    expect(await screen.findByText(/loading plugins/i)).toBeInTheDocument();
  });

  it("shows an error notice instead of a table when the initial fetch rejects, with no partial/stale data", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    render(<Plugins />);

    expect(await screen.findByText(/network down|failed/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("REQ-14/AC-22: empty state", () => {
  it("renders an empty-state notice instead of an empty <table> when zero plugins are returned", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ plugins: [] }));
    render(<Plugins />);

    expect(await screen.findByText(/no plugins installed/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("REQ-16/AC-24: per-row inline error display", () => {
  it("renders an invalid plugin's own errors[] (code + message) inline on its own row", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    const table = await screen.findByRole("table");
    const invalidRow = within(table).getByText("Invalid Site Plugin").closest("tr")!;
    expect(within(invalidRow).getByText(/HOOK_UNKNOWN/)).toBeInTheDocument();
    expect(within(invalidRow).getByText(/attaches to an undeclared hook point/)).toBeInTheDocument();

    // A valid row's errors[] is empty — nothing should render for it.
    const validRow = within(table).getByText("Word Count").closest("tr")!;
    expect(within(validRow).queryByText(/HOOK_UNKNOWN/)).not.toBeInTheDocument();
  });
});

describe("REQ-18/AC-26 (1.1.2): per-row trust-tier badge", () => {
  // Small addition alongside the rest of this certified suite (SPEC-005 1.1.2, resolves RT-010).
  // Synthetic fixture with THREE DIFFERENT `tier` values, exactly as AC-26 explicitly permits ("no
  // shipped v1 manifest other than tier-3 need exist for this test") — the point is proving each
  // row renders that record's OWN tier, not a value that happens to always be "tier-3" across the
  // fixture (which is all `AC11_PLUGINS_RESPONSE` above would ever exercise, since real v1 data is
  // tier-3-only per REQ-01's v1 boundary call).
  const TIER_BADGE_RESPONSE = {
    plugins: [
      { id: "tier-one-plugin", name: "Tier One Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, errors: [] },
      { id: "tier-two-plugin", name: "Tier Two Plugin", version: "1.0.0", source: "site", tier: "tier-2", status: "valid", enabled: false, errors: [] },
      { id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", enabled: true, errors: [] },
    ],
  };

  it("AC-26: each row's tier badge shows that record's own tier value verbatim — not hardcoded to tier-3", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(TIER_BADGE_RESPONSE));
    render(<Plugins />);

    const table = await screen.findByRole("table");

    const tierOneRow = within(table).getByText("Tier One Plugin").closest("tr")!;
    expect(within(tierOneRow).getByText("tier-1")).toBeInTheDocument();
    // Guards specifically against a hardcoded badge: this row's tier is tier-1, so "tier-3" must
    // never appear on it.
    expect(within(tierOneRow).queryByText("tier-3")).not.toBeInTheDocument();

    const tierTwoRow = within(table).getByText("Tier Two Plugin").closest("tr")!;
    expect(within(tierTwoRow).getByText("tier-2")).toBeInTheDocument();

    const tierThreeRow = within(table).getByText("Word Count").closest("tr")!;
    expect(within(tierThreeRow).getByText("tier-3")).toBeInTheDocument();
  });
});

describe("REQ-13/AC-19/AC-20: enable/disable toggle interaction", () => {
  it("AC-19: activating 'Enable' on a valid, disabled plugin PATCHes {enabled:true}, shows an in-flight state, then re-fetches and shows enabled:true on 200", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE)) // initial GET
      .mockResolvedValueOnce(
        jsonResponse({ plugin: { id: "valid-site-plugin", version: "1.0.0", enabled: true, updatedAt: "now" }, changeSetId: "cs-1" })
      ) // PATCH
      .mockResolvedValueOnce(
        jsonResponse({
          plugins: AC11_PLUGINS_RESPONSE.plugins.map((p) => (p.id === "valid-site-plugin" ? { ...p, enabled: true } : p)),
        })
      ); // re-fetch GET

    render(<Plugins />);
    const table = await screen.findByRole("table");
    const row = within(table).getByText("Valid Site Plugin").closest("tr")!;
    const button = within(row).getByRole("button", { name: /enable/i });

    await user.click(button);

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall).toBeTruthy();
    expect(JSON.parse(String(patchCall![1].body))).toEqual({ enabled: true });

    await waitFor(() => {
      const refreshedRow = within(screen.getByRole("table")).getByText("Valid Site Plugin").closest("tr")!;
      expect(within(refreshedRow).getByRole("button", { name: /disable/i })).toBeInTheDocument();
    });
  });

  it("AC-20: a non-2xx PATCH response shows an error, leaves the row's enabled value unchanged, and returns the control to normal (re-clickable)", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ error: "This plugin failed validation and cannot be enabled.", code: "PLUGIN_INVALID" }, 422));

    render(<Plugins />);
    const table = await screen.findByRole("table");
    const row = within(table).getByText("Valid Site Plugin").closest("tr")!;
    const button = within(row).getByRole("button", { name: /enable/i });

    await user.click(button);

    expect(await screen.findByText(/failed validation and cannot be enabled/i)).toBeInTheDocument();

    const refreshedRow = within(screen.getByRole("table")).getByText("Valid Site Plugin").closest("tr")!;
    expect(within(refreshedRow).getByRole("button", { name: /enable/i })).toBeInTheDocument(); // unchanged, re-clickable
    expect(within(refreshedRow).getByRole("button", { name: /enable/i })).not.toBeDisabled();
  });

  it("EC-11: a second click on the same row's toggle before the first request resolves does not send a second PATCH (client-side single-flight, no Idempotency-Key sent)", async () => {
    const user = userEvent.setup();
    let resolvePatch!: (value: Response) => void;
    const patchPromise = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE))
      .mockImplementationOnce(() => patchPromise);

    render(<Plugins />);
    const table = await screen.findByRole("table");
    const row = within(table).getByText("Valid Site Plugin").closest("tr")!;
    const button = within(row).getByRole("button", { name: /enable/i });

    await user.click(button);
    // The button must now be disabled/in-flight — a second click must be a no-op (EC-11).
    await user.click(button);

    const patchCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toHaveLength(1);
    expect(patchCalls[0][1]?.headers as Record<string, string> | undefined).not.toHaveProperty("Idempotency-Key");

    resolvePatch(jsonResponse({ plugin: { id: "valid-site-plugin", version: "1.0.0", enabled: true, updatedAt: "now" }, changeSetId: "cs-1" }));
  });
});

describe("REQ-13/AC-21: invalid/incompatible rows never offer an enable-capable control, but a disable path always remains", () => {
  it("AC-21: a status:'invalid', enabled:false row offers no control that can request enabled:true", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    const table = await screen.findByRole("table");
    const invalidRow = within(table).getByText("Invalid Site Plugin").closest("tr")!;
    expect(within(invalidRow).queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
  });

  it("AC-21: a row with enabled:true always offers a working Disable control, regardless of status", async () => {
    const responseWithEnabledInvalid = {
      plugins: AC11_PLUGINS_RESPONSE.plugins.map((p) => (p.id === "invalid-site-plugin" ? { ...p, enabled: true } : p)),
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(responseWithEnabledInvalid));
    render(<Plugins />);

    const table = await screen.findByRole("table");
    const invalidRow = within(table).getByText("Invalid Site Plugin").closest("tr")!;
    const disableButton = within(invalidRow).getByRole("button", { name: /disable/i });
    expect(disableButton).toBeInTheDocument();
    expect(disableButton).not.toBeDisabled();
  });
});

describe("Accessibility (React Component Testing Policy)", () => {
  it("the plugin list renders as a semantic table with an accessible toggle button per row", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    const table = await screen.findByRole("table");
    expect(table).toBeInTheDocument();
    const row = within(table).getByText("Word Count").closest("tr")!;
    expect(within(row).getByRole("button", { name: /disable/i })).toBeInTheDocument();
  });

  it("status is conveyed by visible text, not color alone — the status string itself is always rendered", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(AC11_PLUGINS_RESPONSE));
    render(<Plugins />);

    const table = await screen.findByRole("table");
    const invalidRow = within(table).getByText("Invalid Site Plugin").closest("tr")!;
    expect(within(invalidRow).getByText("invalid")).toBeInTheDocument();
  });
});
